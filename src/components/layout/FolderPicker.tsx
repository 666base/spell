import { lazy, Suspense, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui";
import { isWindows } from "../../lib/platform";
import { isSupabaseConfigured } from "../../services/supabase";
import { BookIcon } from "../icons/velocity";

const CloudSetup = lazy(() => import("../cloud/CloudSetup"));

export function FolderPicker() {
  const { setNotesFolder } = useNotes();
  const { reloadSettings } = useTheme();
  const [showCloudSetup, setShowCloudSetup] = useState(false);

  const handleSelectFolder = async () => {
    try {
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
    } catch (err) {
      console.error("Failed to select folder:", err);
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
      {!isWindows && <div className="h-10 shrink-0" data-tauri-drag-region />}

      <div className="flex-1 flex items-center justify-center">
        {showCloudSetup ? (
          <div>
            <Suspense fallback={<div className="text-sm text-text-muted">Opening...</div>}>
            <CloudSetup onBack={() => setShowCloudSetup(false)} />
            </Suspense>
          </div>
        ) : (
          <div className="w-[min(22rem,calc(100%-2rem))] p-7 select-none flex flex-col items-stretch gap-3 bg-bg/95 border border-border rounded-2xl shadow-[var(--shadow-surface)]">
            <div className="flex flex-col items-center text-center gap-3 mb-3">
              <div className="grid place-items-center w-12 h-12 rounded-2xl bg-bg-muted text-text">
                <BookIcon className="w-6 h-6 stroke-[1.5]" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.03em] text-text">Make space for your thoughts</h1>
                <p className="mt-1.5 text-sm leading-5 text-text-muted">Choose where Spell should keep your notes.</p>
              </div>
            </div>
            <Button onClick={handleUseCloud} variant="primary" size="xl">
              Use cloud
            </Button>
            <Button onClick={handleSelectFolder} variant="link" size="md">
              Use offline on this device
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
