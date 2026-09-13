const configured = process.env.EXPO_PUBLIC_SIGNALING_URL?.trim();

/**
 * Falls back to the local dev server. A hosted build (GitHub Pages, desktop
 * shell) must set EXPO_PUBLIC_SIGNALING_URL at build time unless Firebase is
 * configured, otherwise it points every visitor at their own machine.
 */
export const SIGNALING_URL = configured || 'http://localhost:4000';
