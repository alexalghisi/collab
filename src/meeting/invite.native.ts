import { Share } from 'react-native';

export const INVITE_ACTION_LABEL = 'Invite';

export function readRoomFromLink(): string | null {
  return null;
}

export function buildInviteLink(roomId: string): string {
  const base = process.env.EXPO_PUBLIC_APP_URL?.trim();
  if (!base) {
    return roomId;
  }
  try {
    const url = new URL(base.includes('://') ? base : `https://${base}`);
    url.search = new URLSearchParams({ room: roomId }).toString();
    return url.toString();
  } catch {
    return roomId;
  }
}

export function syncRoomInLink(_roomId: string | null): void {
  // Mobile has no address bar to keep in sync.
}

export async function shareInvite(roomId: string): Promise<void> {
  await Share.share({ message: `Join my Collab meeting with ID ${roomId}` });
}
