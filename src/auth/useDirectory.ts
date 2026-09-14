import { useCallback, useEffect, useState } from 'react';
import { fetchDirectory } from './api';
import type { Account, AuthSession } from './types';

export interface Directory {
  /** Everyone with an account here, except the signed-in person, by name. */
  readonly people: Account[];
  readonly error: string | null;
  reload: () => Promise<void>;
}

/** Who this deployment knows about, which is who a meeting can be scheduled with. */
export function useDirectory(session: AuthSession | null): Directory {
  const [people, setPeople] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const token = session?.token ?? null;
  const selfId = session?.account.id ?? null;

  const reload = useCallback(async () => {
    if (!token) {
      setPeople([]);
      return;
    }
    try {
      const accounts = await fetchDirectory(token);
      setPeople(accounts.filter((account) => account.id !== selfId));
      setError(null);
    } catch {
      setError('Could not load the list of people.');
    }
  }, [token, selfId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { people, error, reload };
}
