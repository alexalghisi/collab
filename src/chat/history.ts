import { storage } from '../meeting/storage';
import type { ChatMessage } from '../signaling/events';
import { isFileAttachment } from './messages';

export const MAX_CHAT_HISTORY = 200;

const historyKey = (roomId: string) => `collab.chat.${roomId}`;

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'string' &&
    message.id !== '' &&
    typeof message.peerId === 'string' &&
    typeof message.displayName === 'string' &&
    typeof message.text === 'string' &&
    typeof message.sentAt === 'number' &&
    Number.isFinite(message.sentAt) &&
    (message.file === null || isFileAttachment(message.file))
  );
}

export function chatMessagesOf(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isChatMessage);
}

export function parseChatMessages(raw: string | null): ChatMessage[] {
  if (!raw) {
    return [];
  }
  try {
    return chatMessagesOf(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function mergeChatHistory(
  ...lists: readonly (readonly ChatMessage[] | null | undefined)[]
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const message of list) {
      if (!byId.has(message.id)) {
        byId.set(message.id, message);
      }
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id))
    .slice(-MAX_CHAT_HISTORY);
}

export function loadChatHistory(roomId: string): ChatMessage[] {
  try {
    return mergeChatHistory(parseChatMessages(storage.read(historyKey(roomId))));
  } catch {
    return [];
  }
}

export function saveChatHistory(roomId: string, messages: ChatMessage[]): void {
  try {
    storage.write(historyKey(roomId), JSON.stringify(mergeChatHistory(messages)));
  } catch {
    return;
  }
}
