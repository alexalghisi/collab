import type { VectorHit, VectorStore } from '../search/VectorStore';
import type { Embedder } from '../search/VectorStore';
import type { AssistantContext } from './types';

const MINUTE_MS = 60_000;

/** Turns spoken in the last `minutes`, oldest first. */
export function turnsInLastMinutes(
  transcript: AssistantContext['transcript'],
  minutes: number,
  now = Date.now(),
): AssistantContext['transcript'] {
  const since = now - Math.max(1, minutes) * MINUTE_MS;
  return transcript.filter((turn) => turn.startedAt >= since);
}

export function formatTurns(turns: AssistantContext['transcript']): string {
  if (turns.length === 0) {
    return '(no spoken turns in that window)';
  }
  return turns.map((turn) => `${turn.displayName}: ${turn.text}`).join('\n');
}

export async function findDiscussion(
  store: VectorStore,
  embedder: Embedder,
  query: string,
  meetingId?: string,
): Promise<VectorHit[]> {
  const [embedding] = await embedder.embed([query]);
  return store.query(embedding, { meetingId, limit: 6 });
}

export function formatHits(hits: VectorHit[]): string {
  if (hits.length === 0) {
    return '(no matching passages)';
  }
  return hits.map((hit) => `[${hit.source} · ${hit.meetingId}] ${hit.text}`).join('\n');
}

/**
 * Builds the tool results the model is allowed to see for this question.
 * Retrieval and the time window run here, not inside the model, so a missing
 * key still has a deterministic context and the eval harness can assert it.
 */
export async function gatherContext(
  context: AssistantContext,
  store: VectorStore,
  embedder: Embedder,
  now = Date.now(),
): Promise<string> {
  const recent = formatTurns(turnsInLastMinutes(context.transcript, 10, now));
  const hits = formatHits(
    await findDiscussion(store, embedder, context.question, context.meetingId),
  );
  return [
    `Question: ${context.question}`,
    '',
    'Last 10 minutes:',
    recent,
    '',
    'Matching passages:',
    hits,
  ].join('\n');
}
