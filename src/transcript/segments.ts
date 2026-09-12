/** One spoken turn, attributed to whoever said it. */
export interface TranscriptSegment {
  readonly id: string;
  readonly peerId: string;
  readonly displayName: string;
  readonly text: string;
  readonly startedAt: number;
  readonly endedAt: number;
}

export const MAX_SEGMENT_CHARS = 2_000;

/**
 * Reduces whatever arrived to a segment worth keeping, or to nothing.
 * Clients type these; the room only stores what passes.
 */
export function normalizeTranscriptSegment(input: unknown): TranscriptSegment | null {
  const draft = (input ?? {}) as Partial<TranscriptSegment>;
  const id = typeof draft.id === 'string' ? draft.id.trim() : '';
  const peerId = typeof draft.peerId === 'string' ? draft.peerId.trim() : '';
  const displayName = typeof draft.displayName === 'string' ? draft.displayName.trim() : '';
  const text = typeof draft.text === 'string' ? draft.text.trim().slice(0, MAX_SEGMENT_CHARS) : '';
  const startedAt = draft.startedAt;
  const endedAt = draft.endedAt;
  if (
    id === '' ||
    peerId === '' ||
    text === '' ||
    typeof startedAt !== 'number' ||
    typeof endedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt) ||
    endedAt < startedAt
  ) {
    return null;
  }
  return {
    id,
    peerId,
    displayName: displayName || 'Guest',
    text,
    startedAt,
    endedAt,
  };
}
