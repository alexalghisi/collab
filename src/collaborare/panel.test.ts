import { describe, expect, it } from 'vitest';
import { starterCode } from '../code/starterCode';
import { outputsMatch, runProblemExamples } from './examples';
import { clampPanelWidth, isCompactProblemLayout, readPanelWidth } from './layout';
import { readableStatement } from './readable';
import { problemStarter, shouldConfirmOverwrite } from './starter';
import {
  applyProblemSelect,
  EMPTY_PROBLEM_QUERY,
  EMPTY_SHARED_PROBLEM,
  INITIAL_PROBLEM_SYNC,
  randomProblem,
  normalizeProblemSync,
  reduceProblemSync,
  shouldApplySharedProblem,
  stepProblem,
  visibleProblemSlug,
} from './sync';

const problem = { title: 'Bucăți', examples: [{ input: '1\n', output: '1\n' }] };

describe('problem sync', () => {
  it('publishes a choice from either person and keeps the list with it', () => {
    const shared = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'bucati',
      isHost: true,
      now: 10,
    });
    expect(shared.broadcastSlug).toBe('bucati');
    expect(shared.publish?.query.listing).toBe(false);
    expect(visibleProblemSlug(shared.state)).toBe('bucati');

    const guest = reduceProblemSync(shared.state, {
      type: 'choose',
      slug: 'suma',
      isHost: false,
      now: 11,
    });
    expect(guest.broadcastSlug).toBe('suma');
    expect(visibleProblemSlug(guest.state)).toBe('suma');
    expect(guest.publish?.query).toEqual({ ...EMPTY_PROBLEM_QUERY, listing: false });
  });

  it('replaces the problem on screen when the other person picks one', () => {
    const local = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'suma',
      isHost: false,
      now: 1,
    });
    const next = reduceProblemSync(local.state, {
      type: 'host-state',
      problem: { ...EMPTY_SHARED_PROBLEM, slug: 'graf', history: ['graf'], updatedAt: 5 },
    });
    expect(visibleProblemSlug(next.state)).toBe('graf');
    expect(next.state.host.slug).toBe('graf');
  });

  it('publishes the same search and filters for the whole room', () => {
    const next = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'query',
      now: 4,
      query: {
        text: 'mat',
        category: 'Matrice',
        olympGrade: 9,
        olympLevel: 'judet',
        listing: true,
      },
    });
    expect(next.publish?.query).toEqual({
      text: 'mat',
      category: 'Matrice',
      olympGrade: 9,
      olympLevel: 'judet',
      listing: true,
    });
    expect(next.state.host.query.text).toBe('mat');
  });

  it('never leaves a screen browsing on its own', () => {
    const shared = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'bucati',
      isHost: true,
      now: 10,
    });
    const tried = reduceProblemSync(shared.state, { type: 'follow', followHost: false });
    expect(tried.state.followHost).toBe(true);

    const picked = reduceProblemSync(tried.state, {
      type: 'choose',
      slug: 'suma',
      isHost: false,
      now: 12,
    });
    expect(picked.publish?.slug).toBe('suma');
    expect(visibleProblemSlug(picked.state)).toBe('suma');

    const restored = normalizeProblemSync({ ...picked.state, followHost: false });
    expect(restored.followHost).toBe(true);
  });

  it('shares example verdicts with the room and clears them on another problem', () => {
    const shared = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'suma',
      isHost: false,
      now: 10,
    });
    const verdict = { index: 0, passed: false, expected: '3', actual: '', error: null };
    const ran = reduceProblemSync(shared.state, {
      type: 'examples',
      examples: { slug: 'suma', running: false, verdicts: [verdict], at: 11, byName: 'Alex' },
      now: 11,
    });
    expect(ran.publish?.examples).toMatchObject({
      slug: 'suma',
      verdicts: [verdict],
      byName: 'Alex',
    });

    // The server merges it into the room for everyone, late joiners included.
    const room = applyProblemSelect(
      shared.state.host,
      { examples: ran.publish?.examples ?? null, clientEpoch: 3 },
      'guest',
      12,
    );
    expect(room?.examples?.verdicts).toEqual([verdict]);

    // Verdicts for another problem never show.
    const stale = applyProblemSelect(
      shared.state.host,
      { examples: { slug: 'graf', running: false, verdicts: [verdict], at: 1 } },
      'guest',
      13,
    );
    expect(stale?.examples).toBeFalsy();

    const moved = room ? applyProblemSelect(room, 'graf', 'host', 14) : null;
    expect(moved?.slug).toBe('graf');
    expect(moved?.examples).toBeFalsy();
  });

  it('keeps its example verdicts when a room echo carries none (an older server)', () => {
    const shared = reduceProblemSync(INITIAL_PROBLEM_SYNC, {
      type: 'choose',
      slug: 'suma',
      isHost: true,
      now: 10,
    });
    const verdict = { index: 0, passed: true, expected: '1', actual: '1', error: null };
    const ran = reduceProblemSync(shared.state, {
      type: 'examples',
      examples: { slug: 'suma', running: false, verdicts: [verdict], at: 11 },
      now: 11,
    });

    const echo = reduceProblemSync(ran.state, {
      type: 'host-state',
      problem: { ...shared.state.host, updatedAt: 12 },
    });
    expect(echo.state.host.examples?.verdicts).toEqual([verdict]);

    const moved = reduceProblemSync(echo.state, {
      type: 'host-state',
      problem: { ...shared.state.host, slug: 'graf', history: ['suma', 'graf'], updatedAt: 13 },
    });
    expect(moved.state.host.examples).toBeFalsy();
  });

  it('lets a guest publish and drops a stale echo of their own edit', () => {
    const published = applyProblemSelect(
      EMPTY_SHARED_PROBLEM,
      {
        slug: 'suma',
        query: { text: 'su', listing: true },
        clientEpoch: 2,
      },
      'guest',
      8,
    );
    expect(published).toMatchObject({
      slug: 'suma',
      byPeerId: 'guest',
      clientEpoch: 2,
      query: { text: 'su', listing: true },
    });
    expect(shouldApplySharedProblem(published!, 'guest', 3)).toBe(false);
    expect(shouldApplySharedProblem(published!, 'guest', 2)).toBe(true);
    expect(shouldApplySharedProblem(published!, 'host', 9)).toBe(true);
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
    expect(clampPanelWidth(900, 1000)).toBe(600);
    expect(clampPanelWidth(10, 1000)).toBe(280);
    expect(clampPanelWidth(Number.NaN, 400)).toBe(240);
    expect(readPanelWidth('420', 1000)).toBe(420);
    expect(readPanelWidth('380', 1000)).toBe(440);
    expect(readPanelWidth(null, 1000)).toBe(440);
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
        compileError: null,
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
        compileError: null,
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
