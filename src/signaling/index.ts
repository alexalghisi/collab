import { firebaseAuth, firestore } from '../firebase/app';
import { SIGNALING_URL } from './config';
import { FallbackChannel } from './fallbackSignaling';
import { createFirestoreSignaling } from './FirestoreSignaling';
import { createSocketSignaling } from './SocketSignaling';
import { shouldUseFirestoreSignaling } from './pickTransport';
import type { SignalingFactory } from './SignalingChannel';

export const createSignaling: SignalingFactory = (options) => {
  const socket = createSocketSignaling(SIGNALING_URL)(options);
  if (!shouldUseFirestoreSignaling(firestore, Boolean(firebaseAuth?.currentUser)) || !firestore) {
    return socket;
  }
  return new FallbackChannel(createFirestoreSignaling(firestore)(options), socket);
};
