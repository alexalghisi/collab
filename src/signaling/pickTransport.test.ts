import { describe, expect, it } from 'vitest';
import { shouldUseFirestoreSignaling } from './pickTransport';

describe('shouldUseFirestoreSignaling', () => {
  it('is false when Firebase Auth has no user', () => {
    expect(shouldUseFirestoreSignaling({ projectId: 'collab' }, false)).toBe(false);
  });

  it('is false when Firestore is not configured', () => {
    expect(shouldUseFirestoreSignaling(null, true)).toBe(false);
  });

  it('is true only with both a store and a signed-in user', () => {
    expect(shouldUseFirestoreSignaling({ projectId: 'collab' }, true)).toBe(true);
  });
});
