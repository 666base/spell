import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { useNotes } from "../../context/NotesContext";
import { useGit } from "../../context/GitContext";
import { useTheme } from "../../context/ThemeContext";
import { isAndroid } from "../../lib/platform";
import {
  CLOUD_PASSWORD_RECOVERY_EVENT,
  isPasswordRecoveryPending,
} from "../../lib/cloudAuth";
import {
  FOLDER_SYNC_OPTIONS,
  activeSyncDestination,
  folderSyncOption,
  githubRepoLabel,
  isGitHubRemote,
  parseFolderSyncKind,
  type FolderSyncKind,
  type SyncDestination,
} from "../../lib/folderSync";
import { cn } from "../../lib/utils";
import * as notesService from "../../services/notes";
import * as gitService from "../../services/git";
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
  Input,
} from "../ui";
import {
  CheckIcon,
  CloudCheckIcon,
  CloudPlusIcon,
  FolderIcon,
  FoldersIcon,
  GitBranchIcon,
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
  const {
    status: gitStatus,
    gitAvailable,
    addRemote,
    isAddingRemote,
    sync: gitSync,
    isSyncing: isGitSyncing,
  } = useGit();
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
  const [pendingFolderKind, setPendingFolderKind] = useState<FolderSyncKind | null>(
    null,
  );
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [needsNewPassword, setNeedsNewPassword] = useState(isPasswordRecoveryPending);
  const [preferredKind, setPreferredKind] = useState<FolderSyncKind | null>(null);
  const [githubRemote, setGithubRemote] = useState("");

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
    const onRecovery = () => setNeedsNewPassword(true);
    const onReady = () => setNeedsNewPassword(isPasswordRecoveryPending());
    window.addEventListener(CLOUD_PASSWORD_RECOVERY_EVENT, onRecovery);
    window.addEventListener("spell-cloud-session-ready", onReady);
    return () => {
      cancelled = true;
      window.removeEventListener("spell-cloud-session-ready", load);
      window.removeEventListener(CLOUD_PASSWORD_RECOVERY_EVENT, onRecovery);
      window.removeEventListener("spell-cloud-session-ready", onReady);
    };
  }, [reloadAccount, notesFolder]);

  useEffect(() => {
    let cancelled = false;
    notesService
      .getSettings()
      .then((settings) => {
        if (!cancelled) setPreferredKind(parseFolderSyncKind(settings.folderSyncKind));
      })
      .catch(() => {
        if (!cancelled) setPreferredKind(null);
      });
    return () => {
      cancelled = true;
    };
  }, [notesFolder]);

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
  const destination = activeSyncDestination(syncEnabled, notesFolder, {
    preferredKind,
    remoteUrl: gitStatus?.remoteUrl,
  });
  const activeFolderKind = destination === "cloud" ? "folder" : destination;
  const folderOptions = isAndroid
    ? FOLDER_SYNC_OPTIONS.filter((option) => option.id === "folder")
    : FOLDER_SYNC_OPTIONS;

  const handleSignedIn = async (userId: string) => {
    setNeedsNewPassword(false);
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

  const applyFolder = async (path: string, kind: FolderSyncKind) => {
    await setNotesFolder(path);
    setActiveCloudUser(null);
    setPreferredKind(kind);
    try {
      const settings = await notesService.getSettings();
      if (settings.folderSyncKind !== kind) {
        await notesService.updateSettings({ ...settings, folderSyncKind: kind });
      }
    } catch (error) {
      console.error("Failed to save folder sync kind:", error);
    }
    if (kind === "github") {
      if (!gitAvailable) {
        toast.error("Install Git to sync this folder with GitHub.");
      } else {
        try {
          await notesService.updateGitEnabled(true, path);
          await gitService.initGitRepo();
          window.dispatchEvent(new CustomEvent("spell-git-settings-changed"));
        } catch (error) {
          console.error("Failed to enable GitHub sync:", error);
          toast.error("Folder is ready. Connect the GitHub repository below.");
        }
      }
    }
    await reloadSettings();
    await reloadAccount();
  };

  const pickFolderKind = async (kind: FolderSyncKind) => {
    if (isPickingFolder) return;
    const option = folderSyncOption(kind);
    setIsPickingFolder(true);
    try {
      if (isAndroid) {
        await applyFolder("", "folder");
        return;
      }
      if (!isTauri()) {
        toast.error("Folder sync is available in the Spell desktop app.");
        return;
      }
      toast.message(option.hint);
      const selected = await open({
        directory: true,
        multiple: false,
        title: option.dialogTitle,
        defaultPath: notesFolder || undefined,
      });
      if (selected && typeof selected === "string") {
        await applyFolder(selected, kind);
        toast.success(
          kind === "github"
            ? "This folder will sync with GitHub"
            : `Saving notes in ${option.label}`,
        );
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
      toast.error("Failed to select folder");
    } finally {
      setIsPickingFolder(false);
      setPendingFolderKind(null);
    }
  };

  const handleSelectDestination = (destination: SyncDestination) => {
    if (destination === "cloud") {
      if (syncEnabled) return;
      if (!signedIn) {
        toast.message("Sign in above to use Spell Cloud.");
        return;
      }
      setConfirmEnableSync(true);
      return;
    }
    if (syncEnabled) {
      setPendingFolderKind(destination);
      return;
    }
    void pickFolderKind(destination);
  };

  const handleLeaveCloudForFolder = async () => {
    if (!pendingFolderKind) return;
    const kind = pendingFolderKind;
    setPendingFolderKind(null);
    await pickFolderKind(kind);
  };

  const handleChangeFolder = () => {
    if (isAndroid) {
      void pickFolderKind("folder");
      return;
    }
    handleSelectDestination(syncEnabled ? "folder" : activeFolderKind);
  };

  const handleConnectGithub = async () => {
    const url = githubRemote.trim();
    if (!url || isAddingRemote) return;
    if (!isGitHubRemote(url)) {
      toast.error("Use a GitHub repository URL.");
      return;
    }
    const ok = await addRemote(url);
    if (ok) {
      setGithubRemote("");
      toast.success("GitHub repository connected");
    } else {
      toast.error("Could not add that GitHub repository");
    }
  };

  const handleGitSyncNow = async () => {
    const result = await gitSync();
    if (result.ok) {
      await refreshNotes();
      toast.success(result.message || "Vault is up to date");
    } else {
      toast.error(result.error);
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
          {isAndroid
            ? "Sign in with email for Spell Cloud. Drive and Dropbox folders are on the desktop app, not a phone login."
            : "Sign in with email for Spell Cloud. GitHub, Drive, and Dropbox sync a folder of files — they are not a login."}
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
        ) : signedIn && !needsNewPassword ? (
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
          {isAndroid
            ? "Sign in with email to keep notes in sync on this phone. Google Drive, Dropbox, and GitHub folders live on the desktop app."
            : "Spell Cloud is a live vault. GitHub, Drive, and Dropbox keep markdown files in a folder."}
        </p>

        <div className="rounded-[10px] border border-border divide-y divide-dashed divide-border">
          <div className={cn("p-4 space-y-3", destination === "cloud" && "bg-bg-selected/40")}>
            <button
              type="button"
              className="flex w-full items-start gap-2.5 text-left"
              onClick={() => handleSelectDestination("cloud")}
              disabled={isEnablingSync || isPickingFolder}
            >
              <div className="p-2 rounded-md bg-bg-muted">
                {destination === "cloud" ? (
                  <CloudCheckIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
                ) : (
                  <CloudPlusIcon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">Spell Cloud</p>
                <p className="text-xs text-text-muted">
                  {cloudAvailable ? statusText : "Not configured in this build"}
                </p>
              </div>
              {destination === "cloud" && (
                <CheckIcon className="mt-1 h-4 w-4 shrink-0 stroke-[1.7] text-text" />
              )}
            </button>

            {destination === "cloud" && (
              <>
                <div className="flex items-center justify-between pt-1 border-t border-border border-dashed">
                  <span className="text-sm text-text font-medium">Last sync</span>
                  <span className="text-sm text-text-muted tabular-nums">
                    {formatRelativeTime(syncStatus.lastSyncedAt)}
                  </span>
                </div>
                {signedIn && (
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
              </>
            )}
          </div>

          {folderOptions.map((option) => {
            const selected = destination === option.id;
            const Icon = option.id === "github" ? GitBranchIcon : FolderIcon;
            return (
              <div
                key={option.id}
                className={cn("p-4 space-y-3", selected && "bg-bg-selected/40")}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-2.5 text-left"
                  onClick={() => {
                    if (!selected) handleSelectDestination(option.id);
                  }}
                  disabled={isPickingFolder || isEnablingSync}
                >
                  <div className="p-2 rounded-md bg-bg-muted">
                    <Icon className="w-4.5 h-4.5 stroke-[1.5] text-text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{option.label}</p>
                    <p className="text-xs text-text-muted">
                      {selected && option.id === "github" && gitStatus?.remoteUrl
                        ? githubRepoLabel(gitStatus.remoteUrl)
                        : selected && notesFolder && !isAndroid
                          ? formatPath(notesFolder)
                          : option.description}
                    </p>
                  </div>
                  {selected && (
                    <CheckIcon className="mt-1 h-4 w-4 shrink-0 stroke-[1.7] text-text" />
                  )}
                </button>

                {selected && !isAndroid && (
                  <>
                    <div className="flex items-center gap-1 pt-1 border-t border-border border-dashed">
                      <Button
                        onClick={handleChangeFolder}
                        variant="outline"
                        size="md"
                        className="gap-1.25"
                        disabled={isPickingFolder}
                      >
                        <FoldersIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                        Change folder
                      </Button>
                      {notesFolder && (
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
                    {option.id === "github" &&
                      (gitStatus?.hasRemote ? (
                        <Button
                          onClick={() => void handleGitSyncNow()}
                          variant="outline"
                          size="md"
                          disabled={isGitSyncing}
                        >
                          {isGitSyncing ? (
                            <>
                              <SpinnerIcon className="w-3.25 h-3.25 mr-2 animate-spin" />
                              Syncing…
                            </>
                          ) : (
                            "Sync now"
                          )}
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs leading-5 text-text-muted">
                            Paste the GitHub repository URL. Spell will commit and push this folder.
                          </p>
                          <Input
                            type="url"
                            value={githubRemote}
                            onChange={(event) => setGithubRemote(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleConnectGithub();
                              }
                            }}
                            placeholder="https://github.com/you/notes.git"
                            autoComplete="off"
                          />
                          <Button
                            onClick={() => void handleConnectGithub()}
                            variant="outline"
                            size="md"
                            disabled={isAddingRemote || !githubRemote.trim()}
                          >
                            {isAddingRemote ? "Connecting…" : "Connect GitHub"}
                          </Button>
                        </div>
                      ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
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

      <AlertDialog
        open={pendingFolderKind !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFolderKind(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Use {pendingFolderKind ? folderSyncOption(pendingFolderKind).label : "a folder"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Spell Cloud stays on this device. Notes will be saved as files in the
              folder you pick.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on Spell Cloud</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleLeaveCloudForFolder()}
              disabled={isPickingFolder}
            >
              Choose folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
