import { createElement, useState, type DragEvent } from 'react';
import { pickBrowserFiles, uploadableFromBrowserFile } from '../../files/browser';
import type { UploadableFile } from '../../files/upload';
import { colors } from '../../theme';
import type { FileDropProps } from './file-drop';

export type { FileDropProps };

function filesFromList(list: FileList | File[]): UploadableFile[] {
  return [...list].map(uploadableFromBrowserFile);
}

/** Click to pick, or drop files onto the card. */
export function FileDrop({
  children,
  onFiles,
  disabled = false,
  clickToPick = true,
}: FileDropProps) {
  const [over, setOver] = useState(false);

  const highlight = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      setOver(true);
    }
  };

  const pick = () => {
    if (disabled) {
      return;
    }
    void pickBrowserFiles().then((picked) => {
      if (picked.length > 0) {
        onFiles(filesFromList(picked));
      }
    });
  };

  return createElement(
    'div',
    {
      role: clickToPick ? 'button' : undefined,
      tabIndex: clickToPick && !disabled ? 0 : undefined,
      'aria-label': clickToPick ? 'Add files' : undefined,
      onDragEnter: highlight,
      onDragOver: highlight,
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) {
          onFiles(filesFromList(event.dataTransfer.files));
        }
      },
      onClick: clickToPick ? pick : undefined,
      onKeyDown: clickToPick
        ? (event: { key: string; preventDefault(): void }) => {
            if (disabled || (event.key !== 'Enter' && event.key !== ' ')) {
              return;
            }
            event.preventDefault();
            pick();
          }
        : undefined,
      style: {
        borderRadius: 16,
        outline: over ? `2px solid ${colors.primary}` : 'none',
        cursor: clickToPick && !disabled ? 'pointer' : undefined,
      },
    },
    children,
  );
}
