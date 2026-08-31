import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CLOUD_SYNC_SIGN_IN_AGAIN,
  cloudSyncErrorMessage,
} from "../lib/cloudSyncError";
import type { Note } from "../types/note";
import * as notesService from "./notes";
import { getCloudSession, getSupabase } from "./supabase";

interface CloudNoteRow {
  owner_id: string;
  path: string;
  content: string;
  modified_at: number;
  deleted: boolean;
  updated_at: string;
}

interface CloudMutation {
  path: string;
  content: string;
  modifiedAt: number;
  deleted: boolean;
}

const queuePrefix = "spell-cloud-queue:";
const lastSyncPrefix = "spell-cloud-last-sync:";
let activeUserId: string | null = null;
let flushTimer: number | null = null;
let flushPromise: Promise<void> | null = null;

export interface CloudSyncStatus {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  pendingCount: number;
}

let syncStatus: CloudSyncStatus = {
  isSyncing: false,
  lastSyncedAt: null,
  lastError: null,
  pendingCount: 0,
};

let syncOps = 0;

const statusListeners = new Set<(status: CloudSyncStatus) => void>();

function lastSyncKey(userId: string): string {
  return `${lastSyncPrefix}${userId}`;
}

function readLastSyncedAt(userId: string | null): number | null {
  if (!userId) return null;
  const stored = localStorage.getItem(lastSyncKey(userId));
  if (!stored) return null;
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeLastSyncedAt(userId: string, timestamp: number): void {
  localStorage.setItem(lastSyncKey(userId), String(timestamp));
}

function emitSyncStatus(patch: Partial<CloudSyncStatus> = {}): void {
  syncStatus = {
    ...syncStatus,
    ...patch,
    pendingCount: activeUserId ? readQueue(activeUserId).length : 0,
  };
  const snapshot = { ...syncStatus };
  statusListeners.forEach((listener) => listener(snapshot));
}

function beginSync(): void {
  syncOps += 1;
  emitSyncStatus({ isSyncing: true, lastError: null });
}

function endSync(): void {
  syncOps = Math.max(0, syncOps - 1);
  emitSyncStatus({ isSyncing: syncOps > 0 });
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return {
    ...syncStatus,
    pendingCount: activeUserId ? readQueue(activeUserId).length : 0,
  };
}

export function subscribeCloudSyncStatus(
  listener: (status: CloudSyncStatus) => void,
): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function queueKey(userId: string): string {
  return `${queuePrefix}${userId}`;
}

function readQueue(userId: string): CloudMutation[] {
  try {
    const stored = localStorage.getItem(queueKey(userId));
    return stored ? (JSON.parse(stored) as CloudMutation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, queue: CloudMutation[]): void {
  if (queue.length === 0) {
    localStorage.removeItem(queueKey(userId));
  } else {
    localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  }
}

function addMutation(mutation: CloudMutation): void {
  if (!activeUserId) return;
  const queue = readQueue(activeUserId).filter(
    (queued) => queued.path !== mutation.path,
  );
  queue.push(mutation);
  writeQueue(activeUserId, queue);
  emitSyncStatus();
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushCloudQueue().catch((error) => {
      console.error("Cloud queue flush failed:", error);
    });
  }, 900);
}

export function reportCloudSignedOut(): void {
  emitSyncStatus({ lastError: CLOUD_SYNC_SIGN_IN_AGAIN });
}

export function setActiveCloudUser(userId: string | null): void {
  activeUserId = userId;
  emitSyncStatus({
    lastSyncedAt: readLastSyncedAt(userId),
    lastError: userId ? syncStatus.lastError : null,
  });
}

export async function activateCloudVault(
  userId: string,
  syncNotesFolder: (path: string) => Promise<void>,
): Promise<void> {
  setActiveCloudUser(userId);
  const path = await notesService.setCloudNotesFolder(userId);
  await syncNotesFolder(path);
  window.dispatchEvent(new CustomEvent("spell-cloud-session-ready"));
}

export async function syncNow(): Promise<boolean> {
  const userId = activeUserId ?? (await notesService.getCloudUserId());
  if (!userId) throw new Error("Spell Cloud is not enabled on this vault");
  return syncCloudNotes(userId);
}

export function queueCloudUpsert(note: Note): void {
  addMutation({
    path: note.id,
    content: note.content,
    modifiedAt: Math.max(note.modified, Math.floor(Date.now() / 1000)),
    deleted: false,
  });
}

export function queueCloudDelete(path: string): void {
  addMutation({
    path,
    content: "",
    modifiedAt: Math.floor(Date.now() / 1000),
    deleted: true,
  });
}

export async function flushCloudQueue(): Promise<void> {
  if (flushPromise) return flushPromise;
  if (!activeUserId || !navigator.onLine) return;

  const userId = activeUserId;
  beginSync();
  flushPromise = (async () => {
    const session = await getCloudSession();
    if (!session || session.user.id !== userId) {
      if (readQueue(userId).length > 0) {
        throw new Error(CLOUD_SYNC_SIGN_IN_AGAIN);
      }
      return;
    }
    const supabase = await getSupabase();

    for (const mutation of readQueue(userId)) {
      const { error } = await supabase.rpc("spell_sync_note", {
        p_path: mutation.path,
        p_content: mutation.content,
        p_modified_at: mutation.modifiedAt,
        p_deleted: mutation.deleted,
      });
      if (error) throw error;

      const currentQueue = readQueue(userId);
      const unchanged = currentQueue.find(
        (queued) =>
          queued.path === mutation.path &&
          queued.modifiedAt === mutation.modifiedAt &&
          queued.deleted === mutation.deleted,
      );
      if (unchanged) {
        writeQueue(
          userId,
          currentQueue.filter((queued) => queued !== unchanged),
        );
      }
    }

    const syncedAt = Date.now();
    writeLastSyncedAt(userId, syncedAt);
    emitSyncStatus({ lastSyncedAt: syncedAt, lastError: null });
  })()
    .catch((error) => {
      emitSyncStatus({ lastError: cloudSyncErrorMessage(error) });
      throw error;
    })
    .finally(() => {
      flushPromise = null;
      endSync();
    });

  return flushPromise;
}

async function applyRemoteRow(row: CloudNoteRow): Promise<boolean> {
  let localNote: Note | null = null;
  try {
    localNote = await notesService.readNote(row.path);
  } catch {
    localNote = null;
  }

  if (localNote && localNote.modified > row.modified_at) return false;

  if (row.deleted) {
    if (!localNote) return false;
    await notesService.deleteNote(row.path);
    return true;
  }

  if (localNote && localNote.modified === row.modified_at) return false;
  await notesService.applyCloudNote(row.path, row.content, row.modified_at);
  return true;
}

export async function syncCloudNotes(userId: string): Promise<boolean> {
  setActiveCloudUser(userId);
  beginSync();
  try {
    const session = await getCloudSession();
    if (!session || session.user.id !== userId) {
      throw new Error(CLOUD_SYNC_SIGN_IN_AGAIN);
    }
    await flushCloudQueue();

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("spell_notes")
      .select("owner_id,path,content,modified_at,deleted,updated_at")
      .order("modified_at", { ascending: true });
    if (error) throw error;

    const remoteRows = (data ?? []) as CloudNoteRow[];
    const remoteByPath = new Map(remoteRows.map((row) => [row.path, row]));
    const localNotes = await notesService.listNotes();
    let localChanged = false;

    for (const metadata of localNotes) {
      const remote = remoteByPath.get(metadata.id);
      if (!remote || metadata.modified > remote.modified_at) {
        const note = await notesService.readNote(metadata.id);
        queueCloudUpsert(note);
      }
    }

    for (const remote of remoteRows) {
      localChanged = (await applyRemoteRow(remote)) || localChanged;
    }

    await flushCloudQueue();
    const syncedAt = Date.now();
    writeLastSyncedAt(userId, syncedAt);
    emitSyncStatus({ lastSyncedAt: syncedAt, lastError: null });
    return localChanged;
  } catch (error) {
    emitSyncStatus({ lastError: cloudSyncErrorMessage(error) });
    throw error;
  } finally {
    endSync();
  }
}

export async function subscribeToCloudNotes(
  userId: string,
  onLocalChange: () => void,
): Promise<() => Promise<void>> {
  const supabase = await getSupabase();
  const channel: RealtimeChannel = supabase
    .channel(`spell-notes:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "spell_notes",
        filter: `owner_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as CloudNoteRow | Record<string, never>;
        if (!("path" in row)) return;
        void applyRemoteRow(row as CloudNoteRow).then((changed) => {
          if (changed) onLocalChange();
        });
      },
    )
    .subscribe();

  return async () => {
    await supabase.removeChannel(channel);
  };
}
