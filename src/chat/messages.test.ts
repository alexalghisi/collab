import { describe, expect, it } from 'vitest';
import type { FileAttachment } from '../files/attachments';
import { MAX_MESSAGE_CHARS, normalizeChatDraft } from './messages';

const attachment: FileAttachment = {
  id: 'file-1',
  name: 'diagram.png',
  mimeType: 'image/png',
  size: 2048,
  url: '/files/file-1',
};

describe('normalizeChatDraft', () => {
  it('keeps a message with text', () => {
    expect(normalizeChatDraft({ text: '  hello  ', file: null })).toEqual({
      text: 'hello',
      file: null,
    });
  });

  it('keeps a file sent without anything to say', () => {
    expect(normalizeChatDraft({ text: '   ', file: attachment })).toEqual({
      text: '',
      file: attachment,
    });
  });

  it('drops a message that says nothing and carries nothing', () => {
    expect(normalizeChatDraft({ text: '  ', file: null })).toBeNull();
    expect(normalizeChatDraft({})).toBeNull();
    expect(normalizeChatDraft(undefined)).toBeNull();
  });

  it('accepts a bare string, which an older desktop shell still sends', () => {
    expect(normalizeChatDraft('hello')).toEqual({ text: 'hello', file: null });
  });

  it('truncates a message rather than relaying whatever arrived', () => {
    const draft = normalizeChatDraft({ text: 'x'.repeat(MAX_MESSAGE_CHARS + 100), file: null });

    expect(draft?.text).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it('ignores an attachment that is not one', () => {
    expect(normalizeChatDraft({ text: 'look', file: { id: 'file-1' } })).toEqual({
      text: 'look',
      file: null,
    });
    expect(normalizeChatDraft({ text: 'look', file: { ...attachment, size: '2048' } })).toEqual({
      text: 'look',
      file: null,
    });
  });
});
