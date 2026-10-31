// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CodeRun } from '../../hooks/useCollabSession';
import { CodeOutput } from './CodeOutput';

afterEach(cleanup);

function run(patch: Partial<CodeRun> & Pick<CodeRun, 'runId' | 'stdout'>): CodeRun {
  return {
    byPeerId: 'ada',
    byDisplayName: 'Ada',
    language: 'javascript',
    stdin: '',
    stderr: '',
    exitCode: 0,
    timedOut: false,
    error: null,
    running: false,
    files: [],
    ...patch,
  };
}

describe('CodeOutput', () => {
  it('shows only the latest run, who started it, and the input', () => {
    render(
      <CodeOutput
        runs={[
          run({ runId: 'old', stdout: 'first\n', stdin: 'old\n', byDisplayName: 'Linus' }),
          run({
            runId: 'new',
            stdout: 'Hello from Collab\n',
            stdin: '3\n1 2 3\n',
            byDisplayName: 'Ada',
          }),
        ]}
      />,
    );

    expect(screen.getByText(/Ada/)).toBeTruthy();
    expect(screen.getByText(/3\s+1 2 3/)).toBeTruthy();
    expect(screen.getByText(/Hello from Collab/)).toBeTruthy();
    expect(screen.queryByText(/Linus/)).toBeNull();
    expect(screen.queryByText('first\n')).toBeNull();
    expect(screen.queryByText('stdout')).toBeNull();
  });

  it('clears stdout while the latest run has not printed yet', () => {
    render(
      <CodeOutput
        runs={[
          run({
            runId: 'new',
            stdout: '',
            stdin: '41\n',
            running: true,
            exitCode: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText(/41/)).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();
    expect(screen.queryByText('(empty)')).toBeNull();
  });
});
