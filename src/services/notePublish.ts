import { publishedPageHtml } from "../lib/publishedPage";
import {
  getCloudSession,
  getSupabase,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "./supabase";

const BUCKET = "spell-published";
export const CLOUD_SIGN_IN_ERROR = "CLOUD_SIGN_IN";

const tokenCache = new Map<string, string | null>();
const listeners = new Set<(path: string, token: string | null) => void>();

export function subscribePublishedNote(
  listener: (path: string, token: string | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitPublished(path: string, token: string | null) {
  tokenCache.set(path, token);
  listeners.forEach((listener) => listener(path, token));
}

function storagePath(token: string): string {
  return `${token}.html`;
}

export function publishedNoteUrl(token: string): string {
  const base = getSupabaseUrl()?.replace(/\/$/, "");
  if (!base) throw new Error("Spell Cloud is not configured");
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath(token)}`;
}

export function publishErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message === CLOUD_SIGN_IN_ERROR ||
    /authentication required|not authenticated|jwt/i.test(message)
  ) {
    return "Sign in to Spell Cloud to publish a note";
  }
  if (/not configured/i.test(message)) {
    return "Spell Cloud is not configured on this build";
  }
  if (/bucket|row-level|rls|spell_publish|does not exist|pgrst|storage/i.test(message)) {
    return "Publishing isn't set up on Spell Cloud yet";
  }
  return message || "Couldn't publish this note";
}

export function needsCloudSignIn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === CLOUD_SIGN_IN_ERROR ||
    /authentication required|not authenticated|not configured/i.test(message)
  );
}

async function requireSession() {
  if (!isSupabaseConfigured()) {
    throw new Error(CLOUD_SIGN_IN_ERROR);
  }
  const session = await getCloudSession();
  if (!session) throw new Error(CLOUD_SIGN_IN_ERROR);
  return session;
}

async function rpcToken(
  fn: string,
  params: Record<string, string>,
): Promise<string | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return typeof data === "string" && data.length > 0 ? data : null;
}

async function uploadPage(token: string, title: string, html: string) {
  const supabase = await getSupabase();
  const page = publishedPageHtml(title, html);
  const { error } = await supabase.storage.from(BUCKET).upload(
    storagePath(token),
    new Blob([page], { type: "text/html;charset=utf-8" }),
    {
      upsert: true,
      contentType: "text/html;charset=utf-8",
      cacheControl: "60",
    },
  );
  if (error) throw error;
}

export async function getPublishedToken(path: string): Promise<string | null> {
  if (!path) return null;
  if (tokenCache.has(path)) return tokenCache.get(path) ?? null;
  if (!isSupabaseConfigured()) return null;
  const session = await getCloudSession().catch(() => null);
  if (!session) return null;
  const token = await rpcToken("spell_published_token", { p_path: path });
  tokenCache.set(path, token);
  return token;
}

export async function publishNote(
  path: string,
  title: string,
  html: string,
): Promise<string> {
  await requireSession();
  const token = await rpcToken("spell_publish_note", {
    p_path: path,
    p_title: title,
  });
  if (!token) throw new Error("Couldn't create a public link");
  await uploadPage(token, title, html);
  emitPublished(path, token);
  return publishedNoteUrl(token);
}

export async function refreshPublishedPage(
  path: string,
  title: string,
  html: string,
): Promise<void> {
  const token = await getPublishedToken(path).catch(() => null);
  if (!token) return;
  await uploadPage(token, title, html);
}

export async function unpublishNote(path: string): Promise<void> {
  await requireSession();
  const token =
    (tokenCache.has(path) ? tokenCache.get(path) : null) ??
    (await rpcToken("spell_published_token", { p_path: path }));
  if (token) {
    const supabase = await getSupabase();
    await supabase.storage.from(BUCKET).remove([storagePath(token)]);
  }
  await rpcToken("spell_unpublish_note", { p_path: path });
  emitPublished(path, null);
}

export function unpublishNoteQuietly(path: string): void {
  void unpublishNote(path).catch(() => {});
}

export async function movePublishedNote(
  fromPath: string,
  toPath: string,
): Promise<void> {
  if (!fromPath || !toPath || fromPath === toPath) return;
  if (!isSupabaseConfigured()) return;
  const session = await getCloudSession().catch(() => null);
  if (!session) return;
  const token = await rpcToken("spell_move_published_note", {
    p_from: fromPath,
    p_to: toPath,
  });
  const cached = tokenCache.get(fromPath);
  if (token || cached) {
    emitPublished(toPath, token ?? cached ?? null);
  }
  emitPublished(fromPath, null);
}

export function movePublishedNoteQuietly(fromPath: string, toPath: string): void {
  void movePublishedNote(fromPath, toPath).catch(() => {});
}
