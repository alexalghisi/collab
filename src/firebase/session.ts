import { signInAnonymously, signOut } from 'firebase/auth';
import { firebaseAuth } from './app';

/**
 * Identity comes from this deployment's account database, but the optional
 * Firebase backends (Firestore signaling, team chat) only answer a request that
 * carries a Firebase token. An anonymous sign-in is that token: the rules still
 * refuse the public, while who somebody is stays a question for our own
 * database. Deployments that configure Firebase must enable Anonymous sign-in.
 *
 * With no Firebase project configured, both calls do nothing at all.
 */
export async function ensureBackendSession(): Promise<void> {
  if (!firebaseAuth || firebaseAuth.currentUser) {
    return;
  }
  try {
    await signInAnonymously(firebaseAuth);
  } catch {
    // Firestore-backed extras stay unavailable; meetings do not depend on them.
    console.warn('Anonymous Firebase sign-in failed; Firestore-backed features are unavailable.');
  }
}

export async function releaseBackendSession(): Promise<void> {
  if (firebaseAuth?.currentUser) {
    await signOut(firebaseAuth);
  }
}
