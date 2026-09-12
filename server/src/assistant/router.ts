import { Router } from 'express';
import type { MeetingAssistant } from '../../../src/assistant/MeetingAssistant';
import type { AssistantContext } from '../../../src/assistant/types';
import { acceptAssistantAsk, runAssistant } from './service';

export function assistantRouter(assistant: MeetingAssistant): Router {
  const router = Router();

  router.post('/assistant', async (request, response) => {
    const context = request.body as AssistantContext;
    const accepted = acceptAssistantAsk(
      context,
      [`room:${context.roomId}`, `client:${request.ip ?? 'unknown'}`],
      true,
    );
    if (!accepted.ok) {
      response.status(400).json({ error: accepted.error });
      return;
    }
    const events = await runAssistant(assistant, context);
    const failure = events.find((event) => event.type === 'error');
    if (failure && failure.type === 'error') {
      response.status(503).json({ error: failure.error });
      return;
    }
    const done = events.find((event) => event.type === 'done');
    response.json(
      done && done.type === 'done'
        ? { text: done.text, actions: done.actions }
        : { text: '', actions: [] },
    );
  });

  return router;
}
