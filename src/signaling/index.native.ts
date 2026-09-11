import { SIGNALING_URL } from './config';
import { createSocketSignaling } from './SocketSignaling';
import type { SignalingFactory } from './SignalingChannel';

export const createSignaling: SignalingFactory = createSocketSignaling(SIGNALING_URL);
