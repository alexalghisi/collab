import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../signaling/events';
import type { TranscriptSegment } from '../transcript/segments';
import { chunkText } from './chunk';
import type { Embedder, VectorRecord, VectorStore } from './VectorStore';

export interface MeetingCorpus {
  readonly meetingId: string;
  readonly roomId: string;
  readonly transcript: readonly TranscriptSegment[];
  readonly messages: readonly Pick<ChatMessage, 'text' | 'sentAt'>[];
}

/**
 * Turns a meeting's transcript and chat into embeddable passages.
 * Each source keeps its own clock so a later hit can point at "ten minutes in"
 * rather than at the whole meeting.
 */
export function passagesFromMeeting(corpus: MeetingCorpus): Array<Omit<VectorRecord, 'embedding'>> {
  const passages: Array<Omit<VectorRecord, 'embedding'>> = [];
  for (const segment of corpus.transcript) {
    for (const text of chunkText(segment.text)) {
      passages.push({
        id: randomUUID(),
        meetingId: corpus.meetingId,
        roomId: corpus.roomId,
        source: 'transcript',
        text: `${segment.displayName}: ${text}`,
        startMs: segment.startedAt,
      });
    }
  }
  for (const message of corpus.messages) {
    if (!message.text.trim()) {
      continue;
    }
    for (const text of chunkText(message.text)) {
      passages.push({
        id: randomUUID(),
        meetingId: corpus.meetingId,
        roomId: corpus.roomId,
        source: 'chat',
        text,
        startMs: message.sentAt,
      });
    }
  }
  return passages;
}

/** Embeds a meeting's passages and writes them to the configured store. */
export async function indexMeeting(
  store: VectorStore,
  embedder: Embedder,
  corpus: MeetingCorpus,
): Promise<number> {
  const passages = passagesFromMeeting(corpus);
  if (passages.length === 0) {
    return 0;
  }
  const embeddings = await embedder.embed(passages.map((passage) => passage.text));
  const records: VectorRecord[] = passages.map((passage, index) => ({
    ...passage,
    embedding: embeddings[index],
  }));
  await store.upsert(records);
  return records.length;
}
