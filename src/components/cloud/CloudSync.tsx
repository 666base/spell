import { useEffect } from "react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import {
  setActiveCloudUser,
  subscribeToCloudNotes,
  syncCloudNotes,
} from "../../services/cloudSync";
import {
  getCloudSession,
  isSupabaseConfigured,
  startCloudAuthListener,
} from "../../services/supabase";

export function CloudSync() {
  const { refreshNotes } = useNotes();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return startCloudAuthListener();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | null = null;
    let startPromise: Promise<void> | null = null;

    const start = () => {
      if (startPromise) return startPromise;

      startPromise = (async () => {
        try {
          const cloudUserId = await notesService.getCloudUserId();
          if (!cloudUserId || cancelled) {
            setActiveCloudUser(null);
            await unsubscribe?.();
            unsubscribe = null;
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
        } finally {
          startPromise = null;
        }
      })();

      return startPromise;
    };

    const handleOnline = () => {
      void start();
    };
    const handleSessionReady = () => {
      void start();
    };

    // Realtime carries changes immediately. A quiet reconciliation also
    // covers waking from sleep, reconnecting after a network drop, and a
    // desktop app returning from the background.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void start();
    };

    const timer = window.setTimeout(() => void start(), 750);
    const reconcileInterval = window.setInterval(() => void start(), 5 * 60_000);
    window.addEventListener("online", handleOnline);
    window.addEventListener("spell-cloud-session-ready", handleSessionReady);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(reconcileInterval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("spell-cloud-session-ready", handleSessionReady);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void unsubscribe?.();
    };
  }, [refreshNotes]);

  return null;
}
