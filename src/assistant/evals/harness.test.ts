import { describe, expect, it } from 'vitest';
import { createHashEmbedder } from '../../search/embed';
import { MemoryVectorStore } from '../../search/MemoryVectorStore';
import { MeetingAssistant } from '../MeetingAssistant';
import type { AssistantModel } from '../types';
import { billingQueueContext, billingQueueExpectations } from './fixtures/billing-queue';
import { evaluateSummary } from './harness';

const fixtureModel: AssistantModel = {
  async complete(_prompt, context) {
    const text = [
      context.toLowerCase().includes('thursday') ? 'Ship billing on Thursday.' : '',
      context.toLowerCase().includes('linus') ? 'Linus owns the finance invite.' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      text,
      actions: [
        { type: 'decision', text: 'Ship billing on Thursday', owner: null },
        { type: 'action_item', text: 'Send the finance invite', owner: 'Linus' },
      ],
    };
  },
};

describe('evaluateSummary', () => {
  it('passes a summary that has the required facts and none of the excluded ones', () => {
    expect(
      evaluateSummary(
        'Ship the billing queue on Thursday. Linus sends the invite.',
        billingQueueExpectations,
      ),
    ).toEqual([]);
  });

  it('fails when a required fact is missing or a forbidden one leaks in', () => {
    expect(evaluateSummary('We talked a lot.', billingQueueExpectations)).toEqual([
      { kind: 'missing', term: 'thursday' },
      { kind: 'missing', term: 'billing' },
      { kind: 'missing', term: 'linus' },
    ]);
    expect(
      evaluateSummary('Thursday billing with Linus. Also the cafeteria.', billingQueueExpectations),
    ).toEqual([{ kind: 'forbidden', term: 'cafeteria' }]);
  });
});

describe('meeting assistant evals', () => {
  it('answers the billing-queue fixture with the expected facts', async () => {
    const assistant = new MeetingAssistant(
      new MemoryVectorStore(),
      createHashEmbedder(32),
      fixtureModel,
    );
    const events = await assistant.answer({
      ...billingQueueContext,
      transcript: billingQueueContext.transcript.map((turn) => ({
        ...turn,
        startedAt: Date.now() - 30_000,
      })),
    });
    const done = events.find((event) => event.type === 'done');
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') {
      return;
    }
    expect(evaluateSummary(done.text, billingQueueExpectations)).toEqual([]);
    expect(done.actions.map((action) => action.type)).toEqual(['decision', 'action_item']);
  });
});
