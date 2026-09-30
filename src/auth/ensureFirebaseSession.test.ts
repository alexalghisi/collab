import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(),
}));

import { signInAnonymously } from 'firebase/auth';
import { ensureFirebaseSession } from './ensureFirebaseSession';

describe('ensureFirebaseSession', () => {
  it('is false when Firebase is not configured', async () => {
    await expect(ensureFirebaseSession(null)).resolves.toBe(false);
  });

  it('is true when a user is already signed in', async () => {
    const auth = { currentUser: { uid: 'u1' } } as never;
    await expect(ensureFirebaseSession(auth)).resolves.toBe(true);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously so Firestore rules see request.auth', async () => {
    const auth = { currentUser: null } as { currentUser: { uid: string } | null };
    vi.mocked(signInAnonymously).mockImplementation(async () => {
      auth.currentUser = { uid: 'anon' };
      return {} as never;
    });
    await expect(ensureFirebaseSession(auth as never)).resolves.toBe(true);
    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it('is false when anonymous sign-in is disabled', async () => {
    vi.mocked(signInAnonymously).mockRejectedValueOnce(new Error('admin-restricted-operation'));
    const auth = { currentUser: null } as never;
    await expect(ensureFirebaseSession(auth)).resolves.toBe(false);
  });
});
