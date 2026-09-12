import { MeetingAssistant } from '../../../src/assistant/MeetingAssistant';
import { createSdkModelFromEnv } from '../../../src/assistant/providers';
import type { AssistantContext, AssistantEvent } from '../../../src/assistant/types';
import { createHashEmbedder, createEmbedderFromEnv } from '../../../src/search/embed';
import { createVectorStore } from '../../../src/search/createStore';
import { RateLimiter } from '../execution/RateLimiter';

const limiter = new RateLimiter({ burst: 4, refillMs: 8_000 });

const sharedStore = createVectorStore(process.env.VECTOR_STORE);

export function meetingIndexStore() {
  return sharedStore;
}

export function createMeetingAssistant(): MeetingAssistant {
  return new MeetingAssistant(
    sharedStore,
    process.env.OPENAI_API_KEY ? createEmbedderFromEnv() : createHashEmbedder(),
    createSdkModelFromEnv(),
  );
}

export function acceptAssistantAsk(
  context: AssistantContext,
  keys: string[],
  inRoom: boolean,
): { ok: true } | { ok: false; error: string } {
  if (!inRoom) {
    return { ok: false, error: 'You are no longer in this meeting.' };
  }
  if (context.question.trim() === '') {
    return { ok: false, error: 'Ask a question about the meeting.' };
  }
  if (!limiter.take(keys)) {
    return { ok: false, error: 'Too many questions in a row — wait a moment and try again.' };
  }
  return { ok: true };
}

export async function runAssistant(
  assistant: MeetingAssistant,
  context: AssistantContext,
): Promise<AssistantEvent[]> {
  return assistant.answer(context);
}
