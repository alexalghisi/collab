import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { decodeUpdate, encodeUpdate, mergeEncodedUpdates } from './updates';

describe('update encoding', () => {
  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index;
    }

    expect(decodeUpdate(encodeUpdate(bytes))).toEqual(bytes);
  });

  it('pads inputs whose length is not a multiple of three', () => {
    for (const length of [0, 1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(length).fill(0xff);

      expect(encodeUpdate(bytes).length % 4).toBe(0);
      expect(decodeUpdate(encodeUpdate(bytes))).toEqual(bytes);
    }
  });

  it('matches the platform encoder', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);

    expect(encodeUpdate(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('decodes what the platform encoder produced', () => {
    const bytes = new Uint8Array([13, 0, 42, 200, 199]);

    expect(decodeUpdate(Buffer.from(bytes).toString('base64'))).toEqual(bytes);
  });
});

describe('mergeEncodedUpdates', () => {
  const historyOf = (edits: Array<[number, string]>): string[] => {
    const doc = new Y.Doc();
    const updates: string[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(encodeUpdate(update)));
    for (const [at, insert] of edits) {
      doc.getText('code').insert(at, insert);
    }
    return updates;
  };

  it('squashes a history into a single equivalent update', () => {
    const updates = historyOf([
      [0, 'const a = 1;\n'],
      [13, 'const b = 2;\n'],
      [0, '// header\n'],
    ]);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, decodeUpdate(mergeEncodedUpdates(updates)));

    expect(doc.getText('code').toString()).toBe('// header\nconst a = 1;\nconst b = 2;\n');
  });

  it('merges updates from separate peers regardless of order', () => {
    const ada = new Y.Doc();
    const linus = new Y.Doc();
    ada.getText('code').insert(0, 'ada');
    linus.getText('code').insert(0, 'linus');
    const updates = [
      encodeUpdate(Y.encodeStateAsUpdate(ada)),
      encodeUpdate(Y.encodeStateAsUpdate(linus)),
    ];

    const forwards = new Y.Doc();
    Y.applyUpdate(forwards, decodeUpdate(mergeEncodedUpdates(updates)));
    const backwards = new Y.Doc();
    Y.applyUpdate(backwards, decodeUpdate(mergeEncodedUpdates([...updates].reverse())));

    expect(forwards.getText('code').toString()).toBe(backwards.getText('code').toString());
    expect(forwards.getText('code').toString()).toHaveLength('adalinus'.length);
  });
});
