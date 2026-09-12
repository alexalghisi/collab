import { SIGNALING_URL } from '../signaling/config';

const configured = process.env.EXPO_PUBLIC_EXECUTION_URL?.trim();

/**
 * The execution service lives in the same process as the signaling server, so
 * that URL is the default. It only needs setting when the sandbox is deployed
 * separately, or when signaling runs through Firestore and therefore has no URL
 * of its own.
 */
export const EXECUTION_URL = configured || SIGNALING_URL;
