import type { CodeLanguage } from '../code/languages';
import type { ExecutionRequest } from '../code/execution';
import type { HostedRunOutcome } from '../code/hostedRun';
import type { ProblemExample } from './types';

export interface ExampleVerdict {
  readonly index: number;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly error: string | null;
}

export function normalizeProgramOutput(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeProgramOutput(actual) === normalizeProgramOutput(expected);
}

export async function runProblemExamples(options: {
  language: CodeLanguage;
  code: string;
  examples: readonly ProblemExample[];
  run: (request: ExecutionRequest) => Promise<HostedRunOutcome>;
}): Promise<ExampleVerdict[]> {
  const verdicts: ExampleVerdict[] = [];
  for (let index = 0; index < options.examples.length; index += 1) {
    const example = options.examples[index];
    if (!example) {
      continue;
    }
    const outcome = await options.run({
      language: options.language,
      code: options.code,
      stdin: example.input,
      files: [],
    });
    const failed = outcome.error !== null || outcome.timedOut || outcome.exitCode !== 0;
    verdicts.push({
      index,
      passed: !failed && outputsMatch(outcome.stdout, example.output),
      expected: example.output,
      actual: outcome.stdout,
      error: outcome.timedOut ? 'Timed out.' : outcome.error,
    });
  }
  return verdicts;
}
