import { describe, expect, it } from 'vitest';
import type { BoardFile, ChatMessage } from '../signaling/events';
import type { FileAttachment } from './attachments';
import { sharedRoomFiles } from './roomFiles';

const png: FileAttachment = {
  id: 'file-png',
  name: 'shot.png',
  mimeType: 'image/png',
  size: 12,
  url: '/files/file-png',
};

const pdf: FileAttachment = {
  id: 'file-pdf',
  name: 'spec.pdf',
  mimeType: 'application/pdf',
  size: 40,
  url: '/files/file-pdf',
};

function message(
  id: string,
  file: FileAttachment | null,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    peerId: 'ada',
    displayName: 'Ada',
    text: '',
    sentAt: 1,
    file,
    ...extra,
  };
}

function board(file: FileAttachment, peerId = 'linus'): BoardFile {
  return { id: `board-${file.id}`, peerId, file, x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
}

describe('sharedRoomFiles', () => {
  it('lists chat attachments in the order they were sent', () => {
    expect(sharedRoomFiles([message('m1', png), message('m2', pdf)], [])).toEqual([
      { id: png.id, file: png, byPeerId: 'ada', byDisplayName: 'Ada' },
      { id: pdf.id, file: pdf, byPeerId: 'ada', byDisplayName: 'Ada' },
    ]);
  });

  it('skips deleted chat messages and files already on the board', () => {
    const files = sharedRoomFiles(
      [message('m1', png), message('gone', pdf, { deletedAt: 9 })],
      [board(png), board(pdf)],
      { linus: 'Linus' },
    );

    expect(files).toEqual([
      { id: png.id, file: png, byPeerId: 'ada', byDisplayName: 'Ada' },
      { id: pdf.id, file: pdf, byPeerId: 'linus', byDisplayName: 'Linus' },
    ]);
  });

  it('returns nothing when the room has not shared a file', () => {
    expect(sharedRoomFiles([message('m1', null)], [])).toEqual([]);
  });
});
