import { executeInCloud } from '../../../src/code/cloudExecute';
import type {
  ExecutionChunk,
  ExecutionRequest,
  ExecutionResult,
} from '../../../src/code/execution';
import type { SandboxRunner } from './SandboxRunner';

export class CloudRunner implements SandboxRunner {
  readonly name = 'cloud';

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async run(
    request: ExecutionRequest,
    onChunk: (chunk: ExecutionChunk) => void,
  ): Promise<ExecutionResult> {
    const { result, stdout, stderr } = await executeInCloud(request, this.fetchImpl);
    if (stdout) {
      onChunk({ stream: 'stdout', text: stdout });
    }
    if (stderr) {
      onChunk({ stream: 'stderr', text: stderr });
    }
    return result;
  }
}
