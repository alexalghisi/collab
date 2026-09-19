import {
  validateExecutionRequest,
  type ExecutionChunk,
  type ExecutionRejection,
  type ExecutionRequest,
  type ExecutionResult,
} from '../../../src/code/execution';
import { RateLimiter } from './RateLimiter';
import { SandboxUnavailableError, type SandboxRunner } from './SandboxRunner';
import { CloudRunner } from './CloudRunner';
import { DockerRunner } from './DockerRunner';
import { LocalRunner } from './LocalRunner';
import { PistonRunner } from './PistonRunner';

export type Accepted =
  | { readonly ok: true; readonly request: ExecutionRequest }
  | { readonly ok: false; readonly reason: ExecutionRejection };

/** Runs a submission per room and per participant, both capped. */
export class ExecutionService {
  private readonly limiter: RateLimiter;

  constructor(
    private readonly runner: SandboxRunner | null,
    limiter = new RateLimiter({ burst: 5, refillMs: 6000 }),
  ) {
    this.limiter = limiter;
  }

  get enabled(): boolean {
    return this.runner !== null;
  }

  get sandbox(): string {
    return this.runner?.name ?? 'none';
  }

  /**
   * Checks everything that does not need the sandbox: whether it is configured,
   * whether the request is well formed and within the size caps, whether the
   * sender is still in the room, and whether the allowance is spent.
   */
  accept(payload: unknown, keys: string[], inRoom = true): Accepted {
    if (!this.runner) {
      return { ok: false, reason: 'unavailable' };
    }
    if (!inRoom) {
      return { ok: false, reason: 'not-in-room' };
    }
    const validated = validateExecutionRequest(payload);
    if (!validated.ok) {
      return validated;
    }
    if (!this.limiter.take(keys)) {
      return { ok: false, reason: 'rate-limited' };
    }
    return validated;
  }

  run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    if (!this.runner) {
      return Promise.reject(new SandboxUnavailableError('execution is not enabled'));
    }
    return this.runner.run(request, onChunk);
  }

  forget(key: string): void {
    this.limiter.forget(key);
  }
}

function localRunner(env: Partial<NodeJS.ProcessEnv>): LocalRunner {
  return new LocalRunner({
    timeoutMs: Number(env.EXECUTION_TIMEOUT_MS ?? 8000),
    compileTimeoutMs: Number(env.EXECUTION_COMPILE_TIMEOUT_MS ?? 30000),
  });
}

export function createRunnerFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): SandboxRunner | null {
  const backend = env.EXECUTION_BACKEND?.trim().toLowerCase();
  if (backend === 'docker') {
    return new DockerRunner();
  }
  if (backend === 'piston') {
    return new PistonRunner({
      url: env.EXECUTION_PISTON_URL ?? 'https://emkc.org/api/v2/piston',
      timeoutMs: Number(env.EXECUTION_TIMEOUT_MS ?? 8000),
      memoryBytes: Number(env.EXECUTION_MEMORY_MB ?? 256) * 1024 * 1024,
    });
  }
  if (backend === 'local') {
    return localRunner(env);
  }
  return new CloudRunner();
}
