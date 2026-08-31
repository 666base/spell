import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

const MOVE_THRESHOLD = 12;

function clearTextSelection() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) selection.removeAllRanges();
}

export function useLongPress(onOpen: () => void, onClick: () => void) {
  const timerRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const openedRef = useRef(false);
  const ignoreClickRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  const onClickRef = useRef(onClick);
  onOpenRef.current = onOpen;
  onClickRef.current = onClick;

  const blockSelect = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  const clearTimer = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  };

  const stopBlockingSelect = () => {
    document.removeEventListener("selectstart", blockSelect, true);
    clearTextSelection();
  };

  const cancelGesture = () => {
    clearTimer();
    startRef.current = null;
    stopBlockingSelect();
  };

  const openMenu = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    ignoreClickRef.current = true;
    clearTimer();
    clearTextSelection();
    onOpenRef.current();
  };

  useEffect(
    () => () => {
      clearTimer();
      document.removeEventListener("selectstart", blockSelect, true);
    },
    [blockSelect],
  );

  return {
    draggable: false,
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      openedRef.current = false;
      ignoreClickRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      document.addEventListener("selectstart", blockSelect, true);
      clearTextSelection();
      clearTimer();
      const listeners = { onMove: (_move: PointerEvent) => {}, onUp: () => {}, onCancel: () => {} };
      listeners.onMove = (move: PointerEvent) => {
        const start = startRef.current;
        if (!start) return;
        if (
          Math.abs(move.clientX - start.x) > MOVE_THRESHOLD ||
          Math.abs(move.clientY - start.y) > MOVE_THRESHOLD
        ) {
          ignoreClickRef.current = true;
          cancelGesture();
          window.removeEventListener("pointermove", listeners.onMove);
          window.removeEventListener("pointerup", listeners.onUp);
          window.removeEventListener("pointercancel", listeners.onCancel);
        }
      };
      listeners.onUp = () => {
        window.removeEventListener("pointermove", listeners.onMove);
        window.removeEventListener("pointerup", listeners.onUp);
        window.removeEventListener("pointercancel", listeners.onCancel);
        startRef.current = null;
        clearTimer();
        stopBlockingSelect();
      };
      listeners.onCancel = () => {
        window.removeEventListener("pointermove", listeners.onMove);
        window.removeEventListener("pointerup", listeners.onUp);
        window.removeEventListener("pointercancel", listeners.onCancel);
        ignoreClickRef.current = true;
        cancelGesture();
      };
      window.addEventListener("pointermove", listeners.onMove);
      window.addEventListener("pointerup", listeners.onUp);
      window.addEventListener("pointercancel", listeners.onCancel);
      timerRef.current = window.setTimeout(openMenu, 380);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (
        Math.abs(event.clientX - start.x) > MOVE_THRESHOLD ||
        Math.abs(event.clientY - start.y) > MOVE_THRESHOLD
      ) {
        ignoreClickRef.current = true;
        cancelGesture();
      }
    },
    onPointerUp: () => {},
    onPointerCancel: () => {
      ignoreClickRef.current = true;
      cancelGesture();
    },
    onClick: (event: ReactMouseEvent) => {
      if (openedRef.current || ignoreClickRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onClickRef.current();
    },
    onContextMenu: (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startRef.current = null;
      openMenu();
      stopBlockingSelect();
    },
    onSelectStart: (event: ReactMouseEvent) => {
      event.preventDefault();
    },
  };
}
