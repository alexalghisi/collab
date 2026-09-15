import type { ReactNode } from 'react';
import type { UploadableFile } from '../../files/upload';

export interface FileDropProps {
  readonly children: ReactNode;
  readonly onFiles: (files: UploadableFile[]) => void;
  readonly disabled?: boolean;
  /** When false, only a drop adds files — the children keep their own clicks. */
  readonly clickToPick?: boolean;
}
