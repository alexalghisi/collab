import type { FirebaseOptions } from 'firebase/app';

/**
 * Reads the Firebase web configuration from public environment variables.
 * Returns null when the project is not configured, which keeps signaling,
 * team chat and the meeting store on their local alternatives. Accounts do
 * not come from here: they live in the signaling server's own database.
 */
export function readFirebaseConfig(): FirebaseOptions | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return { apiKey, authDomain, projectId, appId };
}
