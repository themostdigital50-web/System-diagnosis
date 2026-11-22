import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';

export const REFRESH_EVENT = 'systemscope:refresh';

export function useApi<T>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api.get<T>(path);
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void load();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (intervalMs > 0) timer = setInterval(() => void load(), intervalMs);

    const onRefresh = () => void load();
    window.addEventListener(REFRESH_EVENT, onRefresh);

    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [load, intervalMs]);

  return { data, error, loading, refetch: load };
}
