import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_URL = /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.supabase\.co/i;
const PUBLISHABLE_KEY = /sb_publishable_[A-Za-z0-9_]+/;
const ANON_JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

function frontendBundleHasSpellCloud(source) {
  return (
    PROJECT_URL.test(source) &&
    (PUBLISHABLE_KEY.test(source) || ANON_JWT.test(source))
  );
}

function distJavascript() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const assets = join(root, "dist", "assets");
  return readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(assets, name), "utf8"))
    .join("\n");
}

let source = "";
try {
  source = distJavascript();
} catch {
  console.error(
    "Spell Cloud bake check: dist/assets is missing. Run `npm run build` first.",
  );
  process.exit(1);
}

if (!frontendBundleHasSpellCloud(source)) {
  console.error(
    "Spell Cloud is missing from this frontend build.\n" +
      "Set VITE_SUPABASE_URL and VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "(or VITE_SUPABASE_ANON_KEY) before packaging.\n" +
      "Release builds need these as GitHub Actions secrets, or a local .env.",
  );
  process.exit(1);
}
