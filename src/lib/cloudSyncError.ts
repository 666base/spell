export const CLOUD_SYNC_SIGN_IN_AGAIN = "Sign in to Spell Cloud again";

export function cloudErrorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message.trim();
  }
  return "";
}

export function isCloudSessionExpired(error: unknown): boolean {
  const text = cloudErrorText(error).toLowerCase();
  return (
    text.includes("refresh token") ||
    text.includes("invalid_grant") ||
    text.includes("jwt expired") ||
    text.includes("invalid jwt") ||
    text.includes("session missing") ||
    text.includes("auth session missing") ||
    text.includes("not authenticated")
  );
}

export function cloudSyncErrorMessage(error: unknown): string {
  const text = cloudErrorText(error);
  const lower = text.toLowerCase();

  if (isCloudSessionExpired(error) || lower.includes("jwt")) {
    return CLOUD_SYNC_SIGN_IN_AGAIN;
  }

  if (
    lower.includes("spell_sync_note") ||
    lower.includes("could not find the function") ||
    lower.includes("pgrst202")
  ) {
    return "Cloud notes aren't set up on this Spell Cloud project yet";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("err_name_not_resolved") ||
    lower.includes("err_internet_disconnected") ||
    lower.includes("could not resolve")
  ) {
    return "Couldn't reach Spell Cloud. Check your connection.";
  }

  return text || "Couldn't sync with Spell Cloud";
}

export async function resolveCloudAuthSession<T>(
  result: { data: { session: T | null }; error: unknown },
  signOutLocal: () => Promise<void>,
): Promise<T | null> {
  if (!result.error) return result.data.session;
  if (!isCloudSessionExpired(result.error)) throw result.error;
  try {
    await signOutLocal();
  } catch {
    // Clearing a dead local session is best-effort.
  }
  return null;
}
