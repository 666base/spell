import { useEffect } from "react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import {
  setActiveCloudUser,
  subscribeToCloudNotes,
  syncCloudNotes,
} from "../../services/cloudSync";
import { getCloudSession, isSupabaseConfigured } from "../../services/supabase";

export function CloudSync() {
  const { refreshNotes } = useNotes();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const start = async () => {
      try {
        const cloudUserId = await notesService.getCloudUserId();
        if (!cloudUserId || cancelled) {
          setActiveCloudUser(null);
          return;
        }

        setActiveCloudUser(cloudUserId);
        if (!navigator.onLine) return;
        const session = await getCloudSession();
        if (!session || session.user.id !== cloudUserId || cancelled) return;

        await unsubscribe?.();
        unsubscribe = null;
        const changed = await syncCloudNotes(cloudUserId);
        if (changed && !cancelled) await refreshNotes();
        if (cancelled) return;

        unsubscribe = await subscribeToCloudNotes(cloudUserId, () => {
          void refreshNotes();
        });
      } catch (error) {
        console.error("Cloud sync failed:", error);
        if (!navigator.onLine) return;
        toast.error("Cloud sync needs attention", {
          id: "cloud-sync-error",
          description:
            error instanceof Error ? error.message : "Please try again later.",
        });
      }
    };

    const handleOnline = () => {
      void start();
    };
    const handleSessionReady = () => {
      void start();
    };

    const timer = window.setTimeout(() => void start(), 750);
    window.addEventListener("online", handleOnline);
    window.addEventListener("spell-cloud-session-ready", handleSessionReady);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("spell-cloud-session-ready", handleSessionReady);
      void unsubscribe?.();
    };
  }, [refreshNotes]);

  return null;
}
