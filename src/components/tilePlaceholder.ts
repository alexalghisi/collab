import type { PeerState } from '../signaling/events';
import { cameraOn } from '../webrtc/captureState';

/** A tile falls back to the avatar when the camera is off, unless it shows a shared screen. */
export function showsPlaceholder(state: PeerState, stream: MediaStream | undefined): boolean {
  if (state.screenSharing) {
    return false;
  }
  return state.videoOff || !cameraOn(stream);
}
