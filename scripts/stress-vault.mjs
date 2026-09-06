#!/usr/bin/env node
/**
 * Writes a large markdown vault for manual soak testing.
 *
 *   node scripts/stress-vault.mjs [targetDir] [noteCount]
 *
 * Default: ./tmp-stress-vault with 5000 notes across nested folders.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const target = process.argv[2] ?? join(process.cwd(), "tmp-stress-vault");
const count = Number(process.argv[3] ?? 5000);

const folders = [
  "",
  "projects",
  "projects/alpha",
  "projects/beta",
  "journal",
  "archive",
  "reference/books",
  "reference/people",
];

function noteBody(index, folder) {
  const heading = `Stress note ${index}`;
  return `# ${heading}

This is synthetic note ${index} in \`${folder || "root"}\`.

- Item one
- Item two
- Search token: vault-stress-${index}

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Repeat ${index % 17}.
`;
}

async function main() {
  for (const folder of folders) {
    if (!folder) continue;
    await mkdir(join(target, folder), { recursive: true });
  }
  await mkdir(target, { recursive: true });

  const writes = [];
  for (let i = 0; i < count; i += 1) {
    const folder = folders[i % folders.length];
    const dir = folder ? join(target, folder) : target;
    const name = `note-${String(i).padStart(4, "0")}.md`;
    writes.push(writeFile(join(dir, name), noteBody(i, folder)));
  }
  await Promise.all(writes);
  console.log(`Wrote ${count} notes to ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
