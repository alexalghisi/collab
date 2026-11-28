import { createElement, useEffect, useRef, useState, type DragEvent } from 'react';
import { uploadableFromBrowserFile } from '../../files/browser';
import { colors } from '../../theme';
import { PASTED_TEXT_NAME, pastePoint, pastedText } from '../../whiteboard/boardText';
import type { BoardPoint, BoardSurfaceProps } from './board-surface';

export type { BoardPoint, BoardSurfaceProps } from './board-surface';

function filesFromList(list: FileList | File[]) {
  return [...list].map(uploadableFromBrowserFile);
}

function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  const listed = [...data.files];
  if (listed.length > 0) {
    return listed;
  }
  const files: File[] = [];
  for (const item of data.items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }
  if (files.length > 0) {
    return files;
  }
  const text = pastedText(data.getData('text/plain'));
  return text === null ? [] : [new File([text], PASTED_TEXT_NAME, { type: 'text/plain' })];
}

function pointOf(event: {
  currentTarget: HTMLDivElement;
  clientX: number;
  clientY: number;
}): BoardPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / height)),
  };
}

export function BoardSurface({ children, onFiles, disabled = false }: BoardSurfaceProps) {
  const [over, setOver] = useState(false);
  const pastes = useRef(0);

  const highlight = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      setOver(true);
    }
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const files = filesFromClipboard(event.clipboardData);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      onFiles(filesFromList(files), pastePoint(pastes.current));
      pastes.current += 1;
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, onFiles]);

  return createElement(
    'div',
    {
      tabIndex: 0,
      'aria-label': 'Whiteboard. Paste text, or paste or drop a file to preview it.',
      onDragEnter: highlight,
      onDragOver: highlight,
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setOver(false);
        if (disabled) {
          return;
        }
        const files = filesFromList(filesFromClipboard(event.dataTransfer));
        if (files.length > 0) {
          onFiles(files, pointOf(event));
        }
      },
      style: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        outline: over ? `2px solid ${colors.primary}` : 'none',
        outlineOffset: -2,
      },
    },
    children,
  );
}
