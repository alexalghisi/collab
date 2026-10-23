import { formulasInStatement, imagesInStatement } from './statement';
import {
  problemPageUrl,
  type ProblemDetail,
  type ProblemExample,
  type ProblemSummary,
} from './types';

/** One row from the collaborare.ro public catalog. */
export interface CatalogRow {
  readonly slug?: unknown;
  readonly title?: unknown;
  readonly source?: unknown;
  readonly topic?: unknown;
  readonly category?: unknown;
  readonly time_limit_ms?: unknown;
  readonly memory_limit_kb?: unknown;
  readonly tests_count?: unknown;
  readonly difficulty?: unknown;
  readonly olymp_grade?: unknown;
  readonly olymp_level?: unknown;
  readonly statement?: unknown;
  readonly input_format?: unknown;
  readonly output_format?: unknown;
  readonly constraints?: unknown;
  readonly hint?: unknown;
  readonly examples?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function summaryFromRow(row: CatalogRow): ProblemSummary | null {
  const slug = text(row.slug).trim();
  const title = text(row.title).trim();
  if (slug === '' || title === '') {
    return null;
  }
  const difficulty = whole(row.difficulty);
  return {
    slug,
    title,
    source: text(row.source),
    topic: text(row.topic),
    category: text(row.category),
    timeLimitMs: whole(row.time_limit_ms),
    memoryLimitKb: whole(row.memory_limit_kb),
    testsCount: whole(row.tests_count),
    difficulty: difficulty ?? 0,
    olympGrade: whole(row.olymp_grade),
    olympLevel: text(row.olymp_level) === '' ? null : text(row.olymp_level),
  };
}

function examplesFrom(value: unknown): ProblemExample[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const examples: ProblemExample[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as { input?: unknown; output?: unknown; explanation?: unknown };
    if (typeof row.input !== 'string' || typeof row.output !== 'string') {
      continue;
    }
    const explanation = typeof row.explanation === 'string' ? row.explanation.trim() : '';
    examples.push(
      explanation === ''
        ? { input: row.input, output: row.output }
        : { input: row.input, output: row.output, explanation },
    );
  }
  return examples;
}

export function detailFromRow(row: CatalogRow): ProblemDetail | null {
  const summary = summaryFromRow(row);
  if (!summary) {
    return null;
  }
  const statement = text(row.statement);
  return {
    ...summary,
    statement,
    inputFormat: text(row.input_format),
    outputFormat: text(row.output_format),
    constraints: text(row.constraints),
    hint: text(row.hint),
    examples: examplesFrom(row.examples),
    images: imagesInStatement(statement),
    formulas: formulasInStatement(statement),
    url: problemPageUrl(summary.slug),
  };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isProblemSlug(value: string): boolean {
  return SLUG.test(value);
}
