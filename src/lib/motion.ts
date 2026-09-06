/** JS mirror of the CSS motion tokens in `App.css`. Keep both in sync. */
export const MOTION_FAST_MS = 140;
export const MOTION_BASE_MS = 180;
export const MOTION_PANEL_MS = 220;
export const MOTION_PRESS_MS = 100;
/** Gliding list highlight. Matches Beautiful UI's hover pill, 220ms expo. */
export const MOTION_GLIDE_MS = 220;

export const MOTION_FAST_S = MOTION_FAST_MS / 1000;
export const MOTION_BASE_S = MOTION_BASE_MS / 1000;
export const MOTION_PANEL_S = MOTION_PANEL_MS / 1000;

export const EASE_OUT = [0.2, 0, 0, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
/** Expo ease-out for a highlight that translates, not for height of content. */
export const EASE_GLIDE = [0.23, 1, 0.32, 1] as const;
export const EASE_OUT_CSS = "cubic-bezier(0.2, 0, 0, 1)";
export const EASE_GLIDE_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";
