import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useErrors } from '@/i18n/errors';

/**
 * Load data whenever the screen comes into focus (first open AND coming back to it),
 * plus pull-to-refresh. Errors come back already translated. `fetcher` must be stable: declare it outside the component or
 * wrap it in useCallback, otherwise it re-fetches on every render.
 */
export function useFocusData<T>(fetcher: () => Promise<T>) {
  const describe = useErrors();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true; // ignore the result if the screen lost focus mid-request
      fetcher()
        .then((result) => {
          if (!active) return;
          setData(result);
          setError(null);
        })
        .catch((e) => active && setError(describe(e, 'errors.loadData')));
      return () => {
        active = false;
      };
    }, [fetcher, describe]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await fetcher());
      setError(null);
    } catch (e) {
      setError(describe(e, 'errors.loadData'));
    } finally {
      setRefreshing(false);
    }
  }, [fetcher, describe]);

  return { data, error, refreshing, refresh };
}
