export function hasSpellCloudCredentials(
  url: string | undefined,
  key: string | undefined,
): boolean {
  return Boolean(url?.trim() && key?.trim());
}

const PROJECT_URL = /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.supabase\.co/i;
const PUBLISHABLE_KEY = /sb_publishable_[A-Za-z0-9_]+/;
const ANON_JWT = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

/** True when a production JS bundle inlined a real project URL and key. */
export function frontendBundleHasSpellCloud(source: string): boolean {
  return (
    PROJECT_URL.test(source) &&
    (PUBLISHABLE_KEY.test(source) || ANON_JWT.test(source))
  );
}
