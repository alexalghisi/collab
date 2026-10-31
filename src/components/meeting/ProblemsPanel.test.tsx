// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATEGORY_ALL, filterProblems, problemCategories } from '../../collaborare/filter';
import { stepProblem } from '../../collaborare/sync';
import type { ProblemDetail, ProblemSummary } from '../../collaborare/types';
import { ProblemsPanel, type ProblemsPanelProps } from './ProblemsPanel';

afterEach(cleanup);

function summary(slug: string, title: string, topic: string): ProblemSummary {
  return {
    slug,
    title,
    source: 'Antrenament',
    topic,
    category: 'start-9-10',
    timeLimitMs: 1000,
    memoryLimitKb: 262144,
    testsCount: 20,
    difficulty: 1,
    olympGrade: null,
    olympLevel: null,
  };
}

const PROBLEMS = [
  summary('suma-vector', 'Suma din vector', 'Vectori'),
  summary('diagonala', 'Diagonala principală', 'Matrice'),
  summary('permutari', 'Permutări', 'Backtracking'),
];

const DETAIL: ProblemDetail = {
  ...summary('suma-vector', 'Suma din vector', 'Vectori'),
  statement: 'Se dau n numere. Afișați suma lor.',
  inputFormat: 'Pe prima linie n, apoi n numere.',
  outputFormat: 'Suma.',
  constraints: '1 ≤ n ≤ 100',
  hint: '',
  examples: [
    { input: '3\n1 2 3\n', output: '6\n' },
    { input: '1\n5\n', output: '5\n' },
  ],
  images: [],
  formulas: [],
  url: 'https://collaborare.ro/probleme/suma-vector',
};

function props(overrides: Partial<ProblemsPanelProps> = {}): ProblemsPanelProps {
  return {
    problems: PROBLEMS,
    loading: false,
    error: null,
    stale: false,
    categories: problemCategories(PROBLEMS),
    grades: [],
    levels: [],
    text: '',
    category: CATEGORY_ALL,
    olympGrade: null,
    olympLevel: null,
    slug: null,
    detail: null,
    detailLoading: false,
    detailError: null,
    followHost: true,
    isHost: true,
    history: [],
    verdicts: [],
    examplesRunning: false,
    confirming: false,
    listing: overrides.listing ?? overrides.slug == null,
    onShowList: vi.fn(),
    onText: vi.fn(),
    onCategory: vi.fn(),
    onOlympGrade: vi.fn(),
    onOlympLevel: vi.fn(),
    onSelect: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onRandom: vi.fn(),
    onFollowHost: vi.fn(),
    onLoad: vi.fn(),
    onConfirmLoad: vi.fn(),
    onRunExamples: vi.fn(),
    onSubmit: vi.fn(async () => true),
    onClose: vi.fn(),
    ...overrides,
  };
}

/** Wires the panel to the real filter and step helpers, the way useProblemBrowser does. */
function Harness() {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(CATEGORY_ALL);
  const [slug, setSlug] = useState<string | null>(null);
  const rows = filterProblems(PROBLEMS, { text, category });
  const slugs = rows.map((row) => row.slug);
  return (
    <ProblemsPanel
      {...props({
        problems: rows,
        text,
        category,
        slug,
        onText: setText,
        onCategory: setCategory,
        onSelect: setSlug,
        onNext: () => setSlug(stepProblem(slugs, slug, 1)),
        onPrev: () => setSlug(stepProblem(slugs, slug, -1)),
      })}
    />
  );
}

describe('ProblemsPanel', () => {
  it('lists each problem with its limits and test count', () => {
    render(<ProblemsPanel {...props()} />);
    expect(screen.getByText('Suma din vector')).toBeTruthy();
    expect(screen.getByText('Permutări')).toBeTruthy();
    const meta = screen.getAllByText(/20 tests/);
    expect(meta).toHaveLength(3);
    expect(meta[0]?.textContent).toContain('1 s');
    expect(meta[0]?.textContent).toContain('256 MB');
  });

  it('shows the same topic chips as collaborare.ro', () => {
    render(<ProblemsPanel {...props()} />);
    for (const label of ['Toate problemele', 'Vectori', 'Matrice', 'Backtracking']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('narrows the list by search and by category', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Search problems'), { target: { value: 'diag' } });
    expect(screen.queryByText('Suma din vector')).toBeNull();
    expect(screen.getByText('Diagonala principală')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search problems'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Backtracking' }));
    expect(screen.getByText('Permutări')).toBeTruthy();
    expect(screen.queryByText('Diagonala principală')).toBeNull();
  });

  it('steps through the filtered list with Next, Prev and Alt+arrows', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(<ProblemsPanel {...props({ onNext, onPrev })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next problem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous problem' }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onPrev).toHaveBeenCalledTimes(2);
  });

  it('disables navigation when nothing matches and says so', () => {
    render(<ProblemsPanel {...props({ problems: [] })} />);
    expect(screen.getByText('No problems match this search.')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Next problem' });
    expect(next.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows loading, then an error with a link to collaborare.ro', () => {
    const { rerender } = render(<ProblemsPanel {...props({ problems: [], loading: true })} />);
    expect(screen.getByText('Loading problems…')).toBeTruthy();
    rerender(
      <ProblemsPanel {...props({ problems: [], error: 'The problem list is unavailable.' })} />,
    );
    expect(screen.getByText('The problem list is unavailable.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open collaborare.ro' })).toBeTruthy();
  });

  it('opens the statement with its formats and examples', () => {
    render(<ProblemsPanel {...props({ slug: 'suma-vector', detail: DETAIL })} />);
    expect(screen.getByText('Se dau n numere. Afișați suma lor.')).toBeTruthy();
    expect(screen.getByText(/Pe prima linie n, apoi n numere\./)).toBeTruthy();
    expect(screen.getByText('Example 1')).toBeTruthy();
    expect(screen.getByText('Example 2')).toBeTruthy();
  });

  it('shows pass and fail per example, with the output that differed', () => {
    render(
      <ProblemsPanel
        {...props({
          slug: 'suma-vector',
          detail: DETAIL,
          verdicts: [
            { index: 0, passed: true, expected: '6\n', actual: '6\n', error: null },
            { index: 1, passed: false, expected: '5\n', actual: '4\n', error: null },
          ],
        })}
      />,
    );
    expect(screen.getByText('1/2 examples passed')).toBeTruthy();
    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText(/Your output/).textContent).toContain('4');
  });

  it('asks before replacing code and reports the answer', () => {
    const onConfirmLoad = vi.fn();
    render(
      <ProblemsPanel
        {...props({ slug: 'suma-vector', detail: DETAIL, confirming: true, onConfirmLoad })}
      />,
    );
    expect(screen.getByText('Replace the code in the editor with this starter?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onConfirmLoad.mock.calls).toEqual([[false], [true]]);
  });

  it('lets a guest stop following the host', () => {
    const onFollowHost = vi.fn();
    render(<ProblemsPanel {...props({ isHost: false, onFollowHost })} />);
    const toggle = screen.getByRole('switch', { name: 'Stop following the host' });
    expect(screen.getByText('Following the host')).toBeTruthy();
    fireEvent.click(toggle);
    expect(onFollowHost).toHaveBeenCalledWith(false);
  });
});
