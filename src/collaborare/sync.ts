import type { SharedProblem } from '../signaling/events';
import { isProblemSlug } from './map';

export const MAX_PROBLEM_HISTORY = 40;

export const EMPTY_SHARED_PROBLEM: SharedProblem = {
  slug: null,
  history: [],
  updatedAt: 0,
};

export interface ProblemSyncState {
  readonly host: SharedProblem;
  readonly followHost: boolean;
  readonly localSlug: string | null;
  readonly localHistory: readonly string[];
}

export const INITIAL_PROBLEM_SYNC: ProblemSyncState = {
  host: EMPTY_SHARED_PROBLEM,
  followHost: true,
  localSlug: null,
  localHistory: [],
};

export type ProblemSyncAction =
  | { readonly type: 'restore'; readonly state: ProblemSyncState }
  | { readonly type: 'host-state'; readonly problem: SharedProblem }
  | { readonly type: 'follow'; readonly followHost: boolean }
  | {
      readonly type: 'choose';
      readonly slug: string;
      readonly isHost: boolean;
      readonly now: number;
    };

export interface ProblemSyncResult {
  readonly state: ProblemSyncState;
  /** Set when this participant should tell the room about a new problem. */
  readonly broadcastSlug: string | null;
}

function slugs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && isProblemSlug(item));
}

export function normalizeSharedProblem(value: unknown): SharedProblem {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_SHARED_PROBLEM;
  }
  const raw = value as Partial<SharedProblem>;
  const history = slugs(raw.history).slice(-MAX_PROBLEM_HISTORY);
  const slug = typeof raw.slug === 'string' && isProblemSlug(raw.slug) ? raw.slug : null;
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  const withCurrent = slug && !history.includes(slug) ? [...history, slug] : history;
  return { slug, history: withCurrent.slice(-MAX_PROBLEM_HISTORY), updatedAt };
}

export function normalizeProblemSync(value: unknown): ProblemSyncState {
  if (typeof value !== 'object' || value === null) {
    return INITIAL_PROBLEM_SYNC;
  }
  const raw = value as Partial<ProblemSyncState>;
  const localHistory = slugs(raw.localHistory).slice(-MAX_PROBLEM_HISTORY);
  const localSlug =
    typeof raw.localSlug === 'string' && isProblemSlug(raw.localSlug) ? raw.localSlug : null;
  return {
    host: normalizeSharedProblem(raw.host),
    followHost: raw.followHost !== false,
    localSlug,
    localHistory:
      localSlug && !localHistory.includes(localSlug)
        ? [...localHistory, localSlug].slice(-MAX_PROBLEM_HISTORY)
        : localHistory,
  };
}

export function rememberProblem(history: readonly string[], slug: string): string[] {
  return [...history.filter((item) => item !== slug), slug].slice(-MAX_PROBLEM_HISTORY);
}

export function publishProblem(current: SharedProblem, slug: string, now: number): SharedProblem {
  return {
    slug,
    history: rememberProblem(current.history, slug),
    updatedAt: now,
  };
}

export function sameSharedProblem(a: SharedProblem, b: SharedProblem): boolean {
  return (
    a.slug === b.slug &&
    a.updatedAt === b.updatedAt &&
    a.history.length === b.history.length &&
    a.history.every((slug, index) => slug === b.history[index])
  );
}

export function visibleProblemSlug(state: ProblemSyncState): string | null {
  if (state.followHost) {
    return state.host.slug;
  }
  return state.localSlug;
}

export function reduceProblemSync(
  state: ProblemSyncState,
  action: ProblemSyncAction,
): ProblemSyncResult {
  if (action.type === 'restore') {
    return { state: normalizeProblemSync(action.state), broadcastSlug: null };
  }
  if (action.type === 'host-state') {
    return {
      state: { ...state, host: normalizeSharedProblem(action.problem) },
      broadcastSlug: null,
    };
  }
  if (action.type === 'follow') {
    return { state: { ...state, followHost: action.followHost }, broadcastSlug: null };
  }
  if (!isProblemSlug(action.slug)) {
    return { state, broadcastSlug: null };
  }
  if (state.followHost && action.isHost) {
    const host = publishProblem(state.host, action.slug, action.now);
    return { state: { ...state, host }, broadcastSlug: action.slug };
  }
  return {
    state: {
      ...state,
      followHost: false,
      localSlug: action.slug,
      localHistory: rememberProblem(state.localHistory, action.slug),
    },
    broadcastSlug: null,
  };
}

export function stepProblem(
  slugsInView: readonly string[],
  current: string | null,
  delta: -1 | 1,
): string | null {
  if (slugsInView.length === 0) {
    return null;
  }
  const index = current === null ? -1 : slugsInView.indexOf(current);
  if (index < 0) {
    return delta > 0 ? slugsInView[0] : slugsInView[slugsInView.length - 1];
  }
  return slugsInView[(index + delta + slugsInView.length) % slugsInView.length] ?? null;
}

export function randomProblem(
  slugsInView: readonly string[],
  current: string | null,
  random: () => number,
): string | null {
  if (slugsInView.length === 0) {
    return null;
  }
  const pool = slugsInView.filter((slug) => slug !== current);
  const choices = pool.length > 0 ? pool : slugsInView;
  const roll = random();
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length)));
  return choices[index] ?? null;
}
