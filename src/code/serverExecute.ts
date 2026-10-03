import { EXECUTION_URL } from './config';
import { executeInCloud } from './cloudExecute';
import type { ExecutionRequest, ExecutionResult } from './execution';
import type { WorkspaceFile } from './workspaceFiles';

export interface ServerExecution {
  readonly result: ExecutionResult;
  readonly stdout: string;
  readonly stderr: string;
}

interface ExecuteBody {
  readonly stdout?: unknown;
  readonly stderr?: unknown;
  readonly exitCode?: unknown;
  readonly timedOut?: unknown;
  readonly files?: unknown;
  readonly error?: unknown;
}

function asFiles(value: unknown): WorkspaceFile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const file = entry as { name?: unknown; content?: unknown };
    if (typeof file.name !== 'string' || typeof file.content !== 'string') {
      return [];
    }
    return [{ name: file.name, content: file.content }];
  });
}

/**
 * Runs a program on the signaling server's sandbox. The Firestore transport has
 * no process of its own, and a browser calling a public compiler is a worse
 * place to fail than the server the room already trusts.
 */
export async function executeOnServer(
  request: ExecutionRequest,
  fetchImpl: typeof fetch = fetch,
  url = EXECUTION_URL,
): Promise<ServerExecution> {
  let response: Response;
  try {
    response = await fetchImpl(`${url}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (cause) {
    throw new Error(`the execution service could not be reached: ${(cause as Error).message}`, {
      cause,
    });
  }
  const body = (await response.json().catch(() => ({}))) as ExecuteBody;
  if (!response.ok) {
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : `the execution service answered ${response.status}`,
    );
  }
  return {
    stdout: typeof body.stdout === 'string' ? body.stdout : '',
    stderr: typeof body.stderr === 'string' ? body.stderr : '',
    result: {
      exitCode: typeof body.exitCode === 'number' ? body.exitCode : null,
      timedOut: body.timedOut === true,
      files: asFiles(body.files),
    },
  };
}

/**
 * Prefers the room's signaling server. A public compiler is only the backup
 * when that server cannot be reached.
 */
export async function executeSharedProgram(
  request: ExecutionRequest,
  fetchImpl: typeof fetch = fetch,
  url = EXECUTION_URL,
): Promise<ServerExecution> {
  try {
    return await executeOnServer(request, fetchImpl, url);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    const retryable = message.includes('could not be reached') || /answered 5\d\d/.test(message);
    if (!retryable) {
      throw cause;
    }
    const cloud = await executeInCloud(request, fetchImpl);
    return { result: cloud.result, stdout: cloud.stdout, stderr: cloud.stderr };
  }
}
