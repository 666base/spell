import { useEffect, useState } from "react";
import {
  getPublishedToken,
  subscribePublishedNote,
} from "../services/notePublish";

export function usePublishedNote(noteId: string | undefined) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) {
      setToken(null);
      return;
    }
    let cancelled = false;
    void getPublishedToken(noteId)
      .then((value) => {
        if (!cancelled) setToken(value);
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    if (!noteId) return;
    return subscribePublishedNote((path, next) => {
      if (path === noteId) setToken(next);
    });
  }, [noteId]);

  return { token, published: Boolean(token) };
}
