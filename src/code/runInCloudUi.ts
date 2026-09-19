import { executeInCloud } from './cloudExecute';
import type { CodeLanguage } from './languages';
import type { ExecutionRequest, ExecutionResult } from './execution';
import type { WorkspaceFile } from './workspaceFiles';

export interface CloudUiRun {
  readonly runId: string;
  readonly byPeerId: string;
  readonly byDisplayName: string;
  readonly language: CodeLanguage;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly error: string | null;
  readonly files: WorkspaceFile[];
}

export async function completeCloudUiRun(
  request: ExecutionRequest,
  meta: { readonly runId: string; readonly byPeerId: string; readonly byDisplayName: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CloudUiRun> {
  try {
    const { result, stdout, stderr } = await executeInCloud(request, fetchImpl);
    return finish(meta, request.language, result, stdout, stderr, null);
  } catch (cause) {
    return finish(
      meta,
      request.language,
      { exitCode: null, timedOut: false, files: [] },
      '',
      '',
      cause instanceof Error ? cause.message : 'The cloud sandbox could not run this.',
    );
  }
}

function finish(
  meta: { readonly runId: string; readonly byPeerId: string; readonly byDisplayName: string },
  language: CodeLanguage,
  result: ExecutionResult,
  stdout: string,
  stderr: string,
  error: string | null,
): CloudUiRun {
  return {
    ...meta,
    language,
    stdout,
    stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    error,
    files: result.files ?? [],
  };
}
