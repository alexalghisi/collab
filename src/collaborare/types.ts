/** A problem as collaborare.ro lists it, without the statement body. */
export interface ProblemSummary {
  readonly slug: string;
  readonly title: string;
  readonly source: string;
  readonly topic: string;
  /** Site category id (`start-9-10`, `oji`, `official-oji-2026`, …). */
  readonly category: string;
  readonly timeLimitMs: number | null;
  readonly memoryLimitKb: number | null;
  /** Present only when the catalog row has a test count. */
  readonly testsCount: number | null;
  readonly difficulty: number;
  readonly olympGrade: number | null;
  readonly olympLevel: string | null;
}

export interface ProblemExample {
  readonly input: string;
  readonly output: string;
  readonly explanation?: string;
}

export interface ProblemImage {
  readonly alt: string;
  readonly url: string;
}

export interface ProblemDetail extends ProblemSummary {
  readonly statement: string;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly constraints: string;
  readonly hint: string;
  readonly examples: readonly ProblemExample[];
  readonly images: readonly ProblemImage[];
  readonly formulas: readonly string[];
  readonly url: string;
}

export interface ProblemCategory {
  readonly key: string;
  readonly label: string;
}

export interface ProblemListPayload {
  readonly source: string;
  readonly fetchedAt: string;
  readonly problems: readonly ProblemSummary[];
}

export const COLLABORARE_SITE = 'https://collaborare.ro';

export function problemPageUrl(slug: string): string {
  return `${COLLABORARE_SITE}/probleme/${encodeURIComponent(slug)}`;
}
