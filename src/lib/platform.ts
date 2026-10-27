/** True on macOS and iOS, where shortcuts use ⌘ instead of Ctrl. */
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const MOD_KEY_LABEL = isMac ? "⌘K" : "Ctrl K";
