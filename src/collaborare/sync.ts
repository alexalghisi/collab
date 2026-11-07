import type {
  ProblemListQuery,
  ProblemSelectPayload,
  SharedExampleRun,
  SharedExampleVerdict,
  SharedProblem,
} from '../signaling/events';
import { CATEGORY_ALL } from './filter';
import { isProblemSlug } from './map';

export const MAX_PROBLEM_HISTORY = 40;
export const MAX_SHARED_VERDICTS = 50;
const MAX_VERDICT_TEXT = 4000;

export const EMPTY_PROBLEM_QUERY: ProblemListQuery = {
  text: '',
  category: CATEGORY_ALL,
  olympGrade: null,
  olympLevel: null,
  listing: true,
};

export const EMPTY_SHARED_PROBLEM: SharedProblem = {
  slug: null,
  history: [],
  updatedAt: 0,
  query: EMPTY_PROBLEM_QUERY,
};

export interface ProblemSyncState {
  readonly host: SharedProblem;
  readonly followHost: boolean;
  readonly localSlug: string | null;
  readonly localHistory: readonly string[];
  /** Search, filters, and list-or-detail for a screen that is not following. */
  readonly localQuery: ProblemListQuery;
}

export const INITIAL_PROBLEM_SYNC: ProblemSyncState = {
  host: EMPTY_SHARED_PROBLEM,
  followHost: true,
  localSlug: null,
  localHistory: [],
  localQuery: EMPTY_PROBLEM_QUERY,
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
    }
  | { readonly type: 'query'; readonly query: ProblemListQuery; readonly now: number }
  | { readonly type: 'examples'; readonly examples: SharedExampleRun | null; readonly now: number };

export interface ProblemSyncResult {
  readonly state: ProblemSyncState;
  /** Set when this participant should tell the room about a new problem. */
  readonly broadcastSlug: string | null;
  /** The shared view to publish. Null when this change stays on this screen. */
  readonly publish: SharedProblem | null;
}

function slugs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && isProblemSlug(item));
}

export function normalizeProblemQuery(value: unknown): ProblemListQuery {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_PROBLEM_QUERY;
  }
  const raw = value as Partial<ProblemListQuery>;
  const text = typeof raw.text === 'string' ? raw.text.slice(0, 200) : '';
  const category =
    typeof raw.category === 'string' && raw.category.trim() !== ''
      ? raw.category.slice(0, 80)
      : CATEGORY_ALL;
  const olympGrade =
    typeof raw.olympGrade === 'number' && Number.isFinite(raw.olympGrade)
      ? Math.round(raw.olympGrade)
      : null;
  const olympLevel =
    typeof raw.olympLevel === 'string' && raw.olympLevel.trim() !== ''
      ? raw.olympLevel.slice(0, 40)
      : null;
  return {
    text,
    category,
    olympGrade,
    olympLevel,
    listing: raw.listing !== false,
  };
}

function clip(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_VERDICT_TEXT) : '';
}

function normalizeVerdict(value: unknown, fallbackIndex: number): SharedExampleVerdict | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<SharedExampleVerdict>;
  return {
    index:
      typeof raw.index === 'number' && Number.isFinite(raw.index)
        ? Math.max(0, Math.round(raw.index))
        : fallbackIndex,
    passed: raw.passed === true,
    expected: clip(raw.expected),
    actual: clip(raw.actual),
    error: typeof raw.error === 'string' ? clip(raw.error) : null,
  };
}

/** A shared example run, or null when it is malformed or belongs to another problem. */
export function normalizeExampleRun(value: unknown, slug: string | null): SharedExampleRun | null {
  if (typeof value !== 'object' || value === null || slug === null) {
    return null;
  }
  const raw = value as Partial<SharedExampleRun>;
  if (raw.slug !== slug) {
    return null;
  }
  const verdicts = Array.isArray(raw.verdicts)
    ? raw.verdicts
        .slice(0, MAX_SHARED_VERDICTS)
        .map((item, index) => normalizeVerdict(item, index))
        .filter((item): item is SharedExampleVerdict => item !== null)
    : [];
  const byName =
    typeof raw.byName === 'string' && raw.byName.trim() !== ''
      ? raw.byName.slice(0, 80)
      : undefined;
  return {
    slug,
    running: raw.running === true,
    verdicts,
    at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0,
    ...(byName ? { byName } : {}),
  };
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
  const clientEpoch =
    typeof raw.clientEpoch === 'number' && Number.isFinite(raw.clientEpoch)
      ? raw.clientEpoch
      : undefined;
  const byPeerId =
    typeof raw.byPeerId === 'string' && raw.byPeerId !== '' ? raw.byPeerId : undefined;
  const examples = normalizeExampleRun(raw.examples, slug);
  return {
    slug,
    history: withCurrent.slice(-MAX_PROBLEM_HISTORY),
    updatedAt,
    query: normalizeProblemQuery(raw.query),
    ...(byPeerId ? { byPeerId } : {}),
    ...(clientEpoch !== undefined ? { clientEpoch } : {}),
    ...(examples ? { examples } : {}),
  };
}

/**
 * A late echo of our own previous edit must not rewind the list. Someone else's
 * update always applies.
 */
export function shouldApplySharedProblem(
  incoming: SharedProblem,
  selfPeerId: string | null,
  localEpoch: number,
): boolean {
  if (
    selfPeerId &&
    incoming.byPeerId === selfPeerId &&
    typeof incoming.clientEpoch === 'number' &&
    incoming.clientEpoch < localEpoch
  ) {
    return false;
  }
  return true;
}

/** Turns a `problem:select` payload into the next shared view. Anyone may send it. */
export function applyProblemSelect(
  current: SharedProblem,
  payload: ProblemSelectPayload,
  byPeerId: string,
  now: number,
): SharedProblem | null {
  if (typeof payload === 'string') {
    if (!isProblemSlug(payload)) {
      return null;
    }
    return { ...publishProblem(current, payload, now), byPeerId, query: current.query };
  }
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const hasSlug = payload.slug === null || typeof payload.slug === 'string';
  const hasQuery = payload.query !== undefined;
  const hasExamples = payload.examples !== undefined;
  if (!hasSlug && !hasQuery && !hasExamples) {
    return null;
  }
  let next = current;
  if (payload.slug === null) {
    next = { ...next, slug: null, updatedAt: now, examples: null };
  } else if (typeof payload.slug === 'string') {
    if (!isProblemSlug(payload.slug)) {
      return null;
    }
    next = publishProblem(next, payload.slug, now);
  }
  if (hasQuery) {
    next = {
      ...next,
      query: normalizeProblemQuery({ ...next.query, ...payload.query }),
      updatedAt: now,
    };
  }
  if (hasExamples) {
    next = { ...next, examples: normalizeExampleRun(payload.examples, next.slug), updatedAt: now };
  }
  const clientEpoch =
    typeof payload.clientEpoch === 'number' && Number.isFinite(payload.clientEpoch)
      ? payload.clientEpoch
      : undefined;
  return normalizeSharedProblem({
    ...next,
    byPeerId,
    ...(clientEpoch !== undefined ? { clientEpoch } : {}),
  });
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
    // Everyone always sees the room's problem: older snapshots saved while
    // "browsing freely" must not leave a screen out of sync.
    followHost: true,
    localSlug,
    localHistory:
      localSlug && !localHistory.includes(localSlug)
        ? [...localHistory, localSlug].slice(-MAX_PROBLEM_HISTORY)
        : localHistory,
    localQuery: normalizeProblemQuery(raw.localQuery ?? EMPTY_PROBLEM_QUERY),
  };
}

export function rememberProblem(history: readonly string[], slug: string): string[] {
  return [...history.filter((item) => item !== slug), slug].slice(-MAX_PROBLEM_HISTORY);
}

export function publishProblem(current: SharedProblem, slug: string, now: number): SharedProblem {
  return {
    ...current,
    examples: current.slug === slug ? (current.examples ?? null) : null,
    slug,
    history: rememberProblem(current.history, slug),
    updatedAt: now,
  };
}

function sameQuery(a: ProblemListQuery, b: ProblemListQuery): boolean {
  return (
    a.text === b.text &&
    a.category === b.category &&
    a.olympGrade === b.olympGrade &&
    a.olympLevel === b.olympLevel &&
    a.listing === b.listing
  );
}

function sameExamples(
  a: SharedExampleRun | null | undefined,
  b: SharedExampleRun | null | undefined,
): boolean {
  if (!a || !b) {
    return !a && !b;
  }
  return a.at === b.at && a.running === b.running && a.verdicts.length === b.verdicts.length;
}

export function sameSharedProblem(a: SharedProblem, b: SharedProblem): boolean {
  return (
    sameExamples(a.examples, b.examples) &&
    a.slug === b.slug &&
    a.updatedAt === b.updatedAt &&
    a.history.length === b.history.length &&
    a.history.every((slug, index) => slug === b.history[index]) &&
    sameQuery(a.query, b.query)
  );
}

/** While following, the room's problem. While browsing freely, this screen's problem. */
export function visibleProblemSlug(state: ProblemSyncState): string | null {
  if (state.followHost) {
    return state.host.slug;
  }
  return state.localSlug;
}

function kept(state: ProblemSyncState): ProblemSyncResult {
  return { state, broadcastSlug: null, publish: null };
}

export function reduceProblemSync(
  state: ProblemSyncState,
  action: ProblemSyncAction,
): ProblemSyncResult {
  if (action.type === 'restore') {
    return { state: normalizeProblemSync(action.state), broadcastSlug: null, publish: null };
  }
  if (action.type === 'host-state') {
    return {
      state: { ...state, host: normalizeSharedProblem(action.problem) },
      broadcastSlug: null,
      publish: null,
    };
  }
  if (action.type === 'examples') {
    const host: SharedProblem = {
      ...state.host,
      examples: normalizeExampleRun(action.examples, state.host.slug),
      updatedAt: action.now,
    };
    return { state: { ...state, host }, broadcastSlug: null, publish: host };
  }
  if (action.type === 'follow') {
    // Free browsing is gone: the panel always shows what the room sees.
    return { state: { ...state, followHost: true }, broadcastSlug: null, publish: null };
  }
  if (action.type === 'query') {
    const query = normalizeProblemQuery(action.query);
    if (!state.followHost) {
      return { state: { ...state, localQuery: query }, broadcastSlug: null, publish: null };
    }
    const host: SharedProblem = {
      ...state.host,
      query,
      updatedAt: action.now,
    };
    return { state: { ...state, host }, broadcastSlug: host.slug, publish: host };
  }
  if (!isProblemSlug(action.slug)) {
    return kept(state);
  }
  if (!state.followHost) {
    return {
      state: {
        ...state,
        localSlug: action.slug,
        localHistory: rememberProblem(state.localHistory, action.slug),
        localQuery: { ...state.localQuery, listing: false },
      },
      broadcastSlug: null,
      publish: null,
    };
  }
  const host: SharedProblem = {
    ...publishProblem(state.host, action.slug, action.now),
    query: { ...state.host.query, listing: false },
  };
  return {
    state: {
      ...state,
      host,
      localSlug: action.slug,
      localHistory: host.history,
    },
    broadcastSlug: action.slug,
    publish: host,
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
