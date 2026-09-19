import {
  MAX_OUTPUT_BYTES,
  type ExecutionChunk,
  type ExecutionRequest,
  type ExecutionResult,
} from '../../../src/code/execution';
import type { CodeLanguage } from '../../../src/code/languages';
import { SandboxUnavailableError, type SandboxRunner } from './SandboxRunner';

export interface PistonOptions {
  readonly url: string;
  readonly timeoutMs: number;
  readonly memoryBytes: number;
}

export const DEFAULT_PISTON_OPTIONS: PistonOptions = {
  url: 'https://emkc.org/api/v2/piston',
  timeoutMs: 8000,
  memoryBytes: 256 * 1024 * 1024,
};

interface PistonStage {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly code?: number | null;
  readonly signal?: string | null;
}

interface PistonResponse {
  readonly run?: PistonStage;
  readonly compile?: PistonStage;
  readonly message?: string;
}

/** Piston pins runtimes per language; `*` asks for whatever it has installed. */
const RUNTIMES: Record<CodeLanguage, { language: string; file: string }> = {
  javascript: { language: 'javascript', file: 'main.js' },
  typescript: { language: 'typescript', file: 'main.ts' },
  python: { language: 'python', file: 'main.py' },
  go: { language: 'go', file: 'main.go' },
  cpp: { language: 'c++', file: 'main.cpp' },
};

/**
 * Sends the submission to a Piston deployment instead of running it locally, for
 * hosts that cannot give the server a Docker socket — a container platform's
 * free tier, typically. Isolation is then the Piston deployment's job, which is
 * why the URL is configuration: point it at your own instance to keep
 * submissions inside your infrastructure.
 */
export class PistonRunner implements SandboxRunner {
  readonly name = 'piston';

  constructor(
    private readonly options: PistonOptions = DEFAULT_PISTON_OPTIONS,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    const runtime = RUNTIMES[request.language];
    const response = await this.post({
      language: runtime.language,
      version: '*',
      files: [{ name: runtime.file, content: request.code }, ...(request.files ?? [])],
      stdin: request.stdin,
      run_timeout: this.options.timeoutMs,
      compile_timeout: this.options.timeoutMs,
      run_memory_limit: this.options.memoryBytes,
    });

    const emit = (stream: ExecutionChunk['stream'], text: string | undefined): void => {
      if (text) {
        onChunk({ stream, text: text.slice(0, MAX_OUTPUT_BYTES) });
      }
    };

    // A failed compile means the program never ran; its diagnostics are the output.
    if (response.compile && (response.compile.code ?? 0) !== 0) {
      emit('stderr', response.compile.stderr || response.compile.stdout);
      return { exitCode: response.compile.code ?? null, timedOut: false, files: [] };
    }

    const run = response.run;
    if (!run) {
      throw new SandboxUnavailableError(response.message ?? 'the sandbox returned no result');
    }
    emit('stdout', run.stdout);
    emit('stderr', run.stderr);
    // Piston kills a run that outstays its timeout, which shows up as a signal.
    const timedOut = run.signal === 'SIGKILL' && (run.code ?? null) === null;
    return { exitCode: timedOut ? null : (run.code ?? null), timedOut, files: [] };
  }

  private async post(body: unknown): Promise<PistonResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.url}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs * 3),
      });
    } catch (cause) {
      throw new SandboxUnavailableError(
        `the sandbox could not be reached: ${(cause as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new SandboxUnavailableError(`the sandbox answered ${response.status}`);
    }
    return (await response.json()) as PistonResponse;
  }
}
