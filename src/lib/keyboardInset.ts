export const KEYBOARD_OPEN_PX = 80;

export function visualViewportGap(
  innerHeight: number,
  viewport: { offsetTop: number; height: number } | null | undefined,
): number {
  if (!viewport) return 0;
  return Math.max(0, innerHeight - (viewport.offsetTop + viewport.height));
}

export function readNativeIme(win: {
  SpellIme?: { getInset?: () => number };
  __SPELL_IME__?: number;
}): number {
  let bridged = 0;
  try {
    const value = win.SpellIme?.getInset?.();
    if (typeof value === "number" && Number.isFinite(value)) bridged = value;
  } catch {
    // Native bridge is optional in the web preview.
  }
  const stored = Number(win.__SPELL_IME__);
  const fallback = Number.isFinite(stored) ? stored : 0;
  return Math.max(0, bridged, fallback);
}

export function readCssKeyboardInset(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function resolveKeyboardInset(sources: readonly number[]): number {
  let max = 0;
  for (const value of sources) {
    if (Number.isFinite(value) && value > max) max = value;
  }
  return Math.round(max);
}

export function isKeyboardOpen(inset: number): boolean {
  return inset > KEYBOARD_OPEN_PX;
}
