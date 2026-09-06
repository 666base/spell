import { cloudSyncErrorMessage } from "./cloudSyncError";

/**
 * After a password sign-in, decide whether this vault is already the
 * account's cloud folder or the cloud vault still needs to be opened.
 *
 * Desktop always has a notes folder path after first run. That must not
 * stall sign-in on a second "switch vault?" step — Android's empty-string
 * folder already skipped that step and opened the vault immediately.
 */
export function nextCloudSignInAction(input: {
  signedInUserId: string;
  currentCloudUserId: string | null;
  notesFolder: string | null | undefined;
}): "resume" | "activate" {
  if (input.currentCloudUserId === input.signedInUserId) return "resume";
  return "activate";
}

/** Prefer the live session, then the user id captured at sign-in. */
export function cloudUserIdForVaultSwitch(
  sessionUserId: string | null | undefined,
  pendingUserId: string | null | undefined,
): string | null {
  return sessionUserId || pendingUserId || null;
}

export function upsertCloudMutation<T extends { path: string }>(
  queue: T[],
  mutation: T,
): T[] {
  return [...queue.filter((item) => item.path !== mutation.path), mutation];
}

export type CloudSyncTone = "idle" | "ok" | "busy" | "warn" | "error";

export interface CloudSyncPanel {
  tone: CloudSyncTone;
  label: string;
  showLastSync: boolean;
}

/**
 * Copy and hierarchy for the Spell Cloud row. A selected destination is not
 * the same as a healthy vault — an error must not read as "Just now".
 */
export function cloudSyncPanel(input: {
  syncEnabled: boolean;
  signedIn: boolean;
  online: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastError: string | null;
  lastSyncedAt: number | null;
}): CloudSyncPanel {
  if (!input.syncEnabled) {
    return { tone: "idle", label: "Off for this vault", showLastSync: false };
  }
  if (!input.signedIn) {
    return { tone: "warn", label: "Sign in to keep syncing", showLastSync: false };
  }
  if (!input.online) {
    return {
      tone: "warn",
      label: "Offline — changes will sync later",
      showLastSync: Boolean(input.lastSyncedAt) && !input.lastError,
    };
  }
  if (input.isSyncing) {
    return {
      tone: "busy",
      label: input.lastError ? "Trying again…" : "Syncing…",
      showLastSync: false,
    };
  }
  if (input.lastError) {
    return {
      tone: "error",
      label: cloudSyncErrorMessage(input.lastError),
      showLastSync: false,
    };
  }
  if (input.pendingCount > 0) {
    return {
      tone: "warn",
      label: `${input.pendingCount} change${input.pendingCount === 1 ? "" : "s"} waiting`,
      showLastSync: Boolean(input.lastSyncedAt),
    };
  }
  return {
    tone: "ok",
    label: "Synced",
    showLastSync: Boolean(input.lastSyncedAt),
  };
}
