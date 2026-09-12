import { Router, type Request } from 'express';
import { REJECTION_MESSAGES, type ExecutionChunk } from '../../../src/code/execution';
import type { ExecutionService } from './ExecutionService';

const REJECTION_STATUS: Record<string, number> = {
  unavailable: 503,
  'rate-limited': 429,
};

const keysFor = (request: Request): string[] => {
  const roomId = (request.body as { roomId?: unknown }).roomId;
  const room = typeof roomId === 'string' ? `room:${roomId}` : 'room:unknown';
  return [room, `client:${request.ip ?? 'unknown'}`];
};

/**
 * The Firestore transport has no server to relay a run through, so it posts here
 * instead. Same service, same caps: the socket path gets no more trust than this
 * one and neither is trusted with the sandbox's limits.
 */
export function executionRouter(execution: ExecutionService): Router {
  const router = Router();

  router.get('/execute', (_request, response) => {
    response.json({ enabled: execution.enabled, sandbox: execution.sandbox });
  });

  router.post('/execute', async (request, response) => {
    const accepted = execution.accept(request.body, keysFor(request));
    if (!accepted.ok) {
      response
        .status(REJECTION_STATUS[accepted.reason] ?? 400)
        .json({ error: REJECTION_MESSAGES[accepted.reason] });
      return;
    }

    const output: Record<ExecutionChunk['stream'], string> = { stdout: '', stderr: '' };
    try {
      const result = await execution.run(accepted.request, ({ stream, text }) => {
        output[stream] += text;
      });
      response.json({ ...output, ...result });
    } catch (cause) {
      response.status(502).json({ ...output, error: (cause as Error).message });
    }
  });

  return router;
}
