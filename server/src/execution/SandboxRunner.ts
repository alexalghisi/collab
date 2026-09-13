import type {
  ExecutionChunk,
  ExecutionRequest,
  ExecutionResult,
} from '../../../src/code/execution';

export interface SandboxRunner {
  /** Named so the room can be told which sandbox produced the output. */
  readonly name: string;
  run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult>;
}

/** Thrown when the sandbox could not run at all, as opposed to running and failing. */
export class SandboxUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SandboxUnavailableError';
  }
}
