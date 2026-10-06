import { attachRemoteAudio } from './attachMedia';

interface Speaker {
  readonly stop: () => void;
  readonly signature: string;
}

const players = new Map<string, Speaker>();

function audioSignature(stream: MediaStream): string {
  return stream
    .getAudioTracks()
    .map((track) => track.id)
    .join('\n');
}

export function playPeerAudio(peerId: string, stream: MediaStream): void {
  if (typeof document === 'undefined') {
    return;
  }
  const signature = audioSignature(stream);
  const current = players.get(peerId);
  if (current?.signature === signature) {
    return;
  }
  current?.stop();
  players.set(peerId, { stop: attachRemoteAudio(stream), signature });
}

export function stopPeerAudio(peerId: string): void {
  players.get(peerId)?.stop();
  players.delete(peerId);
}

export function stopAllPeerAudio(): void {
  for (const peerId of [...players.keys()]) {
    stopPeerAudio(peerId);
  }
}
