# Spell Vault Sync

`vaultsync` is a small Git watcher for a Spell vault. It replaces a file-sync service with a private GitHub repository and normal Git history: your notes remain ordinary Markdown files on disk, and `git log` is the version history.

It is plumbing, not a Spell feature. The watcher is a separate Node process that calls the installed Git CLI. It has no account of its own, no telemetry, and no cloud service beyond the private GitHub repository you choose.

## What it does

- Watches a vault, waits 30 seconds after the last change, then commits and pushes an automatic checkpoint.
- On watcher start and every five minutes, creates a safety checkpoint if needed, then runs `git pull --rebase` and pushes any local commits.
- Protects same-note rebase conflicts without conflict markers in the note you were writing:
  - your local note stays at `name.md`;
  - the remote version is saved next to it as `name.conflict-YYYY-MM-DD.md`;
  - the event is recorded in `.vaultsync/vaultsync.log`.
- Keeps status and logs local to each device in `.vaultsync/`.
- Installs as a per-user `systemd` service on Linux when requested.

Git’s pull command fetches remote history and integrates it into the current branch; this setup selects rebase specifically, so automatic checkpoints stay as a linear note history. See the [Git pull documentation](https://git-scm.com/docs/git-pull).

## Deliberate sync boundary

The vault is treated as Markdown-first. `vaultsync init` adds this to the **vault’s** `.gitignore`:

```gitignore
.obsidian/workspace*
.trash/
.scratch/
.vaultsync/
```

The first two entries are the requested device-local Obsidian state and trash. `.vaultsync/` holds this tool’s local logs, state, lock, and optional token file.

`.scratch/` is also ignored on purpose. Today it mixes Spell device preferences with the Kanban and Money workspace in one JSON file. Syncing that mixed file would make an interface tweak on one device collide with project or finance data on another. The correct future solution is to store shareable projects and money records as individual portable Markdown or data files; that is a separate data-model change, not something to hide inside a file-sync watcher.

As a result, this release syncs notes and normal vault files, not the current Kanban/Money workspace. Do not remove `.scratch/` from `.gitignore` unless that storage has first been split into safe, syncable records.

Also, let `vaultsync` own commit/pull/push for this vault. Do not use Spell’s existing manual Git controls at the same time: they do not use this conflict-file convention.

## First-device setup

1. Install Git and Node.js 20 or later. Set your Git author once if you have not already:

   ```bash
   git config --global user.name "Your name"
   git config --global user.email "you@example.com"
   ```

2. Create a new **private, empty** GitHub repository. Do not add a README, license, or `.gitignore` on GitHub—the first vault push creates the history.

3. From this Spell project, install the watcher and its convenient command:

   ```bash
   npm install
   npm run vaultsync:install
   ```

   This creates `~/.local/bin/vaultsync`. Ensure `~/.local/bin` is on your `PATH`; otherwise use `npm run vaultsync -- …` for every command.

4. Initialize your existing vault and push it to the private repository:

   ```bash
   vaultsync init \
     --vault "$HOME/Documents/Spell" \
     --remote "git@github.com:YOUR-USER/spell-vault.git"
   ```

   An HTTPS GitHub URL works too. `init` refuses a non-empty remote rather than risk overwriting it.

5. Start the persistent Linux watcher:

   ```bash
   vaultsync install-service --vault "$HOME/Documents/Spell"
   vaultsync status --vault "$HOME/Documents/Spell"
   ```

   The service starts now and after sign-in. To stop and remove it later:

   ```bash
   vaultsync uninstall-service --vault "$HOME/Documents/Spell"
   ```

### Authentication

SSH is the quietest option: put an SSH key on GitHub and use the `git@github.com:…` remote URL.

For HTTPS, prefer your system Git credential helper. Alternatively, create a fine-grained GitHub token with access only to this private repository and put it in this local, ignored file:

```bash
mkdir -p "$HOME/Documents/Spell/.vaultsync"
chmod 700 "$HOME/Documents/Spell/.vaultsync"
printf '%s\n' 'GITHUB_TOKEN=github_pat_your_token_here' > "$HOME/Documents/Spell/.vaultsync/.env"
chmod 600 "$HOME/Documents/Spell/.vaultsync/.env"
```

The token is passed to Git through a temporary `GIT_ASKPASS` helper; it is never put in the remote URL, a command argument, the Git history, or the log. Treat it as a password. GitHub documents using personal access tokens for HTTPS Git operations in its [token guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Second computer

1. Install Git, Node.js, and this project’s `vaultsync` command as above.
2. Clone the already-created private repository—do **not** run `vaultsync init` again:

   ```bash
   git clone git@github.com:YOUR-USER/spell-vault.git "$HOME/Documents/Spell"
   ```

3. Open that cloned folder as the Spell vault.
4. Add credentials on this computer, then start its watcher:

   ```bash
   vaultsync install-service --vault "$HOME/Documents/Spell"
   vaultsync status --vault "$HOME/Documents/Spell"
   ```

Each device has its own watcher state and log; neither is committed.

## Conflict-file convention

When two devices change the same Markdown note before either can pull, `vaultsync` keeps your local content in the original file and writes the incoming remote content beside it.

```text
Projects/Website.md
Projects/Website.conflict-2026-08-13.md
```

Both files remain valid Markdown. Review and merge the useful parts into `Website.md`, then delete the conflict copy when you are done. The normal watcher commits that cleanup. Multiple conflicts for the same note on one day receive `-2`, `-3`, and so on; nothing is overwritten.

If a conflict involves a non-Markdown file, a delete/modify collision, or any situation Git cannot safely classify, the watcher aborts the rebase, leaves your local vault intact, and records the reason. It never force-pushes, resets, or discards a note.

## Mobile: Git client only

No mobile sync code is added to Spell. Point a Git client at the same private repository, then open that local folder in your mobile editor.

- **iPhone/iPad — Working Copy:** sign in or paste the repository clone URL, clone it, and use its repository folder from Files. Working Copy supports cloning repositories and linking a repository to a folder; push/pull require its paid unlock. See the [Working Copy guide](https://workingcopy.app/manual/commit-revert/).
- **Android — MGit:** tap `+`, paste the same clone URL, choose a local repository name, then clone. MGit supports clone, pull, commit, and push, and uses an external editor for Markdown. See the [MGit instructions](https://github.com/maks/MGit#quick-start).

On mobile, pull before starting a writing session; after editing, commit and push before switching devices. Avoid editing the same note concurrently. If the mobile client reports a conflict, preserve both versions and do not force-push or reset it; resolve the two texts manually or bring the work back to the desktop watcher.

## Commands

| Command | Purpose |
| --- | --- |
| `vaultsync init --vault <folder> --remote <url>` | Create a local repository, add the safe ignore rules, and make the first push to an empty private remote. |
| `vaultsync watch --vault <folder>` | Run the 30-second watcher plus the five-minute pull schedule in the foreground. |
| `vaultsync sync --vault <folder>` | Make a safety checkpoint, pull with rebase, handle safe Markdown conflicts, then push. |
| `vaultsync status --vault <folder>` | Show last push/pull times, pending changes, last error, and conflict-copy paths. |
| `vaultsync install-service --vault <folder>` | Install and start the per-user Linux watcher. |

For development or verification, run:

```bash
npm run vaultsync:test
```

It creates two temporary clones, makes a same-note conflict, confirms that the local note and incoming conflict copy both reach the remote, then removes the temporary test data.

## Intentionally out of scope

- Syncthing setup: it is a valid zero-history alternative, but this workflow explicitly uses Git because history matters.
- Encrypted-vault workflows.
- A version-history UI: use `git log`, `git show`, and normal Git tools.
- Background mobile automation.
- Silent auto-merging of note text. Preserving both versions is safer than guessing what prose should win.
