import { Router, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import {
  ATTACHMENT_REJECTION_MESSAGES,
  MAX_FILE_BYTES,
  isAllowedMimeType,
  isPreviewableMime,
  mimeOf,
  type AttachmentRejection,
} from '../../../src/files/attachments';
import { RateLimiter } from '../execution/RateLimiter';
import type { FileStore } from './FileStore';

const REJECTION_STATUS: Record<AttachmentRejection, number> = {
  'no-file': 400,
  'unsupported-type': 415,
  'file-too-large': 413,
  'room-full': 507,
  'not-in-room': 403,
  'rate-limited': 429,
};

/** Answers whether a session is still a participant of a room. */
export type Membership = (roomId: string, sessionId: string) => boolean;

export interface UploadRouterOptions {
  readonly store: FileStore;
  readonly membership: Membership;
  readonly limiter?: RateLimiter;
}

/** Six uploads in a burst, one more every ten seconds. */
const DEFAULT_LIMITER = () => new RateLimiter({ burst: 6, refillMs: 10_000 });

// Files stay in memory on their way to the store, and multer refuses anything
// over the cap while it reads, so an oversized upload is never held in full.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 },
}).single('file');

const refuse = (response: Response, reason: AttachmentRejection): void => {
  response.status(REJECTION_STATUS[reason]).json({ error: ATTACHMENT_REJECTION_MESSAGES[reason] });
};

const field = (request: Request, name: string): string => {
  const value = (request.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
};

/**
 * Receives the files a room shares. Every limit that matters is applied here
 * rather than in the picker: the size, the type, whether the sender is still in
 * the meeting, and how often they may do it. A client can only ask.
 */
export function filesRouter({
  store,
  membership,
  limiter = DEFAULT_LIMITER(),
}: UploadRouterOptions): Router {
  const router = Router();

  router.post('/files', (request, response) => {
    upload(request, response, (error: unknown) => {
      if (error instanceof MulterError) {
        refuse(response, error.code === 'LIMIT_FILE_SIZE' ? 'file-too-large' : 'no-file');
        return;
      }
      if (error) {
        response.status(400).json({ error: ATTACHMENT_REJECTION_MESSAGES['no-file'] });
        return;
      }

      const roomId = field(request, 'roomId');
      const sessionId = field(request, 'sessionId');
      if (roomId === '' || sessionId === '' || !membership(roomId, sessionId)) {
        refuse(response, 'not-in-room');
        return;
      }
      const file = request.file;
      if (!file) {
        refuse(response, 'no-file');
        return;
      }
      const mimeType = mimeOf(file.originalname, file.mimetype);
      if (!isAllowedMimeType(mimeType)) {
        refuse(response, 'unsupported-type');
        return;
      }
      if (!limiter.take([`room:${roomId}`, `session:${sessionId}`])) {
        refuse(response, 'rate-limited');
        return;
      }

      const stored = store.put({
        roomId,
        sessionId,
        name: file.originalname,
        mimeType,
        bytes: file.buffer,
      });
      if (!stored.ok) {
        refuse(response, stored.reason);
        return;
      }
      response.status(201).json(stored.attachment);
    });
  });

  router.get('/files/:id', (request, response) => {
    const file = store.get(request.params.id);
    if (!file) {
      response.status(404).json({ error: 'That file is no longer available.' });
      return;
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Type', file.mimeType);
    const disposition = isPreviewableMime(file.mimeType) ? 'inline' : 'attachment';
    response.setHeader('Content-Disposition', `${disposition}; filename="${file.name}"`);
    response.send(file.bytes);
  });

  return router;
}
