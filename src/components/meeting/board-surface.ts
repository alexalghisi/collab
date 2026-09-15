import type { ReactNode } from 'react';
import type { UploadableFile } from '../../files/upload';

export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoardSurfaceProps {
  readonly children: ReactNode;
  readonly onFiles: (files: UploadableFile[], point: BoardPoint) => void;
  readonly disabled?: boolean;
}
