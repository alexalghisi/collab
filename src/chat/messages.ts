import type { FileAttachment } from '../files/attachments';

export const MAX_MESSAGE_CHARS = 4000;

/** What a participant sends: something to say, a file they uploaded, or both. */
export interface ChatDraft {
  readonly text: string;
  readonly file: FileAttachment | null;
}

function isFileAttachment(value: unknown): value is FileAttachment {
  const { id, name, mimeType, size, url } = (value ?? {}) as Partial<FileAttachment>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof name === 'string' &&
    typeof mimeType === 'string' &&
    typeof size === 'number' &&
    typeof url === 'string'
  );
}

/**
 * Reduces whatever arrived to something worth broadcasting, or to nothing.
 * A plain string is still accepted: a desktop shell that was installed before
 * attachments existed sends one, and it should keep working rather than have its
 * messages silently dropped.
 */
export function normalizeChatDraft(input: unknown): ChatDraft | null {
  const draft =
    typeof input === 'string' ? { text: input, file: null } : ((input ?? {}) as Partial<ChatDraft>);
  const text = typeof draft.text === 'string' ? draft.text.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  const file = isFileAttachment(draft.file) ? draft.file : null;
  if (text === '' && !file) {
    return null;
  }
  return { text, file };
}
