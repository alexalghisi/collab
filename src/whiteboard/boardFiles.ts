import { isFileAttachment } from '../chat/messages';
import type { FileAttachment } from '../files/attachments';
import type { BoardFile } from '../signaling/events';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function previewSize(mimeType: string): { readonly w: number; readonly h: number } {
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
    return { w: 0.36, h: 0.3 };
  }
  if (mimeType === 'application/pdf') {
    return { w: 0.4, h: 0.46 };
  }
  if (mimeType.startsWith('audio/')) {
    return { w: 0.34, h: 0.12 };
  }
  return { w: 0.3, h: 0.16 };
}

export function normalizeBoardFile(
  input: unknown,
  file: FileAttachment,
  peerId: string,
): BoardFile | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const draft = input as Partial<BoardFile>;
  if (typeof draft.id !== 'string' || draft.id === '' || !isFileAttachment(file)) {
    return null;
  }
  const size = previewSize(file.mimeType);
  const w = clamp(unit(draft.w, size.w), 0.12, 0.8);
  const h = clamp(unit(draft.h, size.h), 0.1, 0.8);
  return {
    id: draft.id,
    peerId,
    file,
    x: clamp(unit(draft.x, 0.08), 0, 1 - w),
    y: clamp(unit(draft.y, 0.08), 0, 1 - h),
    w,
    h,
  };
}
