export function consoleText(text: string): string {
  return text === '' ? '(empty)' : text;
}

export interface ConsoleStream {
  readonly label: 'stdin' | 'stdout' | 'stderr';
  readonly text: string;
  readonly error: boolean;
}

/**
 * What the run console should print. Empty input and an empty error stream stay
 * hidden: a tall block of "(empty)" is what used to grow over the source.
 */
export function consoleStreams(run: {
  stdin: string;
  stdout: string;
  stderr: string;
}): ConsoleStream[] {
  const streams: ConsoleStream[] = [];
  if (run.stdin !== '') {
    streams.push({ label: 'stdin', text: run.stdin, error: false });
  }
  streams.push({ label: 'stdout', text: consoleText(run.stdout), error: false });
  if (run.stderr !== '') {
    streams.push({ label: 'stderr', text: run.stderr, error: true });
  }
  return streams;
}
