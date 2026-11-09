import { timeoutSignal } from '../net/timeoutSignal';
import type { CodeLanguage } from './languages';
import { MAX_OUTPUT_BYTES, type ExecutionRequest, type ExecutionResult } from './execution';

export const CLOUD_EXECUTE_URL = 'https://wandbox.org/api/compile.json';

/** Compilers to try in order; a released C++ build first, because HEAD is slow to compile with. */
const COMPILERS: Record<CodeLanguage, readonly [string, ...string[]]> = {
  javascript: ['nodejs-20.17.0'],
  typescript: ['typescript-5.6.2'],
  python: ['cpython-3.12.7'],
  go: ['go-1.23.2'],
  cpp: ['gcc-13.2.0', 'gcc-head'],
};

const ATTEMPT_TIMEOUT_MS = 30_000;
/** A try that times out costs the whole wait, so only one more follows it. */
const MAX_TIMEOUTS = 2;
/** A busy or garbled answer comes back at once, so a third try is cheap. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1_200] as const;
/** Longest one run can take here; callers waiting on this service must allow for it. */
export const CLOUD_EXECUTE_BUDGET_MS =
  MAX_TIMEOUTS * ATTEMPT_TIMEOUT_MS + RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0);

interface CloudResponse {
  readonly status?: string;
  readonly signal?: string;
  readonly program_output?: string;
  readonly program_message?: string;
  readonly program_error?: string;
  readonly compiler_error?: string;
  readonly compiler_output?: string;
}

export interface CloudExecution {
  readonly result: ExecutionResult;
  readonly stdout: string;
  readonly stderr: string;
  /** The compiler's diagnostics when the program never got to run; null otherwise. */
  readonly compileError: string | null;
}

/** Waits between tries. Tests pass their own so they do not sleep. */
export type RetryWait = (ms: number) => Promise<void>;

/** Spread out, so examples that were refused together do not come back together. */
const jitteredWait: RetryWait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms * (0.75 + Math.random() * 0.5)));

class RetryableError extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

/** Statuses a public compiler answers with when it is overloaded, not when the request is wrong. */
function isBusyStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function reachError(cause: unknown): RetryableError {
  const { name, message } = cause as Error;
  const timedOut = name === 'TimeoutError' || name === 'AbortError';
  const reason = timedOut ? 'the compiler did not answer in time. Press Run again.' : message;
  return new RetryableError(`the cloud sandbox could not be reached: ${reason}`, timedOut, cause);
}

async function compileOnce(
  request: ExecutionRequest,
  compiler: string,
  fetchImpl: typeof fetch,
): Promise<CloudResponse> {
  let response: Response;
  try {
    response = await fetchImpl(CLOUD_EXECUTE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        compiler,
        code: request.code,
        stdin: request.stdin,
        codes: request.files.map((file) => ({ file: file.name, code: file.content })),
      }),
      signal: timeoutSignal(ATTEMPT_TIMEOUT_MS),
    });
  } catch (cause) {
    throw reachError(cause);
  }
  if (isBusyStatus(response.status)) {
    throw new RetryableError(
      `the cloud sandbox is busy (it answered ${response.status}). Press Run again.`,
      false,
    );
  }
  if (!response.ok) {
    throw new Error(`the cloud sandbox answered ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    // A proxy's error page, or a body cut off mid-way: the run itself may be fine.
    throw new RetryableError(
      'the cloud sandbox could not be reached: its answer could not be read. Press Run again.',
      false,
      cause,
    );
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new RetryableError(
      'the cloud sandbox could not be reached: its answer could not be read. Press Run again.',
      false,
    );
  }
  return payload as CloudResponse;
}

/**
 * A public compiler has slow and busy moments, so another try is cheaper than a
 * failed Run. The backup compiler steps in after a timeout and on the last try.
 */
async function compileWithRetry(
  request: ExecutionRequest,
  fetchImpl: typeof fetch,
  wait: RetryWait,
): Promise<CloudResponse> {
  const compilers = COMPILERS[request.language];
  let timeouts = 0;
  for (let attempt = 0; ; attempt += 1) {
    const backup = timeouts > 0 || attempt === MAX_ATTEMPTS - 1;
    const compiler = (backup && compilers[1]) || compilers[0];
    try {
      return await compileOnce(request, compiler, fetchImpl);
    } catch (error) {
      if (!(error instanceof RetryableError)) {
        throw error;
      }
      timeouts += error.timedOut ? 1 : 0;
      if (attempt + 1 >= MAX_ATTEMPTS || timeouts >= MAX_TIMEOUTS) {
        throw error;
      }
      if (!error.timedOut) {
        await wait(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
      }
    }
  }
}

/** A kill may be reported by the signal's name or by its description. */
const KILLED_SIGNALS = new Set(['SIGKILL', 'SIGXCPU', 'Killed', 'CPU time limit exceeded']);

/** Diagnostics count as a failed build only when nothing ran: warnings alone do not. */
function compileFailure(payload: CloudResponse, exitCode: number | null): string | null {
  const diagnostics = payload.compiler_error || payload.compiler_output || '';
  const ran = Boolean(payload.program_output || payload.program_error || payload.signal);
  return exitCode !== null && exitCode !== 0 && !ran && /error:/.test(diagnostics)
    ? diagnostics.slice(0, MAX_OUTPUT_BYTES)
    : null;
}

export async function executeInCloud(
  request: ExecutionRequest,
  fetchImpl: typeof fetch = fetch,
  wait: RetryWait = jitteredWait,
): Promise<CloudExecution> {
  const payload = await compileWithRetry(request, fetchImpl, wait);
  const stdout = (payload.program_output || payload.program_message || '').slice(
    0,
    MAX_OUTPUT_BYTES,
  );
  const compiled = payload.compiler_error || payload.compiler_output || '';
  const stderr = (payload.program_error || compiled).slice(0, MAX_OUTPUT_BYTES);
  const parsed =
    payload.status === undefined || payload.status === '' ? NaN : Number(payload.status);
  const exitCode = Number.isFinite(parsed) ? parsed : null;
  return {
    result: {
      exitCode,
      timedOut: KILLED_SIGNALS.has(payload.signal ?? ''),
      files: [],
    },
    stdout,
    stderr,
    compileError: compileFailure(payload, exitCode),
  };
}
