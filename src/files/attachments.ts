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

const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/x-sh',
  'application/x-bat',
  'application/x-csh',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/vnd.microsoft.portable-executable',
  'application/x-dosexec',
  'application/wasm',
]);

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  pdf: 'application/pdf',
  json: 'application/json',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

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
  if (typeof mimeType !== 'string') {
    return false;
  }
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  return mime !== '' && !BLOCKED_MIME_TYPES.has(mime);
}

export function mimeOf(name: string, declared: string): string {
  const type = declared.toLowerCase().split(';')[0].trim();
  if (type !== '' && type !== 'application/octet-stream') {
    return type;
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? (type || 'application/octet-stream');
}

export function isPreviewableMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    mimeType === 'application/pdf'
  );
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
