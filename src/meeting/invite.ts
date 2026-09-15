const ROOM_PARAM = 'room';

export const INVITE_ACTION_LABEL = 'Invite';

/** Room id carried by an invite link such as `https://…/collab/?room=kqz-wrtm-pfa`. */
export function readRoomFromLink(): string | null {
  return new URLSearchParams(window.location.search).get(ROOM_PARAM);
}

export function buildInviteLink(roomId: string): string {
  const base = process.env.EXPO_PUBLIC_APP_URL?.trim();
  let url: URL;
  try {
    url = base
      ? new URL(base.includes('://') ? base : `https://${base}`)
      : new URL(window.location.href);
  } catch {
    url = new URL(window.location.href);
  }
  url.search = new URLSearchParams({ [ROOM_PARAM]: roomId }).toString();
  return url.toString();
}

/** Keeps the address bar shareable while in a meeting, and clean afterwards. */
export function syncRoomInLink(roomId: string | null): void {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set(ROOM_PARAM, roomId);
  } else {
    url.searchParams.delete(ROOM_PARAM);
  }
  window.history.replaceState(null, '', url);
}

export function shareInvite(roomId: string): Promise<void> {
  return navigator.clipboard.writeText(buildInviteLink(roomId));
}
