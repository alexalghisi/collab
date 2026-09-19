import type { CodeLanguage } from './languages';
import { MAX_OUTPUT_BYTES, type ExecutionRequest, type ExecutionResult } from './execution';

export const CLOUD_EXECUTE_URL = 'https://wandbox.org/api/compile.json';

const COMPILER: Record<CodeLanguage, string> = {
  javascript: 'nodejs-20.17.0',
  typescript: 'typescript-5.6.2',
  python: 'cpython-3.12.7',
  go: 'go-1.23.2',
  cpp: 'gcc-head',
};

interface CloudResponse {
  readonly status?: string;
  readonly signal?: string;
  readonly program_output?: string;
  readonly program_error?: string;
  readonly compiler_error?: string;
  readonly compiler_output?: string;
}

export interface CloudExecution {
  readonly result: ExecutionResult;
  readonly stdout: string;
  readonly stderr: string;
}

export async function executeInCloud(
  request: ExecutionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudExecution> {
  let response: Response;
  try {
    response = await fetchImpl(CLOUD_EXECUTE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        compiler: COMPILER[request.language],
        code: request.code,
        stdin: request.stdin,
        codes: request.files.map((file) => ({ file: file.name, code: file.content })),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (cause) {
    throw new Error(`the cloud sandbox could not be reached: ${(cause as Error).message}`, {
      cause,
    });
  }
  if (!response.ok) {
    throw new Error(`the cloud sandbox answered ${response.status}`);
  }
  const payload = (await response.json()) as CloudResponse;
  const stdout = (payload.program_output ?? '').slice(0, MAX_OUTPUT_BYTES);
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
