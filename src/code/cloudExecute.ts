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

const ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 30_000;
/** Longest one run can take here; callers waiting on this service must allow for it. */
export const CLOUD_EXECUTE_BUDGET_MS = ATTEMPTS * ATTEMPT_TIMEOUT_MS;

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
}

function compilerFor(language: CodeLanguage, attempt: number): string {
  const compilers = COMPILERS[language];
  return compilers[Math.min(attempt, compilers.length - 1)] ?? compilers[0];
}

function reachError(cause: unknown): Error {
  const { name, message } = cause as Error;
  const reason =
    name === 'TimeoutError' || name === 'AbortError'
      ? 'the compiler did not answer in time. Press Run again.'
      : message;
  return new Error(`the cloud sandbox could not be reached: ${reason}`, { cause });
}

async function requestCompile(
  request: ExecutionRequest,
  compiler: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImpl(CLOUD_EXECUTE_URL, {
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
}

/** A public compiler has slow moments, so one more try is cheaper than a failed Run. */
async function compileWithRetry(
  request: ExecutionRequest,
  fetchImpl: typeof fetch,
  attempt = 0,
): Promise<CloudResponse> {
  const retry = attempt + 1 < ATTEMPTS;
  let response: Response;
  try {
    response = await requestCompile(request, compilerFor(request.language, attempt), fetchImpl);
  } catch (error) {
    if (retry) {
      return compileWithRetry(request, fetchImpl, attempt + 1);
    }
    throw error;
  }
  if (response.status >= 500 && retry) {
    return compileWithRetry(request, fetchImpl, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`the cloud sandbox answered ${response.status}`);
  }
  return (await response.json()) as CloudResponse;
}

export async function executeInCloud(
  request: ExecutionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudExecution> {
  const payload = await compileWithRetry(request, fetchImpl);
  const stdout = (payload.program_output || payload.program_message || '').slice(
    0,
    MAX_OUTPUT_BYTES,
  );
  const compiled = payload.compiler_error || payload.compiler_output || '';
  const stderr = (payload.program_error || compiled).slice(0, MAX_OUTPUT_BYTES);
  const parsed =
    payload.status === undefined || payload.status === '' ? NaN : Number(payload.status);
  const timedOut = payload.signal === 'SIGKILL' || payload.signal === 'SIGXCPU';
  return {
    result: {
      exitCode: Number.isFinite(parsed) ? parsed : null,
      timedOut,
      files: [],
    },
    stdout,
    stderr,
  };
}
