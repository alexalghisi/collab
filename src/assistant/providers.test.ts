import { describe, expect, it } from 'vitest';
import { parseActions } from './types';
import { splitAnswer } from './providers';

describe('parseActions', () => {
  it('keeps a valid list and drops a malformed one', () => {
    expect(
      parseActions([
        { type: 'action_item', text: 'Send the invite', owner: 'Linus' },
        { type: 'decision', text: 'Ship Thursday', owner: null },
      ]),
    ).toHaveLength(2);
    expect(parseActions([{ type: 'task', text: 'nope' }])).toEqual([]);
    expect(parseActions('not json')).toEqual([]);
  });
});

describe('splitAnswer', () => {
  it('reads structured actions after the ACTIONS marker', () => {
    const answer = splitAnswer(
      [
        'We ship the billing queue on Thursday.',
        'ACTIONS',
        JSON.stringify([{ type: 'decision', text: 'Ship Thursday', owner: null }]),
      ].join('\n'),
    );
    expect(answer.text).toBe('We ship the billing queue on Thursday.');
    expect(answer.actions).toEqual([{ type: 'decision', text: 'Ship Thursday', owner: null }]);
  });

  it('treats a missing marker as a plain answer', () => {
    expect(splitAnswer('Just a recap.')).toEqual({ text: 'Just a recap.', actions: [] });
  });
});
