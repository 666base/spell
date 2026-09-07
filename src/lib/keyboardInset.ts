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

/** Layout-Y of the visible area's bottom — the top edge of the IME if it is open. */
export function keyboardOcclusionTop(args: {
  innerHeight: number;
  visualOffsetTop: number;
  visualHeight: number;
  nativeIme: number;
  virtualIme: number;
}): number {
  const visualBottom = args.visualOffsetTop + args.visualHeight;
  const nativeTop = args.innerHeight - Math.max(0, args.nativeIme);
  const virtualTop = args.innerHeight - Math.max(0, args.virtualIme);
  return Math.max(0, Math.min(visualBottom, nativeTop, virtualTop));
}

/**
 * `position:fixed; top:0; transform:translateY(y)` places the toolbar so its
 * bottom edge sits on the keyboard, without using CSS `bottom` on the layout
 * viewport (which stays full-screen while the IME overlays).
 */
export function pinToolbarAboveKeyboard(args: {
  innerHeight: number;
  visualOffsetTop: number;
  visualHeight: number;
  nativeIme: number;
  virtualIme: number;
  toolbarHeight: number;
}): { y: number; inset: number; keyboardTop: number } {
  const keyboardTop = keyboardOcclusionTop(args);
  const inset = resolveKeyboardInset([
    visualViewportGap(args.innerHeight, {
      offsetTop: args.visualOffsetTop,
      height: args.visualHeight,
    }),
    args.nativeIme,
    args.virtualIme,
  ]);
  return {
    keyboardTop,
    inset,
    y: Math.max(0, keyboardTop - Math.max(0, args.toolbarHeight)),
  };
}
