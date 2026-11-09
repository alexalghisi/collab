import type { CodeLanguage } from '../code/languages';
import type { ExecutionRequest } from '../code/execution';
import type { HostedRunOutcome } from '../code/hostedRun';
import {
  batchBlamesProgram,
  batchWasRefused,
  buildCppExampleBatch,
  canBatchExamples,
  newBatchToken,
  parseExampleBatch,
} from './examplesBatch';
import type { ProblemExample } from './types';

export interface ExampleVerdict {
  readonly index: number;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly error: string | null;
}

type Run = (request: ExecutionRequest) => Promise<HostedRunOutcome>;
type Slots = (HostedRunOutcome | null)[];

/** Examples sent to the compiler at once: enough to feel instant, few enough not to be refused. */
const CONCURRENT_RUNS = 4;

/**
 * Set once the sandbox has refused a batch (no pipe, no fork). Trying again on
 * every press would cost a wasted compile each time, so the rest of the session
 * goes straight to one run per example.
 */
let sandboxRefusesBatches = false;

/** For tests: forget that a batch was ever refused. */
export function resetExampleBatching(): void {
  sandboxRefusesBatches = false;
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

/** The compiler's first error as one short line: "line 4: 'x' was not declared in this scope". */
export function compileErrorSummary(diagnostics: string): string {
  const located = /^.+?:(\d+):\d+: (?:fatal )?error: (.+)$/m.exec(diagnostics);
  if (located) {
    return `line ${located[1]}: ${located[2]}`.slice(0, 240);
  }
  const lines = diagnostics.split('\n').map((line) => line.trim());
  const line = lines.find((item) => /error|undefined reference/.test(item)) ?? lines.find(Boolean);
  return (line ?? 'the compiler rejected the program').slice(0, 240);
}

function verdictError(outcome: HostedRunOutcome): string | null {
  if (outcome.timedOut) {
    return 'Timed out.';
  }
  if (outcome.error !== null) {
    return outcome.error;
  }
  return outcome.compileError === null
    ? null
    : `Does not compile (${compileErrorSummary(outcome.compileError)})`;
}

function toVerdict(
  index: number,
  example: ProblemExample,
  outcome: HostedRunOutcome,
): ExampleVerdict {
  const failed = outcome.error !== null || outcome.timedOut || outcome.exitCode !== 0;
  return {
    index,
    passed: !failed && outputsMatch(outcome.stdout, example.output),
    expected: example.output,
    actual: outcome.stdout,
    error: verdictError(outcome),
  };
}

/** Runs every example that has no outcome yet on its own, a few at a time. */
async function runAlone(
  slots: Slots,
  examples: readonly ProblemExample[],
  base: Pick<ExecutionRequest, 'language' | 'code'>,
  run: Run,
): Promise<void> {
  const waiting = slots.flatMap((slot, index) => (slot === null ? [index] : []));
  const worker = async (): Promise<void> => {
    for (let index = waiting.shift(); index !== undefined; index = waiting.shift()) {
      slots[index] = await run({ ...base, stdin: examples[index]?.input ?? '', files: [] });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_RUNS, waiting.length) }, worker));
}

/**
 * One compile for all the examples of a C++ program. Leaves a slot empty when
 * the batch could not answer for that example.
 */
async function runCppBatch(
  code: string,
  examples: readonly ProblemExample[],
  run: Run,
  token: string,
): Promise<Slots> {
  const outcome = await run(
    buildCppExampleBatch(
      code,
      examples.map((example) => example.input),
      token,
    ),
  );
  const everyExample = (shared: HostedRunOutcome): Slots => examples.map(() => shared);
  if (outcome.error !== null) {
    // The compiler could not be reached even after its retries; asking again per example would only wait longer.
    return everyExample(outcome);
  }
  const slots = parseExampleBatch(outcome.stdout, token, examples.length);
  if (batchWasRefused(outcome.stdout, token)) {
    sandboxRefusesBatches = true;
  }
  if (outcome.compileError === null) {
    return slots;
  }
  if (batchBlamesProgram(outcome.compileError)) {
    return everyExample(outcome);
  }
  // The runner may not fit this program. Build it on its own: one example tells for all.
  const alone = await run({ language: 'cpp', code, stdin: examples[0]?.input ?? '', files: [] });
  if (alone.compileError !== null || alone.error !== null) {
    return everyExample(alone);
  }
  slots[0] = alone;
  return slots;
}

export async function runProblemExamples(options: {
  language: CodeLanguage;
  code: string;
  examples: readonly ProblemExample[];
  run: Run;
  /** Marks the batch's output; random unless a test fixes it. */
  token?: string;
}): Promise<ExampleVerdict[]> {
  const { language, code, examples, run } = options;
  const batch =
    language === 'cpp' &&
    !sandboxRefusesBatches &&
    canBatchExamples(examples.map((example) => example.input));
  const slots: Slots = batch
    ? await runCppBatch(code, examples, run, options.token ?? newBatchToken())
    : examples.map(() => null);
  await runAlone(slots, examples, { language, code }, run);
  return examples.flatMap((example, index) => {
    const outcome = slots[index];
    return outcome ? [toVerdict(index, example, outcome)] : [];
  });
}
