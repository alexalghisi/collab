/** A file that was accepted by a store and can be handed to the room. */
export interface FileAttachment {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  /**
   * Where the file can be fetched. Absolute for a Storage download URL, and a
   * server path for the Socket.IO transport, which the client resolves against
   * the server it is already talking to.
   */
  readonly url: string;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Enough for a handful of screenshots and a document per room, and no more. */
export const MAX_ROOM_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 120;

/**
 * An allow-list rather than a block-list: a room is a group of people who were
 * invited to talk, not a file host, and everything outside this set is a way to
 * hand someone something they did not ask for.
 */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/json',
  'application/zip',
  'text/plain',
  'text/csv',
  'text/markdown',
];

export type AttachmentRejection =
  'no-file' | 'unsupported-type' | 'file-too-large' | 'room-full' | 'not-in-room' | 'rate-limited';

export const ATTACHMENT_REJECTION_MESSAGES: Record<AttachmentRejection, string> = {
  'no-file': 'Pick a file to send.',
  'unsupported-type': 'That kind of file cannot be shared here.',
  'file-too-large': `Files have to be smaller than ${formatBytes(MAX_FILE_BYTES)}.`,
  'room-full': 'This meeting has reached its shared file limit.',
  'not-in-room': 'You are no longer in this meeting.',
  'rate-limited': 'Too many uploads in a row — wait a moment and try again.',
};

export function isAllowedMimeType(mimeType: unknown): boolean {
  return typeof mimeType === 'string' && ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Names arrive from whatever the sender's operating system allowed, and end up
 * in a Content-Disposition header and a download prompt: strip the path and the
 * characters that let a name pretend to be something else.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/["\r\n\0]/g, '').trim();
  return (cleaned === '' ? 'file' : cleaned).slice(0, MAX_FILE_NAME_LENGTH);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
