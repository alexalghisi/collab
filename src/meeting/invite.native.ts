import { Share } from 'react-native';

export const INVITE_ACTION_LABEL = 'Share';

export function readRoomFromLink(): string | null {
  return null;
}

export function buildInviteLink(roomId: string): string {
  return roomId;
}

export function syncRoomInLink(_roomId: string | null): void {
  // Mobile has no address bar to keep in sync.
}

export async function shareInvite(roomId: string): Promise<void> {
  await Share.share({ message: `Join my Collab meeting with ID ${roomId}` });
}
