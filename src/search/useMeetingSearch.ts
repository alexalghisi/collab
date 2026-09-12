import { useCallback, useState } from 'react';
import { SIGNALING_URL } from '../signaling/config';
import type { VectorHit } from './VectorStore';

export interface MeetingSearch {
  readonly query: string;
  readonly hits: VectorHit[];
  readonly loading: boolean;
  readonly error: string | null;
  setQuery: (value: string) => void;
  run: () => Promise<void>;
}

export function useMeetingSearch(): MeetingSearch {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<VectorHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    const text = query.trim();
    if (text === '') {
      setError('Enter something to search for.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${SIGNALING_URL}/search?q=${encodeURIComponent(text)}`);
      const body = (await response.json()) as { hits?: VectorHit[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `Search failed (${response.status}).`);
      }
      setHits(body.hits ?? []);
    } catch (cause) {
      setHits([]);
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return { query, hits, loading, error, setQuery, run };
}
