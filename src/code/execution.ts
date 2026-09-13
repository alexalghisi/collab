import { isCodeLanguage, type CodeLanguage } from './languages';

export interface ExecutionRequest {
  readonly language: CodeLanguage;
  readonly code: string;
  readonly stdin: string;
}

export interface ExecutionChunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

export interface ExecutionResult {
  /** null when the sandbox was killed before it could report one. */
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}

export interface RunStarted {
  readonly runId: string;
  readonly byPeerId: string;
  readonly byDisplayName: string;
  readonly language: CodeLanguage;
}

export interface RunOutput extends ExecutionChunk {
  readonly runId: string;
}

export interface RunFinished extends ExecutionResult {
  readonly runId: string;
  /** Set when the sandbox could not run at all; the UI shows it as a failure. */
  readonly error: string | null;
}

export const MAX_CODE_BYTES = 64_000;
export const MAX_STDIN_BYTES = 16_000;
/** Output beyond this is dropped: a runaway loop must not fill the room's screens. */
export const MAX_OUTPUT_BYTES = 128_000;

export type ExecutionRejection =
  | 'unsupported-language'
  | 'empty-code'
  | 'code-too-large'
  | 'stdin-too-large'
  | 'not-in-room'
  | 'rate-limited'
  | 'unavailable';

export const REJECTION_MESSAGES: Record<ExecutionRejection, string> = {
  'unsupported-language': 'That language cannot be run here.',
  'empty-code': 'There is nothing to run yet.',
  'code-too-large': 'The file is too large to run.',
  'stdin-too-large': 'The input is too large.',
  'not-in-room': 'You are no longer in this meeting.',
  'rate-limited': 'Too many runs in a row — wait a moment and try again.',
  unavailable: 'Code execution is not enabled on this deployment.',
};

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

/**
 * Validates a run request at the trust boundary: it arrives from a client and
 * ends up inside a sandbox, so neither its size nor its language is assumed.
 */
export function validateExecutionRequest(
  request: unknown,
): { ok: true; request: ExecutionRequest } | { ok: false; reason: ExecutionRejection } {
  const { language, code, stdin } = (request ?? {}) as Partial<ExecutionRequest>;
  if (!isCodeLanguage(language)) {
    return { ok: false, reason: 'unsupported-language' };
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return { ok: false, reason: 'empty-code' };
  }
  if (byteLength(code) > MAX_CODE_BYTES) {
    return { ok: false, reason: 'code-too-large' };
  }
  const input = typeof stdin === 'string' ? stdin : '';
  if (byteLength(input) > MAX_STDIN_BYTES) {
    return { ok: false, reason: 'stdin-too-large' };
  }
  return { ok: true, request: { language, code, stdin: input } };
}
