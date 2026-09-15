import { describe, expect, it } from 'vitest';
import { MemoryLibrary } from './library';
import type { UploadableFile } from './upload';

function upload(name: string, type: string, body: string): UploadableFile {
  const blob = new Blob([body], { type });
  return { name, mimeType: type, size: blob.size, uri: `blob:${name}`, blob };
}

describe('MemoryLibrary', () => {
  it('keeps a file for its owner and not for someone else', async () => {
    const library = new MemoryLibrary();
    const added = await library.add('ada', upload('notes.txt', 'text/plain', 'hello'));

    expect(await library.list('ada')).toEqual([
      expect.objectContaining({ id: added.id, name: 'notes.txt', mimeType: 'text/plain' }),
    ]);
    expect(await library.list('linus')).toEqual([]);
    await expect(library.read('ada', added.id).then((blob) => blob.text())).resolves.toBe('hello');
  });

  it('rejects a type the allow-list does not include', async () => {
    const library = new MemoryLibrary();
    await expect(
      library.add('ada', upload('run.exe', 'application/x-msdownload', 'MZ')),
    ).rejects.toThrow('That kind of file cannot be shared here.');
  });

  it('removes a file so it can no longer be read', async () => {
    const library = new MemoryLibrary();
    const added = await library.add('ada', upload('notes.txt', 'text/plain', 'hello'));
    await library.remove('ada', added.id);
    expect(await library.list('ada')).toEqual([]);
    await expect(library.read('ada', added.id)).rejects.toThrow(
      'That file is no longer on this device.',
    );
  });
});
