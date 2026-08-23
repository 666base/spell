import { lazy, Suspense, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui";
import { isAndroid, isMac } from "../../lib/platform";
import { isSupabaseConfigured } from "../../services/supabase";
import { BookIcon } from "../icons/velocity";
import { WindowControls } from "./WindowControls";
import { cn } from "../../lib/utils";

const CloudSetup = lazy(() => import("../cloud/CloudSetup"));

export function FolderPicker() {
  const { setNotesFolder } = useNotes();
  const { reloadSettings } = useTheme();
  const [showCloudSetup, setShowCloudSetup] = useState(false);
  const [isSettingOffline, setIsSettingOffline] = useState(false);

  const handleSelectFolder = async () => {
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

      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose Notes Folder",
      });

      if (selected && typeof selected === "string") {
        await setNotesFolder(selected);
        // Reload theme/font settings from the new folder's .scratch/settings.json
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
                    ? "Keep offline notes privately on this device."
                    : "Choose where Spell should keep your notes."}
                </p>
              </div>
            </div>
            <Button onClick={handleUseCloud} variant="primary" size="xl">
              Use cloud
            </Button>
            <Button onClick={handleSelectFolder} disabled={isSettingOffline} variant="link" size="md">
              {isSettingOffline
                ? "Setting up offline storage…"
                : isAndroid
                  ? "Use offline on this device"
                  : "Choose an offline folder"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
