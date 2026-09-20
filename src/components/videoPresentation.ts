import type { PeerState } from '../signaling/events';

export type VideoFit = 'contain' | 'cover';

export interface VideoPresentation {
  readonly fit: VideoFit;
  readonly mirror: boolean;
}

export function videoPresentation(state: PeerState, mirror: boolean): VideoPresentation {
  if (state.screenSharing) {
    return { fit: 'contain', mirror: false };
  }
  return { fit: 'cover', mirror };
}
