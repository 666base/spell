import { lazy, Suspense, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui";
import { isAndroid, isMac } from "../../lib/platform";
import {
  ONBOARDING_FOLDER_SYNC_IDS,
  folderSyncOption,
  type FolderSyncKind,
} from "../../lib/folderSync";
import { getCloudSession, isSupabaseConfigured } from "../../services/supabase";
import * as notesService from "../../services/notes";
import * as gitService from "../../services/git";
import { CloudAuthListener } from "../cloud/CloudAuthListener";
import { BookIcon } from "../icons/velocity";
import { WindowControls } from "./WindowControls";
import { cn } from "../../lib/utils";

const CloudSetup = lazy(() => import("../cloud/CloudSetup"));

export function FolderPicker() {
  const { setNotesFolder } = useNotes();
  const { reloadSettings } = useTheme();
  const [showCloudSetup, setShowCloudSetup] = useState(false);
  const [isSettingOffline, setIsSettingOffline] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void getCloudSession()
      .then((session) => {
        if (session) setShowCloudSetup(true);
      })
      .catch(() => {});
  }, []);

  const pickLocalFolder = async (kind: FolderSyncKind = "folder") => {
    const option = folderSyncOption(kind);
    setIsSettingOffline(true);
    try {
      if (isAndroid) {
        await setNotesFolder("");
        await reloadSettings();
        return;
      }

      if (!isTauri()) {
        toast.error("Offline storage is available in the Spell desktop or Android app.");
        return;
      }

      toast.message(option.hint);

      const selected = await open({
        directory: true,
        multiple: false,
        title: option.dialogTitle,
      });

      if (selected && typeof selected === "string") {
        await setNotesFolder(selected);
        try {
          const settings = await notesService.getSettings();
          await notesService.updateSettings({
            ...settings,
            folderSyncKind: kind,
            gitEnabled: kind === "github" ? true : settings.gitEnabled,
          });
          if (kind === "github") {
            await gitService.initGitRepo();
            window.dispatchEvent(new CustomEvent("spell-git-settings-changed"));
          }
        } catch (error) {
          console.error("Failed to prepare folder sync:", error);
          if (kind === "github") {
            toast.error("Folder is ready. Add a GitHub URL in Settings → Account to finish sync.");
          }
        }
        await reloadSettings();
      }
    } catch (error) {
      console.error("Failed to set up offline storage:", error);
      toast.error(
        isAndroid
          ? "Spell could not prepare offline storage. Please try again."
          : "Spell could not use that folder. Please choose another one.",
      );
    } finally {
      setIsSettingOffline(false);
    }
  };

  const handleSelectFolder = () => {
    void pickLocalFolder("folder");
  };

  const handleUseCloud = () => {
    if (!isTauri()) {
      toast.error("Open the Spell desktop app to use cloud sync.");
      return;
    }
    if (!isSupabaseConfigured()) {
      toast.error("Spell cloud is not configured yet.");
      return;
    }
    setShowCloudSetup(true);
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      <CloudAuthListener />
      {/* Draggable title bar area */}
      <div
        className={cn(
          "flex h-11 shrink-0 items-center justify-end px-1.5",
          isMac && "pl-20",
        )}
        data-tauri-drag-region
      >
        <WindowControls />
      </div>

      <div className="flex-1 flex items-center justify-center">
        {showCloudSetup ? (
          <div>
            <Suspense fallback={<div className="text-sm text-text-muted">Opening...</div>}>
            <CloudSetup onBack={() => setShowCloudSetup(false)} />
            </Suspense>
          </div>
        ) : (
          <div className="app-sheet-surface w-[min(22rem,calc(100%-2rem))] p-7 select-none flex flex-col items-stretch gap-3 border border-border rounded-2xl">
            <div className="flex flex-col items-center text-center gap-3 mb-3">
              <div className="grid place-items-center w-12 h-12 rounded-2xl bg-bg-muted text-text">
                <BookIcon className="w-6 h-6 stroke-[1.5]" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.03em] text-text">Make space for your thoughts</h1>
                <p className="mt-1.5 text-sm leading-5 text-text-muted">
                  {isAndroid
                    ? "Keep notes on this device, or sign in with email to sync across devices. Drive and Dropbox are folders, not a login."
                    : "Spell Cloud is an email account. GitHub, Google Drive, Dropbox, and OneDrive keep files in a folder."}
                </p>
              </div>
            </div>
            <Button onClick={handleUseCloud} variant="primary" size="xl">
              Use Spell Cloud
            </Button>
            {!isAndroid &&
              ONBOARDING_FOLDER_SYNC_IDS.map((id) => (
                <Button
                  key={id}
                  onClick={() => void pickLocalFolder(id)}
                  disabled={isSettingOffline}
                  variant="outline"
                  size="xl"
                >
                  {folderSyncOption(id).label}
                </Button>
              ))}
            <Button onClick={handleSelectFolder} disabled={isSettingOffline} variant="link" size="md">
              {isSettingOffline
                ? "Setting up offline storage…"
                : isAndroid
                  ? "Use offline on this device"
                  : "Choose another folder"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
