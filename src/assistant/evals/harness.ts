export interface SummaryExpectations {
  readonly mustInclude: readonly string[];
  readonly mustExclude?: readonly string[];
}

export interface EvalFailure {
  readonly kind: 'missing' | 'forbidden';
  readonly term: string;
}

/**
 * Checks a summary the way a reviewer would: required facts are present,
 * and a known distraction from the fixture did not leak in.
 */
export function evaluateSummary(summary: string, expected: SummaryExpectations): EvalFailure[] {
  const haystack = summary.toLowerCase();
  const failures: EvalFailure[] = [];
  for (const term of expected.mustInclude) {
    if (!haystack.includes(term.toLowerCase())) {
      failures.push({ kind: 'missing', term });
    }
  }
  for (const term of expected.mustExclude ?? []) {
    if (haystack.includes(term.toLowerCase())) {
      failures.push({ kind: 'forbidden', term });
    }
  }
  return failures;
}
