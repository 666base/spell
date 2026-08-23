import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { isAndroid } from "../../lib/platform";
import * as notesService from "../../services/notes";
import {
  activateCloudVault,
  getCloudSyncStatus,
  setActiveCloudUser,
  subscribeCloudSyncStatus,
  syncNow,
  type CloudSyncStatus,
} from "../../services/cloudSync";
import {
  getCloudSession,
  isSupabaseConfigured,
  signOutOfCloud,
} from "../../services/supabase";
import { CloudAuthForm } from "../cloud/CloudAuthForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "../ui";
import {
  CloudCheckIcon,
  CloudPlusIcon,
  FolderIcon,
  FoldersIcon,
  LogOutIcon,
  SpinnerIcon,
} from "../icons/velocity";

function formatPath(path: string | null): string {
  if (!path) return "Not set";
  if (path.length <= 50) return path;
  return `${path.slice(0, 20)}...${path.slice(-25)}`;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 20) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function accountInitial(email: string): string {
  return (email[0] ?? "S").toUpperCase();
}

function syncStatusLabel(
  syncEnabled: boolean,
  session: Session | null,
  status: CloudSyncStatus,
  online: boolean,
): string {
  if (!syncEnabled) return "Off for this vault";
  if (!session) return "Sign in to keep syncing";
  if (!online) return "Offline — changes will sync later";
  if (status.lastError) return status.lastError;
  if (status.isSyncing) return "Syncing…";
  if (status.pendingCount > 0) {
    return `${status.pendingCount} change${status.pendingCount === 1 ? "" : "s"} waiting`;
  }
  return "Synced";
}

export function AccountSettingsSection() {
  const { notesFolder, setNotesFolder, syncNotesFolder, refreshNotes } = useNotes();
  const { reloadSettings } = useTheme();
  const cloudAvailable = isSupabaseConfigured();

  const [session, setSession] = useState<Session | null>(null);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(getCloudSyncStatus);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEnablingSync, setIsEnablingSync] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [confirmEnableSync, setConfirmEnableSync] = useState(false);

  const reloadAccount = useCallback(async () => {
    const [userId, nextSession] = await Promise.all([
      notesService.getCloudUserId(),
      cloudAvailable ? getCloudSession().catch(() => null) : Promise.resolve(null),
    ]);
    setCloudUserId(userId);
    setSession(nextSession);
    setActiveCloudUser(userId);
  }, [cloudAvailable]);

  useEffect(() => {
    let cancelled = false;
    setLoadingAccount(true);
    const load = () => {
      reloadAccount()
        .catch((error) => {
          console.error("Failed to load account:", error);
        })
        .finally(() => {
          if (!cancelled) setLoadingAccount(false);
        });
    };
    load();
    window.addEventListener("spell-cloud-session-ready", load);
    return () => {
      cancelled = true;
      window.removeEventListener("spell-cloud-session-ready", load);
    };
  }, [reloadAccount, notesFolder]);

  useEffect(() => subscribeCloudSyncStatus(setSyncStatus), []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSyncStatus(getCloudSyncStatus());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const email = session?.user.email ?? "";
  const syncEnabled = Boolean(cloudUserId);
  const signedIn = Boolean(session);

  const handleSignedIn = async (userId: string) => {
    const currentCloudId = await notesService.getCloudUserId();
    if (currentCloudId === userId) {
      await reloadAccount();
      window.dispatchEvent(new CustomEvent("spell-cloud-session-ready"));
      return;
    }
    if (notesFolder && !currentCloudId) {
      await reloadAccount();
      setConfirmEnableSync(true);
      return;
    }
    await activateCloudVault(userId, syncNotesFolder);
    await reloadSettings();
    await reloadAccount();
  };

  const handleEnableSync = async () => {
    if (!session || isEnablingSync) return;
    setIsEnablingSync(true);
    try {
      await activateCloudVault(session.user.id, syncNotesFolder);
      await reloadSettings();
      await reloadAccount();
      toast.success("Spell Cloud is on");
    } catch (error) {
      console.error("Failed to enable cloud sync:", error);
      toast.error(error instanceof Error ? error.message : "Could not enable Spell Cloud");
    } finally {
      setIsEnablingSync(false);
      setConfirmEnableSync(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      if (cloudAvailable) await signOutOfCloud();
      if (cloudUserId) {
        await notesService.disconnectCloud();
        setActiveCloudUser(null);
        window.dispatchEvent(new CustomEvent("spell-cloud-session-ready"));
      }
      await reloadAccount();
      toast.success("Signed out");
    } catch (error) {
      console.error("Failed to sign out:", error);
      toast.error(error instanceof Error ? error.message : "Could not sign out");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSyncNow = async () => {
    if (isSyncingNow) return;
    setIsSyncingNow(true);
    try {
      const changed = await syncNow();
      if (changed) await refreshNotes();
      toast.success("Vault is up to date");
    } catch (error) {
      console.error("Sync failed:", error);
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleChangeFolder = async () => {
    try {
      if (isAndroid) {
        await setNotesFolder("");
        await reloadSettings();
        await reloadAccount();
        return;
      }

      const selected = await invoke<string | null>("open_folder_dialog", {
        defaultPath: notesFolder || null,
      });
      if (selected) {
        await setNotesFolder(selected);
        await reloadSettings();
        await reloadAccount();
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
      toast.error("Failed to select folder");
    }
  };

  const handleOpenFolder = async () => {
    if (!notesFolder) return;
    try {
      await invoke("open_in_file_manager", { path: notesFolder });
    } catch (error) {
      console.error("Failed to open folder:", error);
      toast.error("Failed to open folder");
    }
  };

  const statusText = syncStatusLabel(syncEnabled, session, syncStatus, online);

  return (
    <div className="space-y-8 py-8">
      <section className="pb-2">
        <h2 className="text-xl font-medium mb-0.5">Account</h2>
        <p className="text-sm text-text-muted mb-4">
          Sign in to sync notes across your devices
        </p>

        {loadingAccount ? (
          <div className="rounded-[10px] border border-border p-4 flex items-center justify-center">
            <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin text-text-muted" />
          </div>
        ) : !cloudAvailable ? (
          <div className="rounded-[10px] border border-border p-4">
            <p className="text-sm text-text-muted">
              Spell Cloud is not configured in this build.
            </p>
          </div>
        ) : signedIn ? (
          <div className="rounded-[10px] border border-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-muted text-sm font-semibold text-text">
                {accountInitial(email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text truncate">{email || "Signed in"}</p>
                <p className="text-xs text-text-muted">Spell Cloud</p>
              </div>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="sm"
                disabled={isSigningOut}
                className="gap-1.5"
              >
                <LogOutIcon className="w-3.5 h-3.5 stroke-[1.7]" />
                {isSigningOut ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-[10px] border border-border p-4">
            <CloudAuthForm onSignedIn={handleSignedIn} />
          </div>
        )}
      </section>

      <div className="border-t border-border border-dashed" />

      <section className="pb-2">
        <h2 className="text-xl font-medium mb-0.5">Sync</h2>
        <p className="text-sm text-text-muted mb-4">
          Keep a live copy of this vault in Spell Cloud
        </p>

        <div className="rounded-[10px] border border-border p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-bg-muted">
              {syncEnabled ? (
                <CloudCheckIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
              ) : (
                <CloudPlusIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">Spell Cloud</p>
              <p className="text-xs text-text-muted">{statusText}</p>
            </div>
          </div>

          {syncEnabled && (
            <div className="flex items-center justify-between pt-1 border-t border-border border-dashed">
              <span className="text-sm text-text font-medium">Last sync</span>
              <span className="text-sm text-text-muted">
                {formatRelativeTime(syncStatus.lastSyncedAt)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {signedIn && !syncEnabled && (
              <Button
                onClick={() => setConfirmEnableSync(true)}
                variant="primary"
                size="md"
                disabled={isEnablingSync}
              >
                {isEnablingSync ? "Switching…" : "Enable Spell Cloud"}
              </Button>
            )}
            {syncEnabled && signedIn && (
              <Button
                onClick={handleSyncNow}
                variant="outline"
                size="md"
                disabled={isSyncingNow || syncStatus.isSyncing}
              >
                {isSyncingNow || syncStatus.isSyncing ? (
                  <>
                    <SpinnerIcon className="w-3.25 h-3.25 mr-2 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  "Sync now"
                )}
              </Button>
            )}
            {!signedIn && cloudAvailable && (
              <p className="text-sm text-text-muted">
                Sign in above to turn on sync.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="border-t border-border border-dashed" />

      <section className="pb-2">
        <h2 className="text-xl font-medium mb-0.5">Vault</h2>
        <p className="text-sm text-text-muted mb-4">
          {syncEnabled
            ? "This vault is managed by Spell Cloud and stays available offline"
            : "Your notes are stored as markdown files in this folder"}
        </p>

        <div className="flex items-center gap-2.5 p-2.5 rounded-[10px] border border-border mb-2.5">
          <div className="p-2 rounded-md bg-bg-muted">
            {syncEnabled ? (
              <CloudCheckIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
            ) : (
              <FolderIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
            )}
          </div>
          <p
            className="text-sm text-text-muted truncate"
            title={notesFolder || undefined}
          >
            {syncEnabled
              ? "Cloud vault on this device"
              : isAndroid
                ? "Offline notes on this device"
                : formatPath(notesFolder)}
          </p>
        </div>

        {(!isAndroid || syncEnabled) && (
          <div className="flex items-center gap-1">
            <Button
              onClick={handleChangeFolder}
              variant="outline"
              size="md"
              className="gap-1.25"
            >
              <FoldersIcon className="w-4.5 h-4.5 stroke-[1.5]" />
              {isAndroid
                ? "Use offline storage"
                : syncEnabled
                  ? "Use a local folder"
                  : "Change folder"}
            </Button>
            {notesFolder && !isAndroid && (
              <Button
                onClick={handleOpenFolder}
                variant="ghost"
                size="md"
                className="gap-1.25 text-text"
              >
                Open folder
              </Button>
            )}
          </div>
        )}
      </section>

      <AlertDialog open={confirmEnableSync} onOpenChange={setConfirmEnableSync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to your cloud vault?</AlertDialogTitle>
            <AlertDialogDescription>
              Notes in this local folder stay on disk. Spell will open the vault
              that syncs with your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnableSync} disabled={isEnablingSync}>
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
