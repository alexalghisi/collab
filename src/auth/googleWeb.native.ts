import type { GoogleCredential } from './types';

export async function requestGoogleCredential(): Promise<GoogleCredential> {
  throw new Error('Use the native Google sign-in button.');
}
