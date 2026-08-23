import { useEffect, useRef, useState } from "react";

/** Keep in sync with `--motion-panel` in App.css. */
export const PANEL_TRANSITION_MS = 220;

/**
 * Transitions a persistent rail open/closed without animating resize or
 * first paint. `animating` is only true while a user-initiated toggle runs.
 */
export function useOpenTransition(open: boolean, durationMs = PANEL_TRANSITION_MS) {
  const [state, setState] = useState<"open" | "closed">(open ? "open" : "closed");
  const [animating, setAnimating] = useState(false);
  const openRef = useRef(open);

  useEffect(() => {
    if (openRef.current === open) return;
    openRef.current = open;
    setAnimating(true);
    setState(open ? "open" : "closed");
    const timeout = window.setTimeout(() => setAnimating(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, open]);

  return { state, animating };
}
