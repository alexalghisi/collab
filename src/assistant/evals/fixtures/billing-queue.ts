import type { AssistantContext } from '../../types';

/** A short planning call used by the eval harness. */
export const billingQueueContext: AssistantContext = {
  meetingId: 'eval-billing',
  roomId: 'eval-billing',
  question: 'What did we decide about the billing queue, and who owns the invite?',
  transcript: [
    {
      displayName: 'Ada',
      text: 'The billing queue is overflowing. We should ship the fix on Thursday.',
      startedAt: 1_000,
    },
    {
      displayName: 'Linus',
      text: 'Agreed. I will send the invite to finance this afternoon.',
      startedAt: 8_000,
    },
    {
      displayName: 'Ada',
      text: 'Please do not mention the cafeteria remodel; that is a different thread.',
      startedAt: 12_000,
    },
  ],
  notes: 'Decision: ship billing on Thursday. Action: Linus sends the finance invite.',
  messages: [{ text: 'Invite subject: billing queue fix', sentAt: 9_000 }],
};

export const billingQueueExpectations = {
  mustInclude: ['thursday', 'billing', 'linus'],
  mustExclude: ['cafeteria'],
};
