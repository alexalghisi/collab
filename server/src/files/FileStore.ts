import { randomUUID } from 'node:crypto';
import {
  MAX_FILE_BYTES,
  MAX_ROOM_FILE_BYTES,
  safeFileName,
  type AttachmentRejection,
  type FileAttachment,
} from '../../../src/files/attachments';

export interface StoredFile {
  readonly id: string;
  readonly roomId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
  readonly uploadedBy: string;
  readonly uploadedAt: number;
}

export interface Upload {
  readonly roomId: string;
  readonly sessionId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
}

export interface FileStoreLimits {
  readonly maxFileBytes: number;
  readonly maxRoomBytes: number;
}

export const DEFAULT_FILE_LIMITS: FileStoreLimits = {
  maxFileBytes: MAX_FILE_BYTES,
  maxRoomBytes: MAX_ROOM_FILE_BYTES,
};

/** Where the router serves a stored file; the client resolves it against the server. */
export const attachmentPath = (id: string): string => `/files/${id}`;

export type PutResult =
  | { readonly ok: true; readonly attachment: FileAttachment }
  | { readonly ok: false; readonly reason: AttachmentRejection };

/**
 * Files a room shared, held in memory for as long as the room exists — the same
 * lifetime as its whiteboard and its editor document. Nothing is written to
 * disk: a meeting is not a file host, and a process that keeps no files cannot
 * leak one after everybody has gone home.
 */
export class FileStore {
  private readonly files = new Map<string, StoredFile>();

  constructor(private readonly limits: FileStoreLimits = DEFAULT_FILE_LIMITS) {}

  put(upload: Upload): PutResult {
    if (upload.bytes.byteLength === 0) {
      return { ok: false, reason: 'no-file' };
    }
    if (upload.bytes.byteLength > this.limits.maxFileBytes) {
      return { ok: false, reason: 'file-too-large' };
    }
    if (this.bytesInRoom(upload.roomId) + upload.bytes.byteLength > this.limits.maxRoomBytes) {
      return { ok: false, reason: 'room-full' };
    }

    const id = randomUUID();
    const name = safeFileName(upload.name);
    this.files.set(id, {
      id,
      roomId: upload.roomId,
      name,
      mimeType: upload.mimeType,
      bytes: upload.bytes,
      uploadedBy: upload.sessionId,
      uploadedAt: Date.now(),
    });
    return {
      ok: true,
      attachment: {
        id,
        name,
        mimeType: upload.mimeType,
        size: upload.bytes.byteLength,
        url: attachmentPath(id),
      },
    };
  }

  get(id: string): StoredFile | undefined {
    return this.files.get(id);
  }

  /** The room's files go when the room does, so an empty room costs nothing. */
  clearRoom(roomId: string): void {
    for (const [id, file] of this.files) {
      if (file.roomId === roomId) {
        this.files.delete(id);
      }
    }
  }

  bytesInRoom(roomId: string): number {
    let total = 0;
    for (const file of this.files.values()) {
      if (file.roomId === roomId) {
        total += file.bytes.byteLength;
      }
    }
    return total;
  }
}
