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
  it('shows only the latest program output', () => {
    render(
      <CodeOutput
        runs={[
          run({ runId: 'old', stdout: 'first\n' }),
          run({ runId: 'new', stdout: 'Hello from Collab\n' }),
        ]}
      />,
    );

    expect(screen.getByText(/Hello from Collab/)).toBeTruthy();
    expect(screen.queryByText(/first/)).toBeNull();
    expect(screen.getByText('finished')).toBeTruthy();
  });
});
