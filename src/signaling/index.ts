import { firebaseAuth, firestore } from '../firebase/app';
import { SIGNALING_URL } from './config';
import { createFirestoreSignaling } from './FirestoreSignaling';
import { createSocketSignaling } from './SocketSignaling';
import { shouldUseFirestoreSignaling } from './pickTransport';
import type { SignalingFactory } from './SignalingChannel';

export const createSignaling: SignalingFactory = (options) => {
  const factory = shouldUseFirestoreSignaling(firestore, Boolean(firebaseAuth?.currentUser))
    ? createFirestoreSignaling(firestore as NonNullable<typeof firestore>)
    : createSocketSignaling(SIGNALING_URL);
  return factory(options);
};
