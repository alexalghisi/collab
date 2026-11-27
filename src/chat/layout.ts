export const CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;

interface GroupedMessage {
  readonly peerId: string;
  readonly displayName: string;
  readonly sentAt: number;
}

export function startsChatGroup(
  previous: GroupedMessage | undefined,
  message: GroupedMessage,
): boolean {
  if (!previous) {
    return true;
  }
  if (previous.peerId !== message.peerId || previous.displayName !== message.displayName) {
    return true;
  }
  return message.sentAt - previous.sentAt > CHAT_GROUP_WINDOW_MS;
}

export function chatInitial(displayName: string): string {
  const first = Array.from(displayName.trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}

interface ComposerKey {
  readonly key?: string;
  readonly shiftKey?: boolean;
  readonly isComposing?: boolean;
}

export function sendsOnKey(event: ComposerKey): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}
