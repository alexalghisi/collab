import { indexMeeting } from '../search/sources';
import type { Embedder, VectorStore } from '../search/VectorStore';
import { gatherContext } from './tools';
import type { AssistantContext, AssistantEvent, AssistantModel } from './types';

export const ASSISTANT_UNAVAILABLE = 'The meeting assistant is not enabled on this deployment.';

export class MeetingAssistant {
  constructor(
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
    private readonly model: AssistantModel | null,
  ) {}

  async answer(context: AssistantContext): Promise<AssistantEvent[]> {
    if (!this.model) {
      return [{ type: 'error', error: ASSISTANT_UNAVAILABLE }];
    }
    const question = context.question.trim();
    if (question === '') {
      return [{ type: 'error', error: 'Ask a question about the meeting.' }];
    }
    await indexMeeting(this.store, this.embedder, {
      meetingId: context.meetingId,
      roomId: context.roomId,
      transcript: context.transcript.map((turn, index) => ({
        id: `${context.meetingId}-${index}`,
        peerId: turn.displayName,
        displayName: turn.displayName,
        text: turn.text,
        startedAt: turn.startedAt,
        endedAt: turn.startedAt,
      })),
      notes: context.notes,
      messages: context.messages,
    });
    try {
      const gathered = await gatherContext(context, this.store, this.embedder);
      const result = await this.model.complete(question, gathered);
      const events: AssistantEvent[] = [];
      if (result.text) {
        events.push({ type: 'token', text: result.text });
      }
      events.push({ type: 'done', text: result.text, actions: result.actions });
      return events;
    } catch (cause) {
      return [{ type: 'error', error: (cause as Error).message }];
    }
  }
}
