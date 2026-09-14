import { describe, expect, it } from 'vitest';
import { createHashEmbedder } from '../search/embed';
import { MemoryVectorStore } from '../search/MemoryVectorStore';
import { indexMeeting } from '../search/sources';
import { formatTurns, gatherContext, turnsInLastMinutes } from './tools';

const transcript = [
  { displayName: 'Ada', text: 'Ship the billing queue on Thursday.', startedAt: 1_000 },
  { displayName: 'Linus', text: 'I will send the invite.', startedAt: 50_000 },
];

describe('turnsInLastMinutes', () => {
  it('keeps only turns inside the window', () => {
    const recent = turnsInLastMinutes(transcript, 1, 90_000);
    expect(recent.map((turn) => turn.displayName)).toEqual(['Linus']);
  });
});

describe('gatherContext', () => {
  it('includes the recent window and a retrieved passage', async () => {
    const store = new MemoryVectorStore();
    const embedder = createHashEmbedder(32);
    await indexMeeting(store, embedder, {
      meetingId: 'm1',
      roomId: 'room',
      transcript: [
        {
          id: 's1',
          peerId: 'ada',
          displayName: 'Ada',
          text: 'Ship the billing queue on Thursday.',
          startedAt: 1_000,
          endedAt: 2_000,
        },
      ],
      messages: [],
    });
    const context = await gatherContext(
      {
        meetingId: 'm1',
        roomId: 'room',
        question: 'When do we ship billing?',
        transcript,
        messages: [],
      },
      store,
      embedder,
      60_000,
    );

    expect(context).toContain('Linus: I will send the invite.');
    expect(context.toLowerCase()).toContain('billing');
    expect(context).toContain('Matching passages:');
  });
});

describe('formatTurns', () => {
  it('says so when the window is empty', () => {
    expect(formatTurns([])).toMatch(/no spoken turns/i);
  });
});
