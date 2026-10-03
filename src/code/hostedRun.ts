import { executeInCloud } from './cloudExecute';
import { REJECTION_MESSAGES, type ExecutionRequest } from './execution';

export interface HostedRunOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly error: string | null;
}

export function serverHasNoSandbox(error: string | null): boolean {
  return error === REJECTION_MESSAGES.unavailable;
}

export async function runOnHostedCompiler(
  request: ExecutionRequest,
  fetchImpl?: typeof fetch,
): Promise<HostedRunOutcome> {
  try {
    const cloud = await executeInCloud(request, fetchImpl);
    return {
      stdout: cloud.stdout,
      stderr: cloud.stderr,
      exitCode: cloud.result.exitCode,
      timedOut: cloud.result.timedOut,
      error: null,
    };
  } catch (cause) {
    return {
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      error: cause instanceof Error ? cause.message : 'The program could not be run.',
    };
  }
}
