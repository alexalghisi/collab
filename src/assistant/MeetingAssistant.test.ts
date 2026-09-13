import { describe, expect, it } from 'vitest';
import { createHashEmbedder } from '../search/embed';
import { MemoryVectorStore } from '../search/MemoryVectorStore';
import { ASSISTANT_UNAVAILABLE, MeetingAssistant } from './MeetingAssistant';
import type { AssistantContext, AssistantModel } from './types';

const context: AssistantContext = {
  meetingId: 'm1',
  roomId: 'room',
  question: 'What did we decide about billing?',
  transcript: [
    { displayName: 'Ada', text: 'Ship the billing queue on Thursday.', startedAt: Date.now() },
  ],
  notes: 'Decision: Thursday.',
  messages: [],
};

describe('MeetingAssistant', () => {
  it('refuses to answer when no model is configured', async () => {
    const assistant = new MeetingAssistant(new MemoryVectorStore(), createHashEmbedder(16), null);
    await expect(assistant.answer(context)).resolves.toEqual([
      { type: 'error', error: ASSISTANT_UNAVAILABLE },
    ]);
  });

  it('refuses a blank question', async () => {
    const model: AssistantModel = {
      complete: async () => ({ text: 'nope', actions: [] }),
    };
    const assistant = new MeetingAssistant(new MemoryVectorStore(), createHashEmbedder(16), model);
    const events = await assistant.answer({ ...context, question: '   ' });
    expect(events[0]).toMatchObject({ type: 'error' });
  });

  it('streams the model reply and the structured actions', async () => {
    const model: AssistantModel = {
      complete: async () => ({
        text: 'Ship Thursday.',
        actions: [{ type: 'decision', text: 'Ship Thursday', owner: null }],
      }),
    };
    const assistant = new MeetingAssistant(new MemoryVectorStore(), createHashEmbedder(16), model);
    const events = await assistant.answer(context);
    expect(events).toEqual([
      { type: 'token', text: 'Ship Thursday.' },
      {
        type: 'done',
        text: 'Ship Thursday.',
        actions: [{ type: 'decision', text: 'Ship Thursday', owner: null }],
      },
    ]);
  });

  it('surfaces a model failure instead of swallowing it', async () => {
    const model: AssistantModel = {
      complete: async () => {
        throw new Error('provider timeout');
      },
    };
    const assistant = new MeetingAssistant(new MemoryVectorStore(), createHashEmbedder(16), model);
    await expect(assistant.answer(context)).resolves.toEqual([
      { type: 'error', error: 'provider timeout' },
    ]);
  });
});
