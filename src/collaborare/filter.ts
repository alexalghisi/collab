import type { ProblemCategory, ProblemSummary } from './types';

/** Chip keys the collaborare.ro problem list uses for its collection filters. */
export const CATEGORY_ALL = '__all';
export const CATEGORY_OLYMPIAD = '__oly';
export const CATEGORY_START_9_10 = '__start';
export const CATEGORY_START_11_12 = '__start1112';
export const CATEGORY_SEQUENCES = '__seq';

export interface ProblemQuery {
  readonly text: string;
  readonly category: string;
  readonly olympGrade?: number | null;
  readonly olympLevel?: string | null;
}

/** The public list on collaborare.ro hides the bacalaureat category. */
export function isListedProblem(problem: ProblemSummary): boolean {
  return problem.category !== 'bac';
}

/**
 * The same chips as collaborare.ro: five collections, then each topic in the
 * order the catalog returns it (difficulty, then title).
 */
export function problemCategories(problems: readonly ProblemSummary[]): ProblemCategory[] {
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const problem of problems) {
    if (!isListedProblem(problem) || problem.topic === '' || seen.has(problem.topic)) {
      continue;
    }
    seen.add(problem.topic);
    topics.push(problem.topic);
  }
  return [
    { key: CATEGORY_ALL, label: 'Toate problemele' },
    { key: CATEGORY_OLYMPIAD, label: 'Olimpiada de informatică (cls. V–XII)' },
    { key: CATEGORY_START_9_10, label: 'Pregătire clasa IX–X' },
    { key: CATEGORY_START_11_12, label: 'Pregătire clasa XI–XII' },
    { key: CATEGORY_SEQUENCES, label: 'Antrenament secvențe' },
    ...topics.map((topic) => ({ key: topic, label: topic })),
  ];
}

export function filterProblems(
  problems: readonly ProblemSummary[],
  query: ProblemQuery,
): ProblemSummary[] {
  const needle = query.text.trim().toLowerCase();
  const category = query.category === '' ? CATEGORY_ALL : query.category;
  return problems.filter((problem) => {
    if (!isListedProblem(problem)) {
      return false;
    }
    if (needle !== '') {
      const haystack =
        `${problem.title} ${problem.source} ${problem.slug} ${problem.topic}`.toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
    if (category === CATEGORY_ALL) {
      return true;
    }
    if (category === CATEGORY_OLYMPIAD) {
      if (problem.olympGrade === null) {
        return false;
      }
      if (query.olympGrade != null && problem.olympGrade !== query.olympGrade) {
        return false;
      }
      if (query.olympLevel && problem.olympLevel !== query.olympLevel) {
        return false;
      }
      return true;
    }
    if (category === CATEGORY_SEQUENCES) {
      return problem.source.startsWith('Secvențe');
    }
    if (category === CATEGORY_START_9_10) {
      return problem.category === 'start-9-10';
    }
    if (category === CATEGORY_START_11_12) {
      return problem.category === 'start-11-12';
    }
    return problem.topic === category;
  });
}

export function formatTimeLimit(timeLimitMs: number | null): string | null {
  if (timeLimitMs === null || timeLimitMs <= 0) {
    return null;
  }
  const seconds = timeLimitMs / 1000;
  const text = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, '');
  return `${text} s`;
}

export function olympiadGrades(problems: readonly ProblemSummary[]): number[] {
  const grades = new Set<number>();
  for (const problem of problems) {
    if (isListedProblem(problem) && problem.olympGrade !== null) {
      grades.add(problem.olympGrade);
    }
  }
  return [...grades].sort((left, right) => left - right);
}

export function olympiadLevels(problems: readonly ProblemSummary[]): string[] {
  const levels = new Set<string>();
  for (const problem of problems) {
    if (isListedProblem(problem) && problem.olympLevel) {
      levels.add(problem.olympLevel);
    }
  }
  return [...levels].sort((left, right) => left.localeCompare(right, 'ro'));
}

export function formatMemoryLimit(memoryLimitKb: number | null): string | null {
  if (memoryLimitKb === null || memoryLimitKb <= 0) {
    return null;
  }
  if (memoryLimitKb % 1024 === 0) {
    return `${memoryLimitKb / 1024} MB`;
  }
  return `${memoryLimitKb} KB`;
}
