import type { FirebaseOptions } from 'firebase/app';

/**
 * Reads the Firebase web configuration from public environment variables.
 * Returns null when the project is not configured.
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

export const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '560742571865-eqeojukg2kqm2gmaumm79n2606e75pus.apps.googleusercontent.com';

export function readGoogleWebClientId(): string | null {
  const id = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (id && id.length > 0) {
    return id;
  }
  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as unknown as { electronAuth?: { clientId?: string } }).electronAuth?.clientId
  ) {
    return (globalThis as unknown as { electronAuth?: { clientId?: string } }).electronAuth!
      .clientId!;
  }
  return null;
}

export interface GoogleClientIds {
  readonly webClientId?: string;
  readonly iosClientId?: string;
  readonly androidClientId?: string;
}

export interface NativeAuthConfig {
  readonly google: GoogleClientIds | null;
  readonly facebookAppId: string | null;
}

/**
 * Reads the native OAuth client IDs from public environment variables.
 * On mobile, social sign-in runs through Expo AuthSession rather than the
 * Firebase web popup, so it needs the platform client IDs (Google) and/or a
 * Facebook app ID. Returns null when no provider is configured.
 */
export function readNativeAuthConfig(): NativeAuthConfig | null {
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || DEFAULT_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? null;

  const google =
    webClientId || iosClientId || androidClientId
      ? {
          webClientId: webClientId || undefined,
          iosClientId: iosClientId || undefined,
          androidClientId: androidClientId || undefined,
        }
      : null;

  if (!google && !facebookAppId) {
    return null;
  }

  return { google, facebookAppId };
}
