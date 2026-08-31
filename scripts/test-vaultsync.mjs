#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./vaultsync.mjs", import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), "vaultsync-test-"));
const remote = path.join(root, "remote.git");
const mine = path.join(root, "mine");
const other = path.join(root, "other");
const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: "Vaultsync Test",
  GIT_AUTHOR_EMAIL: "vaultsync@example.test",
  GIT_COMMITTER_NAME: "Vaultsync Test",
  GIT_COMMITTER_EMAIL: "vaultsync@example.test",
  VAULTSYNC_TEST_DEBOUNCE_MS: "300",
};

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: gitEnvironment, shell: false });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat([...stdout, ...stderr]).toString("utf8");
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} failed:\n${output}`));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopWatcher(watcher) {
  if (watcher.exitCode !== null || watcher.signalCode !== null) return;
  watcher.kill("SIGTERM");
  await once(watcher, "close");
}

try {
  await run("git", ["init", "--bare", remote]);
  await mkdir(mine, { recursive: true });
  await writeFile(path.join(mine, "note.md"), "initial\n", "utf8");
  await run(process.execPath, [script, "init", "--vault", mine, "--remote", remote]);
  const gitignore = await readFile(path.join(mine, ".gitignore"), "utf8");
  for (const entry of [".obsidian/workspace*", ".trash/", ".scratch/", ".vaultsync/", "Spell Library/settings.json"]) {
    assert.match(gitignore, new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }

  await run("git", ["clone", "--branch", "main", remote, other]);
  await writeFile(path.join(other, "note.md"), "incoming change\n", "utf8");
  await run("git", ["add", "note.md"], other);
  await run("git", ["commit", "-m", "incoming edit"], other);
  await run("git", ["push"], other);

  await writeFile(path.join(mine, "note.md"), "local change\n", "utf8");
  await run(process.execPath, [script, "sync", "--vault", mine]);

  assert.equal(await readFile(path.join(mine, "note.md"), "utf8"), "local change\n");
  const conflictName = `note.conflict-${new Date().toISOString().slice(0, 10)}.md`;
  assert.equal(await readFile(path.join(mine, conflictName), "utf8"), "incoming change\n");

  const status = await run(process.execPath, [script, "status", "--vault", mine]);
  assert.match(status, new RegExp(`Conflict copies: 1\\n\\s+${conflictName}`));

  const verification = path.join(root, "verification");
  await run("git", ["clone", "--branch", "main", remote, verification]);
  assert.equal(await readFile(path.join(verification, "note.md"), "utf8"), "local change\n");
  assert.equal(await readFile(path.join(verification, conflictName), "utf8"), "incoming change\n");

  const watcher = spawn(process.execPath, [script, "watch", "--vault", mine], {
    cwd: root,
    env: gitEnvironment,
    stdio: "ignore",
  });
  try {
    await delay(1_000);
    await writeFile(path.join(mine, "watcher-check.md"), "watcher checkpoint\n", "utf8");
    await delay(2_000);
  } finally {
    await stopWatcher(watcher);
  }

  const watcherVerification = path.join(root, "watcher-verification");
  await run("git", ["clone", "--branch", "main", remote, watcherVerification]);
  assert.equal(await readFile(path.join(watcherVerification, "watcher-check.md"), "utf8"), "watcher checkpoint\n");

  process.stdout.write("vaultsync conflict-protection test passed.\n");
} finally {
  await rm(root, { recursive: true, force: true });
}
