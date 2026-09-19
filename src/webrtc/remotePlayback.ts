import { attachRemoteAudio } from './attachMedia';

const players = new Map<string, () => void>();

export function playPeerAudio(peerId: string, stream: MediaStream): void {
  if (typeof document === 'undefined') {
    return;
  }
  stopPeerAudio(peerId);
  players.set(peerId, attachRemoteAudio(stream));
}

export function stopPeerAudio(peerId: string): void {
  players.get(peerId)?.();
  players.delete(peerId);
}

export function stopAllPeerAudio(): void {
  for (const peerId of [...players.keys()]) {
    stopPeerAudio(peerId);
  }
}
