import { signInAnonymously, type Auth } from 'firebase/auth';

export async function ensureFirebaseSession(auth: Auth | null): Promise<boolean> {
  if (!auth) {
    return false;
  }
  if (auth.currentUser) {
    return true;
  }
  try {
    await signInAnonymously(auth);
    return Boolean(auth.currentUser);
  } catch {
    return false;
  }
}
