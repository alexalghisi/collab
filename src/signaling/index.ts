import { firestore } from '../firebase/app';
import { SIGNALING_URL } from './config';
import { createFirestoreSignaling } from './FirestoreSignaling';
import { createSocketSignaling } from './SocketSignaling';
import type { SignalingFactory } from './SignalingChannel';

/**
 * Web: with Firebase configured, rooms are coordinated through Firestore and
 * no signaling server is needed. Otherwise fall back to the Socket.IO server.
 */
export const createSignaling: SignalingFactory = firestore
  ? createFirestoreSignaling(firestore)
  : createSocketSignaling(SIGNALING_URL);
