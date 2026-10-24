import {
  chatMessagesOf,
  loadChatHistory,
  mergeChatHistory,
  saveChatHistory,
} from '../chat/history';
import {
  INITIAL_PROBLEM_SYNC,
  normalizeProblemSync,
  type ProblemSyncState,
} from '../collaborare/sync';
import type { ChatMessage, Stroke } from '../signaling/events';
import { normalizeTranscriptSegment, type TranscriptSegment } from '../transcript/segments';
import { storage } from './storage';

export const MAX_STROKES = 800;
export const MAX_TRANSCRIPT = 200;

const snapshotKey = (roomId: string) => `collab.room.${roomId}`;

export interface RoomSnapshot {
  readonly messages: ChatMessage[];
  readonly strokes: Stroke[];
  readonly transcript: TranscriptSegment[];
  readonly problem: ProblemSyncState;
}

function isStroke(value: unknown): value is Stroke {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const stroke = value as Partial<Stroke>;
  return (
    typeof stroke.id === 'string' &&
    stroke.id !== '' &&
    typeof stroke.peerId === 'string' &&
    typeof stroke.color === 'string' &&
    typeof stroke.width === 'number' &&
    Number.isFinite(stroke.width) &&
    Array.isArray(stroke.points) &&
    stroke.points.length > 0 &&
    stroke.points.length % 2 === 0 &&
    stroke.points.every((point) => typeof point === 'number' && Number.isFinite(point))
  );
}

export function parseStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isStroke).slice(-MAX_STROKES);
}

export function mergeStrokes(
  ...lists: readonly (readonly Stroke[] | null | undefined)[]
): Stroke[] {
  const byId = new Map<string, Stroke>();
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const stroke of list) {
      if (!isStroke(stroke) || byId.has(stroke.id)) {
        continue;
      }
      byId.set(stroke.id, stroke);
    }
  }
  return [...byId.values()].slice(-MAX_STROKES);
}

export function mergeTranscript(
  ...lists: readonly (readonly TranscriptSegment[] | null | undefined)[]
): TranscriptSegment[] {
  const byId = new Map<string, TranscriptSegment>();
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const segment of list) {
      const next = normalizeTranscriptSegment(segment);
      if (next && !byId.has(next.id)) {
        byId.set(next.id, next);
      }
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
    .slice(-MAX_TRANSCRIPT);
}

export function loadRoomSnapshot(roomId: string): RoomSnapshot {
  try {
    const raw = storage.read(snapshotKey(roomId));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Partial<RoomSnapshot>;
        return {
          messages: mergeChatHistory(chatMessagesOf(record.messages), loadChatHistory(roomId)),
          strokes: parseStrokes(record.strokes),
          transcript: mergeTranscript(record.transcript),
          problem: normalizeProblemSync(record.problem),
        };
      }
    }
  } catch {
    return {
      messages: loadChatHistory(roomId),
      strokes: [],
      transcript: [],
      problem: INITIAL_PROBLEM_SYNC,
    };
  }
  return {
    messages: loadChatHistory(roomId),
    strokes: [],
    transcript: [],
    problem: INITIAL_PROBLEM_SYNC,
  };
}

export function saveRoomSnapshot(roomId: string, patch: Partial<RoomSnapshot>): void {
  try {
    const current = loadRoomSnapshot(roomId);
    const next: RoomSnapshot = {
      messages: patch.messages !== undefined ? mergeChatHistory(patch.messages) : current.messages,
      strokes: patch.strokes !== undefined ? mergeStrokes(patch.strokes) : current.strokes,
      transcript:
        patch.transcript !== undefined ? mergeTranscript(patch.transcript) : current.transcript,
      problem: patch.problem !== undefined ? normalizeProblemSync(patch.problem) : current.problem,
    };
    storage.write(snapshotKey(roomId), JSON.stringify(next));
    saveChatHistory(roomId, next.messages);
  } catch {
    return;
  }
}
