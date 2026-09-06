/** Offset of a row inside its glide root, in the root's local coordinates. */
export function glideOffset(
  root: Pick<DOMRect, "top">,
  row: Pick<DOMRect, "top" | "height">,
): { top: number; height: number } {
  return {
    top: row.top - root.top,
    height: row.height,
  };
}

/** Pixel-grid cell delays from Beautiful UI's Drive loader (3×3, ms). */
export const PIXEL_LOADER_DELAYS_MS = [90, 180, 270, 0, 90, 180, 90, 180, 270] as const;

export function formatElapsedSeconds(startedAt: number, now: number): string {
  return Math.max(0, (now - startedAt) / 1000).toFixed(1);
}
