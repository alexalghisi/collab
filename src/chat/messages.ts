import type { FileAttachment } from '../files/attachments';

export const MAX_MESSAGE_CHARS = 4000;

/** What a participant sends: something to say, a file they uploaded, or both. */
export interface ChatDraft {
  readonly text: string;
  readonly file: FileAttachment | null;
}

export function isFileAttachment(value: unknown): value is FileAttachment {
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

/** Reduces an edit to a message id and trimmed text, or to nothing. */
export function normalizeChatEdit(input: unknown): { id: string; text: string } | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const { id, text } = input as { id?: unknown; text?: unknown };
  if (typeof id !== 'string' || id === '' || typeof text !== 'string') {
    return null;
  }
  return { id, text: text.trim().slice(0, MAX_MESSAGE_CHARS) };
}

export function normalizeChatDelete(input: unknown): { id: string } | null {
  if (typeof input === 'string' && input !== '') {
    return { id: input };
  }
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const { id } = input as { id?: unknown };
  return typeof id === 'string' && id !== '' ? { id } : null;
}

export function isOwnChatMessage(
  message: { readonly peerId: string },
  ...selfIds: readonly (string | null | undefined)[]
): boolean {
  return selfIds.some((id) => Boolean(id) && id === message.peerId);
}

export function visibleChatMessages<T extends { deletedAt?: number }>(messages: readonly T[]): T[] {
  return messages.filter((message) => !message.deletedAt);
}
