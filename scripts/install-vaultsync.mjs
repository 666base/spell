#!/usr/bin/env node

import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./vaultsync.mjs", import.meta.url));
const destinationDirectory = process.env.VAULTSYNC_BIN_DIR || path.join(os.homedir(), ".local", "bin");
const destination = path.join(destinationDirectory, "vaultsync");

await mkdir(destinationDirectory, { recursive: true });

try {
  const details = await lstat(destination);
  if (!details.isSymbolicLink()) {
    throw new Error(`${destination} already exists and is not a vaultsync link.`);
  }
  const existing = path.resolve(destinationDirectory, await readlink(destination));
  if (existing !== source) {
    throw new Error(`${destination} already points to a different vaultsync installation.`);
  }
} catch (error) {
  if (error?.code === "ENOENT") {
    await symlink(source, destination);
  } else if (error instanceof Error) {
    throw error;
  } else {
    throw error;
  }
}

process.stdout.write(`Installed vaultsync at ${destination}\n`);
process.stdout.write(`Ensure ${destinationDirectory} is on your PATH, then run: vaultsync status --vault <folder>\n`);
