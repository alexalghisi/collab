import { describe, expect, it } from 'vitest';
import type { FileAttachment } from '../files/attachments';
import { normalizeBoardFile, previewSize } from './boardFiles';

const file: FileAttachment = {
  id: 'file-1',
  name: 'shot.png',
  mimeType: 'image/png',
  size: 12,
  url: '/files/file-1',
};

describe('board files', () => {
  it('keeps a pasted image on the canvas and clamps it to the board', () => {
    const item = normalizeBoardFile(
      { id: 'board-1', x: -2, y: 4, w: 0.36, h: 0.3 },
      file,
      'peer-1',
    );

    expect(item).toMatchObject({ id: 'board-1', peerId: 'peer-1', file, w: 0.36, h: 0.3 });
    expect(item?.x).toBe(0);
    expect(item?.y).toBeLessThanOrEqual(1 - 0.3);
  });

  it('sizes a document card smaller than an image', () => {
    expect(previewSize('application/zip').h).toBeLessThan(previewSize('image/png').h);
  });
});
