import { describe, expect, it } from 'vitest';
import { starterCode } from '../code/starterCode';
import { outputsMatch, runProblemExamples } from './examples';
import { clampPanelWidth, isCompactProblemLayout, readPanelWidth } from './layout';
import { readableStatement } from './readable';
import { problemStarter, shouldConfirmOverwrite } from './starter';
import {
  INITIAL_PROBLEM_SYNC,
  randomProblem,
  reduceProblemSync,
  stepProblem,
  visibleProblemSlug,
} from './sync';

const problem = { title: 'Bucăți', examples: [{ input: '1\n', output: '1\n' }] };

describe('problem sync', () => {
  it('broadcasts a host choice and keeps a guest choice local', () => {
    const shared = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'bucati',
      isHost: true,
      now: 10,
    });
    expect(shared.broadcastSlug).toBe('bucati');
    expect(visibleProblemSlug(shared.state)).toBe('bucati');

    const guest = reduceProblemSync(shared.state, {
      type: 'choose',
      slug: 'suma',
      isHost: false,
      now: 11,
    });
    expect(guest.broadcastSlug).toBeNull();
    expect(guest.state.followHost).toBe(false);
    expect(visibleProblemSlug(guest.state)).toBe('suma');

    const following = reduceProblemSync(guest.state, { type: 'follow', followHost: true });
    expect(visibleProblemSlug(following.state)).toBe('bucati');
  });

  it('applies the host problem without dropping free browsing', () => {
    const local = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'suma',
      isHost: false,
      now: 1,
    });
    const next = reduceProblemSync(local.state, {
      type: 'host-state',
      problem: { slug: 'graf', history: ['graf'], updatedAt: 5 },
    });
    expect(visibleProblemSlug(next.state)).toBe('suma');
    expect(next.state.host.slug).toBe('graf');
  });

  it('steps and picks at random inside the filtered list', () => {
    const slugs = ['a', 'b', 'c'];
    expect(stepProblem(slugs, 'c', 1)).toBe('a');
    expect(stepProblem(slugs, 'a', -1)).toBe('c');
    expect(stepProblem([], null, 1)).toBeNull();
    expect(randomProblem(slugs, 'b', () => 0)).toBe('a');
    expect(randomProblem(slugs, 'b', () => 0.99)).toBe('c');
  });
});

describe('problem panel layout', () => {
  it('clamps the column and treats 768 as a tab', () => {
    expect(clampPanelWidth(900, 1000)).toBe(500);
    expect(clampPanelWidth(10, 1000)).toBe(280);
    expect(clampPanelWidth(Number.NaN, 400)).toBe(200);
    expect(readPanelWidth('420', 1000)).toBe(420);
    expect(readPanelWidth(null, 1000)).toBe(380);
    expect(isCompactProblemLayout(768)).toBe(true);
    expect(isCompactProblemLayout(360)).toBe(true);
    expect(isCompactProblemLayout(769)).toBe(false);
  });
});

describe('loading a problem into the editor', () => {
  it('asks only when the buffer is not a starter or this problem', () => {
    expect(shouldConfirmOverwrite('', problem)).toBe(false);
    expect(shouldConfirmOverwrite(starterCode('cpp'), problem)).toBe(false);
    expect(shouldConfirmOverwrite(problemStarter('cpp', problem.title), problem)).toBe(false);
    expect(shouldConfirmOverwrite('int x = 1;\n', problem)).toBe(true);
    expect(problemStarter('python', 'Bucăți')).toContain('def main()');
    expect(problemStarter('cpp', 'Bucăți')).toContain('int main()');
  });
});

describe('running examples', () => {
  it('marks each example pass or fail from the program output', async () => {
    const verdicts = await runProblemExamples({
      language: 'cpp',
      code: 'int main(){return 0;}',
      examples: [
        { input: '1\n', output: '1\n' },
        { input: '2\n', output: '9\n' },
      ],
      run: async (request) => ({
        stdout: request.stdin === '1\n' ? '1\n' : '0\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        error: null,
      }),
    });
    expect(verdicts.map((item) => item.passed)).toEqual([true, false]);
    expect(outputsMatch('1 \n', '1')).toBe(true);
  });

  it('fails an example the compiler could not run', async () => {
    const verdicts = await runProblemExamples({
      language: 'python',
      code: 'print(1)',
      examples: [{ input: '', output: '1\n' }],
      run: async () => ({
        stdout: '',
        stderr: 'boom',
        exitCode: null,
        timedOut: false,
        error: 'the cloud sandbox could not be reached: offline',
      }),
    });
    expect(verdicts[0]?.passed).toBe(false);
    expect(verdicts[0]?.error).toMatch(/offline/);
  });
});

describe('statement text', () => {
  it('keeps the words and drops image markup', () => {
    expect(readableStatement('Suma **n**.\n\n![fig](/a.png)\n\n$a+b$')).toBe('Suma n.\n\na+b');
  });
});
