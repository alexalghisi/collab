import { useCallback, useEffect, useRef, useState } from 'react';
import { browserProblemCache, fetchProblemDetail, fetchProblemList } from './client';
import type { ProblemDetail, ProblemSummary } from './types';

export function useProblemCatalog(signalingUrl: string) {
  const cache = useRef(browserProblemCache());
  const [problems, setProblems] = useState<readonly ProblemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [details, setDetails] = useState<Readonly<Record<string, ProblemDetail>>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => {
    let live = true;
    setLoading(true);
    void fetchProblemList({ signalingUrl, cache: cache.current })
      .then((list) => {
        if (!live) {
          return;
        }
        setProblems(list.problems);
        setStale(list.stale);
        setError(null);
      })
      .catch(() => {
        if (!live) {
          return;
        }
        setError('The problem list is unavailable.');
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [signalingUrl]);

  const loadDetail = useCallback(
    async (slug: string): Promise<ProblemDetail | null> => {
      const cached = detailsRef.current[slug];
      if (cached) {
        return cached;
      }
      setDetailLoading(true);
      setDetailError(null);
      try {
        const detail = await fetchProblemDetail({ signalingUrl, slug, cache: cache.current });
        setDetails((current) => ({ ...current, [slug]: detail }));
        return detail;
      } catch {
        setDetailError('The statement is unavailable.');
        return null;
      } finally {
        setDetailLoading(false);
      }
    },
    [signalingUrl],
  );

  return { problems, loading, error, stale, details, detailLoading, detailError, loadDetail };
}
