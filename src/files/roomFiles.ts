import { visibleChatMessages } from '../chat/messages';
import type { BoardFile, ChatMessage } from '../signaling/events';
import type { FileAttachment } from './attachments';

export interface SharedRoomFile {
  readonly id: string;
  readonly file: FileAttachment;
  readonly byPeerId: string;
  readonly byDisplayName: string;
}

export function sharedRoomFiles(
  messages: readonly ChatMessage[],
  boardFiles: readonly BoardFile[],
  namesByPeerId: Readonly<Record<string, string>> = {},
): SharedRoomFile[] {
  const seen = new Set<string>();
  const files: SharedRoomFile[] = [];

  const add = (file: FileAttachment | null, byPeerId: string, byDisplayName: string): void => {
    if (!file || seen.has(file.id)) {
      return;
    }
    seen.add(file.id);
    files.push({ id: file.id, file, byPeerId, byDisplayName });
  };

  for (const message of visibleChatMessages(messages)) {
    add(message.file, message.peerId, message.displayName);
  }
  for (const item of boardFiles) {
    add(item.file, item.peerId, namesByPeerId[item.peerId] ?? '');
  }
  return files;
}
