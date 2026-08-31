#!/usr/bin/env node

import { watch } from "chokidar";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_DEBOUNCE_MS = 30_000;
const DEBOUNCE_MS = process.env.VAULTSYNC_TEST_DEBOUNCE_MS
  ? Math.max(Number(process.env.VAULTSYNC_TEST_DEBOUNCE_MS), 1)
  : DEFAULT_DEBOUNCE_MS;
const PULL_INTERVAL_MS = 5 * 60_000;
const STATE_DIRECTORY = ".vaultsync";
const STATE_FILE = "state.json";
const LOG_FILE = "vaultsync.log";
const LOCK_FILE = "sync.lock";
const MAX_LOG_BYTES = 512 * 1024;
const CONFLICT_LIMIT = 50;
const LOCAL_ONLY_PATHS = new Set([".git", STATE_DIRECTORY, ".trash", ".scratch"]);
const LIBRARY_SETTINGS = path.join("Spell Library", "settings.json");

class VaultsyncError extends Error {}

function usage() {
  return `
vaultsync — Git-based sync for a Spell Markdown vault

Usage:
  vaultsync init --vault <folder> --remote <private-github-url>
  vaultsync watch [--vault <folder>]
  vaultsync sync [--vault <folder>]
  vaultsync status [--vault <folder>]
  vaultsync install-service [--vault <folder>]
  vaultsync uninstall-service [--vault <folder>]

The vault defaults to $SPELL_VAULT, then the current directory.
`;
}

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    vault: process.env.SPELL_VAULT || process.cwd(),
    remote: undefined,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--vault" || argument === "--remote") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new VaultsyncError(`${argument} needs a value.`);
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") return { command: "help", options };
    throw new VaultsyncError(`Unknown option: ${argument}`);
  }

  return { command, options };
}

function nowIso() {
  return new Date().toISOString();
}

function currentDate() {
  return nowIso().slice(0, 10);
}

function redacted(value) {
  return String(value)
    .replace(/https:\/\/[^\s/@:]+:[^\s/@]+@/g, "https://***@")
    .replace(/(?:github_pat|ghp|gho|ghu|ghs)_[A-Za-z0-9_]+/g, "***");
}

function errorMessage(error) {
  return redacted(error instanceof Error ? error.message : String(error));
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveVault(input) {
  const vault = path.resolve(input);
  let vaultStats;
  try {
    vaultStats = await stat(vault);
  } catch {
    throw new VaultsyncError(`Vault folder does not exist: ${vault}`);
  }
  if (!vaultStats.isDirectory()) {
    throw new VaultsyncError(`Vault path is not a folder: ${vault}`);
  }
  return realpath(vault);
}

function pathInVault(vault, relativePath) {
  const target = path.resolve(vault, relativePath);
  if (target !== vault && !target.startsWith(`${vault}${path.sep}`)) {
    throw new VaultsyncError(`Refusing a path outside the vault: ${relativePath}`);
  }
  return target;
}

function statePath(vault) {
  return path.join(vault, STATE_DIRECTORY, STATE_FILE);
}

function logPath(vault) {
  return path.join(vault, STATE_DIRECTORY, LOG_FILE);
}

function lockPath(vault) {
  return path.join(vault, STATE_DIRECTORY, LOCK_FILE);
}

async function loadState(vault) {
  try {
    return JSON.parse(await readFile(statePath(vault), "utf8"));
  } catch {
    return {};
  }
}

async function saveState(context) {
  const directory = path.join(context.vault, STATE_DIRECTORY);
  await mkdir(directory, { recursive: true });
  await writeFile(statePath(context.vault), `${JSON.stringify(context.state, null, 2)}\n`, "utf8");
}

async function appendLog(context, message) {
  const directory = path.join(context.vault, STATE_DIRECTORY);
  const target = logPath(context.vault);
  const line = `${nowIso()} ${redacted(message)}\n`;
  await mkdir(directory, { recursive: true });

  try {
    const details = await stat(target);
    if (details.size > MAX_LOG_BYTES) {
      const content = await readFile(target, "utf8");
      await writeFile(target, content.slice(-Math.floor(MAX_LOG_BYTES / 2)), "utf8");
    }
  } catch {
    // The first write creates the log. Logging must never block a sync.
  }

  await writeFile(target, line, { encoding: "utf8", flag: "a" });
}

function emit(context, message) {
  if (!context.quiet) process.stdout.write(`${message}\n`);
}

async function parseTokenFile(vault) {
  const target = path.join(vault, STATE_DIRECTORY, ".env");
  try {
    const content = await readFile(target, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^GITHUB_TOKEN\s*=\s*(.*)$/);
      if (!match) continue;
      const value = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value) return value;
    }
  } catch {
    // A credential helper or SSH key is the normal path; no token file is required.
  }
  return undefined;
}

async function createGitEnvironment(vault) {
  const token = process.env.GITHUB_TOKEN || (await parseTokenFile(vault));
  const environment = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };
  let temporaryDirectory;

  if (token) {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "vaultsync-askpass-"));
    const askpass = path.join(temporaryDirectory, "askpass");
    await writeFile(
      askpass,
      "#!/bin/sh\ncase \"$1\" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *) printf '%s\\n' \"$VAULTSYNC_GITHUB_TOKEN\" ;;\nesac\n",
      "utf8",
    );
    await chmod(askpass, 0o700);
    environment.GIT_ASKPASS = askpass;
    environment.GIT_ASKPASS_REQUIRE = "force";
    environment.VAULTSYNC_GITHUB_TOKEN = token;
  }

  return {
    environment,
    async dispose() {
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

function runProcess(command, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

async function git(context, args, { allowFailure = false, extraEnv = {} } = {}) {
  const result = await runProcess("git", args, {
    cwd: context.vault,
    env: { ...context.environment, ...extraEnv },
  });
  if (result.code !== 0 && !allowFailure) {
    const output = Buffer.concat([result.stdout, result.stderr]).toString("utf8").trim();
    throw new VaultsyncError(`git ${args.join(" ")} failed${output ? `: ${redacted(output)}` : ""}`);
  }
  return result;
}

async function isGitRepository(context) {
  const result = await git(context, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  return result.code === 0 && result.stdout.toString("utf8").trim() === "true";
}

async function originUrl(context) {
  const result = await git(context, ["remote", "get-url", "origin"], { allowFailure: true });
  return result.code === 0 ? result.stdout.toString("utf8").trim() : undefined;
}

async function ensureRepository(context) {
  if (!(await isGitRepository(context))) {
    throw new VaultsyncError("This vault is not a Git repository. Run vaultsync init first, or clone the private repository.");
  }
  if (!(await originUrl(context))) {
    throw new VaultsyncError("This vault has no origin remote. Run vaultsync init with the private GitHub URL.");
  }
}

const GITIGNORE_ENTRIES = [
  ".obsidian/workspace*",
  ".trash/",
  ".scratch/",
  ".vaultsync/",
  "Spell Library/settings.json",
];

async function ensureVaultGitignore(context) {
  const target = path.join(context.vault, ".gitignore");
  const current = (await exists(target)) ? await readFile(target, "utf8") : "";
  const missing = GITIGNORE_ENTRIES.filter((entry) => !current.split(/\r?\n/).includes(entry));
  if (missing.length === 0) return false;

  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  const block = `# Device-local vault state\n${missing.join("\n")}\n`;
  await writeFile(target, `${current}${prefix}${block}`, "utf8");
  await appendLog(context, `Updated .gitignore with ${missing.join(", ")}.`);
  return true;
}

async function hasStagedChanges(context) {
  const result = await git(context, ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (result.code === 0) return false;
  if (result.code === 1) return true;
  throw new VaultsyncError("Unable to inspect staged vault changes.");
}

async function commitPendingChanges(context, reason) {
  const status = await git(context, ["status", "--porcelain", "-z"]);
  if (status.stdout.length === 0) return false;

  await git(context, ["add", "-A"]);
  if (!(await hasStagedChanges(context))) return false;

  const message = `vaultsync: ${reason} ${nowIso().replace(/\.\d{3}Z$/, "Z")}`;
  await git(context, ["commit", "-m", message]);
  await appendLog(context, `Committed pending vault changes (${reason}).`);
  emit(context, "Committed pending vault changes.");
  return true;
}

async function rebaseInProgress(context) {
  const result = await git(context, ["rev-parse", "--git-dir"], { allowFailure: true });
  if (result.code !== 0) return false;
  const gitDirectory = result.stdout.toString("utf8").trim();
  const absoluteGitDirectory = path.isAbsolute(gitDirectory)
    ? gitDirectory
    : path.resolve(context.vault, gitDirectory);
  return (
    (await exists(path.join(absoluteGitDirectory, "rebase-merge"))) ||
    (await exists(path.join(absoluteGitDirectory, "rebase-apply")))
  );
}

async function unresolvedConflictStages(context) {
  const result = await git(context, ["ls-files", "-u", "-z"]);
  const stagedByPath = new Map();
  for (const entry of result.stdout.toString("utf8").split("\0")) {
    if (!entry) continue;
    const separator = entry.indexOf("\t");
    if (separator === -1) continue;
    const metadata = entry.slice(0, separator).split(" ");
    const stage = Number(metadata[2]);
    const relativePath = entry.slice(separator + 1);
    const stages = stagedByPath.get(relativePath) ?? new Set();
    stages.add(stage);
    stagedByPath.set(relativePath, stages);
  }
  return stagedByPath;
}

function isMarkdown(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return extension === ".md" || extension === ".markdown";
}

async function readConflictStage(context, stage, relativePath) {
  const result = await git(context, ["show", `:${stage}:${relativePath}`]);
  return result.stdout;
}

async function nextConflictPath(vault, relativePath) {
  const parsed = path.posix.parse(relativePath);
  const extension = parsed.ext || ".md";
  const baseName = `${parsed.name}.conflict-${currentDate()}`;
  let suffix = 0;

  while (true) {
    const name = `${baseName}${suffix === 0 ? "" : `-${suffix + 1}`}${extension}`;
    const candidate = path.posix.join(parsed.dir, name);
    if (!(await exists(pathInVault(vault, candidate)))) return candidate;
    suffix += 1;
  }
}

async function resolveMarkdownConflicts(context) {
  const conflicts = await unresolvedConflictStages(context);
  if (conflicts.size === 0) {
    throw new VaultsyncError("Git reported a rebase conflict, but no unresolved files were found.");
  }

  const unsupported = [...conflicts.entries()].filter(
    ([relativePath, stages]) => !isMarkdown(relativePath) || !stages.has(2) || !stages.has(3),
  );
  if (unsupported.length > 0) {
    const names = unsupported.map(([relativePath]) => relativePath).join(", ");
    throw new VaultsyncError(`Automatic conflict protection only handles modified Markdown notes. Manual review is required for: ${names}`);
  }

  for (const relativePath of conflicts.keys()) {
    const localVersion = await readConflictStage(context, 3, relativePath);
    const incomingVersion = await readConflictStage(context, 2, relativePath);
    const conflictPath = await nextConflictPath(context.vault, relativePath);
    const localTarget = pathInVault(context.vault, relativePath);
    const conflictTarget = pathInVault(context.vault, conflictPath);

    await mkdir(path.dirname(localTarget), { recursive: true });
    await mkdir(path.dirname(conflictTarget), { recursive: true });
    await writeFile(localTarget, localVersion);
    await writeFile(conflictTarget, incomingVersion, { flag: "wx" });
    context.protectedConflicts.push({ relativePath: conflictPath, content: incomingVersion });
    await git(context, ["add", "--", relativePath, conflictPath]);

    await appendLog(context, `Protected conflict: kept ${relativePath}; saved incoming version as ${conflictPath}.`);
    emit(context, `Conflict protected: ${conflictPath}`);
  }
}

async function abortRebase(context, reason) {
  const result = await git(context, ["rebase", "--abort"], { allowFailure: true });
  if (result.code === 0) {
    for (const conflict of context.protectedConflicts) {
      const target = pathInVault(context.vault, conflict.relativePath);
      if (!(await exists(target))) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, conflict.content, { flag: "wx" });
      }
    }
  }
  const suffix = result.code === 0 ? " The rebase was aborted; your local vault remains intact." : " Git could not abort cleanly; inspect the vault before continuing.";
  await appendLog(context, `${reason}.${suffix}`);
  throw new VaultsyncError(`${reason}.${suffix}`);
}

async function completeRebase(context) {
  for (let pass = 0; pass < CONFLICT_LIMIT; pass += 1) {
    await resolveMarkdownConflicts(context);
    const continued = await git(
      context,
      ["-c", "core.editor=true", "rebase", "--continue"],
      { allowFailure: true, extraEnv: { GIT_EDITOR: "true" } },
    );

    if (continued.code === 0 && !(await rebaseInProgress(context))) return;
    if (!(await rebaseInProgress(context))) {
      const output = Buffer.concat([continued.stdout, continued.stderr]).toString("utf8").trim();
      throw new VaultsyncError(`Unable to complete the protected rebase${output ? `: ${redacted(output)}` : ""}`);
    }
  }
  throw new VaultsyncError("Too many sequential rebase conflicts; stopped before risking the vault.");
}

async function pullWithRebase(context) {
  const result = await git(context, ["pull", "--rebase", "--no-autostash"], { allowFailure: true });
  if (result.code !== 0) {
    if (!(await rebaseInProgress(context))) {
      const output = Buffer.concat([result.stdout, result.stderr]).toString("utf8").trim();
      throw new VaultsyncError(`Pull with rebase failed${output ? `: ${redacted(output)}` : ""}`);
    }

    try {
      await completeRebase(context);
    } catch (error) {
      if (await rebaseInProgress(context)) await abortRebase(context, errorMessage(error));
      throw error;
    }
  }

  context.state.lastPullAt = nowIso();
  context.state.lastError = undefined;
  await saveState(context);
  await appendLog(context, "Pulled with rebase.");
  emit(context, "Pulled latest vault history.");
}

async function pushIfAhead(context) {
  const result = await git(context, ["rev-list", "--count", "@{upstream}..HEAD"], { allowFailure: true });
  if (result.code !== 0) {
    throw new VaultsyncError("The current branch has no upstream. Run vaultsync init, or set an upstream with git push -u origin <branch>.");
  }
  if (Number(result.stdout.toString("utf8").trim()) === 0) return false;

  await git(context, ["push"]);
  context.state.lastPushAt = nowIso();
  context.state.lastError = undefined;
  await saveState(context);
  await appendLog(context, "Pushed vault history.");
  emit(context, "Pushed vault history.");
  return true;
}

async function acquireLock(context) {
  const target = lockPath(context.vault);
  await mkdir(path.dirname(target), { recursive: true });

  try {
    const handle = await open(target, "wx");
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: nowIso() })}\n`);
    return async () => {
      await handle.close();
      await unlink(target).catch(() => {});
    };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let lock = {};
    try {
      lock = JSON.parse(await readFile(target, "utf8"));
    } catch {
      // A malformed lock is treated conservatively as active.
    }
    const owner = Number(lock.pid);
    if (Number.isInteger(owner) && owner > 0) {
      try {
        process.kill(owner, 0);
        throw new VaultsyncError(`Another vaultsync process is already working on this vault (PID ${owner}).`);
      } catch (ownerError) {
        if (ownerError instanceof VaultsyncError) throw ownerError;
      }
    }
    throw new VaultsyncError(`A stale or unreadable vaultsync lock exists at ${target}. Review it before removing it.`);
  }
}

async function syncVault(context, reason) {
  const release = await acquireLock(context);
  try {
    await ensureRepository(context);
    await commitPendingChanges(context, reason);
    await pullWithRebase(context);
    await pushIfAhead(context);
    context.state.lastSyncAt = nowIso();
    context.state.lastError = undefined;
    await saveState(context);
    await appendLog(context, `Sync complete (${reason}).`);
  } catch (error) {
    context.state.lastError = errorMessage(error);
    context.state.lastErrorAt = nowIso();
    await saveState(context);
    await appendLog(context, `Sync failed (${reason}): ${context.state.lastError}`);
    throw error;
  } finally {
    await release();
  }
}

async function initializeVault(context, remote) {
  if (!remote) throw new VaultsyncError("vaultsync init requires --remote <private-github-url>.");
  if (!(await isGitRepository(context))) {
    await git(context, ["init"]);
    await git(context, ["branch", "-M", "main"]);
  }

  await ensureVaultGitignore(context);
  const configuredRemote = await originUrl(context);
  if (configuredRemote && configuredRemote !== remote) {
    throw new VaultsyncError("This vault already has a different origin remote. Use a clone for a second machine instead of replacing it.");
  }
  if (!configuredRemote) await git(context, ["remote", "add", "origin", remote]);

  const remoteContents = await git(context, ["ls-remote", "origin"], { allowFailure: true });
  if (remoteContents.code !== 0) {
    const output = Buffer.concat([remoteContents.stdout, remoteContents.stderr]).toString("utf8").trim();
    throw new VaultsyncError(`Unable to reach the private remote${output ? `: ${redacted(output)}` : ""}`);
  }
  if (remoteContents.stdout.length > 0) {
    throw new VaultsyncError("The remote already contains history. Clone it for another machine; do not overwrite it from an existing vault.");
  }

  await commitPendingChanges(context, "initialise vault");
  await git(context, ["push", "-u", "origin", "HEAD:main"]);
  context.state.lastPullAt = nowIso();
  context.state.lastPushAt = nowIso();
  context.state.lastSyncAt = nowIso();
  context.state.lastError = undefined;
  await saveState(context);
  await appendLog(context, "Initialized and pushed the vault to its private remote.");
  emit(context, "Vault initialized and pushed to the private remote.");
}

function ignoredByWatcher(vault, target) {
  const relative = path.relative(vault, target);
  if (!relative || relative.startsWith("..")) return false;
  const first = relative.split(path.sep)[0];
  if (LOCAL_ONLY_PATHS.has(first)) return true;
  if (relative === LIBRARY_SETTINGS) return true;
  return relative === ".obsidian/workspace" || relative.startsWith(`.obsidian${path.sep}workspace`);
}

async function watchVault(context) {
  await ensureRepository(context);
  let pendingTimer;
  let queue = Promise.resolve();
  let stopping = false;

  const queueSync = (reason) => {
    queue = queue
      .catch(() => undefined)
      .then(() => syncVault(context, reason))
      .catch((error) => emit(context, `Sync failed: ${errorMessage(error)}`));
    return queue;
  };
  const scheduleDebouncedSync = () => {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      void queueSync("changes settled");
    }, DEBOUNCE_MS);
  };

  const watcher = watch(context.vault, {
    ignoreInitial: true,
    ignored: (target) => ignoredByWatcher(context.vault, target),
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 },
  });
  watcher.on("all", (_event, target) => {
    if (!ignoredByWatcher(context.vault, target)) scheduleDebouncedSync();
  });
  watcher.on("error", (error) => void appendLog(context, `Watcher error: ${errorMessage(error)}`));

  await queueSync("watcher start");
  const interval = setInterval(() => void queueSync("scheduled pull"), PULL_INTERVAL_MS);
  emit(context, "Watching vault changes. Commits begin 30 seconds after the last change; pulls run every 5 minutes.");

  await new Promise((resolve) => {
    const stop = () => {
      if (stopping) return;
      stopping = true;
      if (pendingTimer) clearTimeout(pendingTimer);
      clearInterval(interval);
      void watcher.close().then(resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await queue;
  await appendLog(context, "Watcher stopped.");
}

async function findConflictFiles(vault, directory = vault, found = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (directory === vault && LOCAL_ONLY_PATHS.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await findConflictFiles(vault, target, found);
      continue;
    }
    if (/\.conflict-\d{4}-\d{2}-\d{2}(?:-\d+)?\.(?:md|markdown)$/i.test(entry.name)) {
      found.push(path.relative(vault, target));
    }
  }
  return found;
}

async function showStatus(context) {
  const repository = await isGitRepository(context);
  const conflicts = await findConflictFiles(context.vault);
  const state = context.state;
  const status = repository
    ? await git(context, ["status", "--short"], { allowFailure: true })
    : undefined;
  const remote = repository ? await originUrl(context) : undefined;

  process.stdout.write(`Vault: ${context.vault}\n`);
  process.stdout.write(`Git remote: ${remote ? "configured" : "not configured"}\n`);
  process.stdout.write(`Last pull: ${state.lastPullAt ?? "never"}\n`);
  process.stdout.write(`Last push: ${state.lastPushAt ?? "never"}\n`);
  process.stdout.write(`Last sync: ${state.lastSyncAt ?? "never"}\n`);
  process.stdout.write(`Working tree: ${!repository ? "not a Git repository" : status?.stdout.length ? "changes pending" : "clean"}\n`);
  process.stdout.write(`Conflict copies: ${conflicts.length}\n`);
  for (const conflict of conflicts) process.stdout.write(`  ${conflict}\n`);
  if (state.lastError) process.stdout.write(`Last error: ${state.lastError}\n`);
}

function systemdQuote(value) {
  return `"${String(value).replace(/([\\"])/g, "\\$1")}"`;
}

function serviceNameFor(vault) {
  const safeName = path.basename(vault).replace(/[^A-Za-z0-9_.-]+/g, "-") || "vault";
  return `vaultsync-${safeName}.service`;
}

async function installService(context) {
  const unitDirectory = path.join(os.homedir(), ".config", "systemd", "user");
  const unitName = serviceNameFor(context.vault);
  const unitPath = path.join(unitDirectory, unitName);
  const scriptPath = fileURLToPath(import.meta.url);
  const unit = `[Unit]\nDescription=Vaultsync for ${context.vault}\nAfter=network-online.target\n\n[Service]\nType=simple\nExecStart=${systemdQuote(process.execPath)} ${systemdQuote(scriptPath)} watch --vault ${systemdQuote(context.vault)}\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=default.target\n`;

  await mkdir(unitDirectory, { recursive: true });
  await writeFile(unitPath, unit, "utf8");
  const reload = await runProcess("systemctl", ["--user", "daemon-reload"], { cwd: context.vault, env: process.env });
  const enable = await runProcess("systemctl", ["--user", "enable", "--now", unitName], { cwd: context.vault, env: process.env });
  if (reload.code !== 0 || enable.code !== 0) {
    throw new VaultsyncError(`Service file written to ${unitPath}, but systemd could not enable it. Run: systemctl --user enable --now ${unitName}`);
  }
  emit(context, `Sync service installed: ${unitName}`);
}

async function uninstallService(context) {
  const unitDirectory = path.join(os.homedir(), ".config", "systemd", "user");
  const unitName = serviceNameFor(context.vault);
  const unitPath = path.join(unitDirectory, unitName);
  await runProcess("systemctl", ["--user", "disable", "--now", unitName], { cwd: context.vault, env: process.env });
  await unlink(unitPath).catch(() => {});
  await runProcess("systemctl", ["--user", "daemon-reload"], { cwd: context.vault, env: process.env });
  emit(context, `Sync service removed: ${unitName}`);
}

async function createContext(options) {
  const vault = await resolveVault(options.vault);
  const credentials = await createGitEnvironment(vault);
  return {
    vault,
    environment: credentials.environment,
    dispose: credentials.dispose,
    quiet: false,
    state: await loadState(vault),
    protectedConflicts: [],
  };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(usage());
    return;
  }

  const context = await createContext(options);
  try {
    if (command === "init") await initializeVault(context, options.remote);
    else if (command === "watch") await watchVault(context);
    else if (command === "sync") await syncVault(context, "manual sync");
    else if (command === "status") await showStatus(context);
    else if (command === "install-service") await installService(context);
    else if (command === "uninstall-service") await uninstallService(context);
    else throw new VaultsyncError(`Unknown command: ${command}`);
  } finally {
    await context.dispose();
  }
}

main().catch((error) => {
  process.stderr.write(`vaultsync: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
