import { useCallback, useEffect, useState } from 'react';
import { fetchDirectory, type Account } from './accounts';

export interface Directory {
  /** Everyone with an account on this deployment, by name. */
  readonly people: Account[];
  readonly error: string | null;
  reload: () => void;
}

/**
 * The people a meeting can be scheduled with. It is the account list, so a
 * name in the calendar is somebody who can actually sign in and join.
 */
export function useDirectory(token: string | null): Directory {
  const [people, setPeople] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setPeople([]);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const directory = await fetchDirectory(token);
        if (live) {
          setPeople(directory);
          setError(null);
        }
      } catch (cause) {
        if (live) {
          setError((cause as Error).message);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [token, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  return { people, error, reload };
}
