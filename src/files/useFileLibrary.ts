import { useCallback, useEffect, useState } from 'react';
import { AttachmentError } from './upload';
import { getFileLibrary, type LibraryFile } from './library';
import type { UploadableFile } from './upload';

export interface FileLibraryState {
  readonly files: LibraryFile[];
  readonly error: string | null;
  readonly busy: boolean;
  add: (files: UploadableFile[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  download: (id: string, name: string) => Promise<void>;
}

export function useFileLibrary(ownerId: string): FileLibraryState {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setFiles(await getFileLibrary().list(ownerId));
  }, [ownerId]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not load your files.');
    });
  }, [refresh]);

  const add = useCallback(
    async (picked: UploadableFile[]) => {
      setBusy(true);
      setError(null);
      try {
        for (const file of picked) {
          await getFileLibrary().add(ownerId, file);
        }
        await refresh();
      } catch (cause) {
        setError(
          cause instanceof AttachmentError || cause instanceof Error
            ? cause.message
            : 'Could not add that file.',
        );
      } finally {
        setBusy(false);
      }
    },
    [ownerId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await getFileLibrary().remove(ownerId, id);
      await refresh();
    },
    [ownerId, refresh],
  );

  const download = useCallback(
    async (id: string, name: string) => {
      const blob = await getFileLibrary().read(ownerId, id);
      if (typeof document === 'undefined') {
        return;
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = name;
      link.click();
      URL.revokeObjectURL(href);
    },
    [ownerId],
  );

  return { files, error, busy, add, remove, download };
}
