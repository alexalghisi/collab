import { useEffect, useMemo, useState } from 'react';
import { runOnHostedCompiler } from '../code/hostedRun';
import type { SharedCodeDocument } from '../code/SharedCodeDocument';
import { SIGNALING_URL } from '../signaling/config';
import { runProblemExamples, type ExampleVerdict } from './examples';
import {
  CATEGORY_ALL,
  CATEGORY_OLYMPIAD,
  filterProblems,
  olympiadGrades,
  olympiadLevels,
  problemCategories,
} from './filter';
import {
  firstExampleInput,
  problemStarter,
  shouldConfirmOverwrite,
  starterLanguage,
} from './starter';
import { randomProblem, stepProblem, visibleProblemSlug, type ProblemSyncState } from './sync';
import type { ProblemListQuery } from '../signaling/events';
import { useProblemCatalog } from './useProblemCatalog';

export interface ProblemBrowserSession {
  readonly problemSync: ProblemSyncState;
  readonly isHost: boolean;
  readonly code: SharedCodeDocument | null;
  chooseProblem: (slug: string) => void;
  setProblemQuery: (query: ProblemListQuery) => void;
  setFollowHost: (follow: boolean) => void;
}

export function useProblemBrowser(session: ProblemBrowserSession) {
  const catalog = useProblemCatalog(SIGNALING_URL);
  const query = session.problemSync.host.query;
  const text = query.text;
  const category = query.category || CATEGORY_ALL;
  const olympGrade = query.olympGrade;
  const olympLevel = query.olympLevel;
  const [verdicts, setVerdicts] = useState<readonly ExampleVerdict[]>([]);
  const [examplesRunning, setExamplesRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [stdinSeed, setStdinSeed] = useState<{
    readonly token: number;
    readonly value: string;
  } | null>(null);

  const slug = visibleProblemSlug(session.problemSync);
  const categories = useMemo(() => problemCategories(catalog.problems), [catalog.problems]);
  const grades = useMemo(() => olympiadGrades(catalog.problems), [catalog.problems]);
  const levels = useMemo(() => olympiadLevels(catalog.problems), [catalog.problems]);
  const rows = useMemo(
    () =>
      filterProblems(catalog.problems, {
        text,
        category,
        olympGrade: category === CATEGORY_OLYMPIAD ? olympGrade : null,
        olympLevel: category === CATEGORY_OLYMPIAD ? olympLevel : null,
      }),
    [catalog.problems, text, category, olympGrade, olympLevel],
  );
  const detail = slug ? (catalog.details[slug] ?? null) : null;
  const history = session.problemSync.followHost
    ? session.problemSync.host.history
    : session.problemSync.localHistory;

  useEffect(() => {
    if (!slug) {
      return;
    }
    void catalog.loadDetail(slug);
    setVerdicts([]);
    setConfirming(false);
  }, [slug, catalog.loadDetail]);

  const publishQuery = (patch: Partial<ProblemListQuery>): void => {
    session.setProblemQuery({ ...query, ...patch });
  };

  const select = (next: string | null): void => {
    if (next) {
      session.chooseProblem(next);
    }
  };

  const applyLoad = (): void => {
    if (!detail || !session.code) {
      return;
    }
    const language = starterLanguage(session.code.language);
    session.code.setLanguage(language);
    session.code.replaceText(problemStarter(language, detail.title));
    setStdinSeed({ token: Date.now(), value: firstExampleInput(detail) });
    setConfirming(false);
  };

  const runExamples = (): void => {
    if (!detail || !session.code || detail.examples.length === 0 || examplesRunning) {
      return;
    }
    const language = session.code.language;
    const code = session.code.text.toString();
    setExamplesRunning(true);
    void runProblemExamples({
      language,
      code,
      examples: detail.examples,
      run: runOnHostedCompiler,
    })
      .then(setVerdicts)
      .finally(() => setExamplesRunning(false));
  };

  return {
    problems: rows,
    total: catalog.problems.length,
    loading: catalog.loading,
    error: catalog.error,
    stale: catalog.stale,
    categories,
    grades,
    levels,
    text,
    category,
    olympGrade,
    olympLevel,
    slug,
    detail,
    detailLoading: catalog.detailLoading && detail === null,
    detailError: catalog.detailError,
    followHost: session.problemSync.followHost,
    isHost: session.isHost,
    history,
    verdicts,
    examplesRunning,
    confirming,
    stdinSeed,
    listing: query.listing,
    setText: (value: string) => publishQuery({ text: value, listing: true }),
    setCategory: (next: string) => {
      publishQuery({
        category: next,
        listing: true,
        ...(next === CATEGORY_OLYMPIAD ? {} : { olympGrade: null, olympLevel: null }),
      });
    },
    setOlympGrade: (grade: number | null) => publishQuery({ olympGrade: grade, listing: true }),
    setOlympLevel: (level: string | null) => publishQuery({ olympLevel: level, listing: true }),
    showList: () => publishQuery({ listing: true }),
    select,
    prev: () =>
      select(
        stepProblem(
          rows.map((row) => row.slug),
          slug,
          -1,
        ),
      ),
    next: () =>
      select(
        stepProblem(
          rows.map((row) => row.slug),
          slug,
          1,
        ),
      ),
    random: () =>
      select(
        randomProblem(
          rows.map((row) => row.slug),
          slug,
          Math.random,
        ),
      ),
    setFollowHost: session.setFollowHost,
    requestLoad: () => {
      if (!detail || !session.code) {
        return;
      }
      if (shouldConfirmOverwrite(session.code.text.toString(), detail)) {
        setConfirming(true);
        return;
      }
      applyLoad();
    },
    confirmLoad: (replace: boolean) => {
      if (replace) {
        applyLoad();
        return;
      }
      setConfirming(false);
    },
    runExamples,
  };
}
