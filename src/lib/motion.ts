/** JS mirror of the CSS motion tokens in `App.css`. Keep both in sync. */
export const MOTION_FAST_MS = 140;
export const MOTION_BASE_MS = 180;
export const MOTION_PANEL_MS = 220;
export const MOTION_PRESS_MS = 100;

export const MOTION_FAST_S = MOTION_FAST_MS / 1000;
export const MOTION_BASE_S = MOTION_BASE_MS / 1000;
export const MOTION_PANEL_S = MOTION_PANEL_MS / 1000;

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
export const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";
