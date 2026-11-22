import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, getApiBase } from '../lib/api';

export const REFRESH_EVENT = 'systemscope:refresh';

interface Flight {
  promise: Promise<unknown>;
  controller: AbortController;
  subscribers: number;
}

/**
 * One request per path at a time. Consumers share the promise; the request is
 * only aborted when the last subscriber goes away.
 */
const inFlight = new Map<string, Flight>();

function acquire(path: string): Flight {
  let flight = inFlight.get(path);
  if (!flight) {
    const controller = new AbortController();
    const promise = api.get<unknown>(path, controller.signal).finally(() => {
      if (inFlight.get(path) === flight) inFlight.delete(path);
    });
    flight = { promise, controller, subscribers: 0 };
    inFlight.set(path, flight);
  }
  flight.subscribers += 1;
  return flight;
}

function release(path: string, flight: Flight): void {
  flight.subscribers -= 1;
  if (flight.subscribers <= 0) {
    flight.controller.abort();
    if (inFlight.get(path) === flight) inFlight.delete(path);
  }
}

type ConnectionHint = { saveData?: boolean; effectiveType?: string };

function networkMultiplier(): number {
  const connection = (navigator as Navigator & { connection?: ConnectionHint }).connection;
  if (!connection) return 1;
  if (connection.saveData) return 3;
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return 4;
  if (connection.effectiveType === '3g') return 2;
  return 1;
}

export function useApi<T>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-evaluated on every render; the URL changes when the selected device
  // changes, so requests and dedupe keys always stay in the right scope.
  const base = getApiBase();
  const key = `${base}${path ?? ''}`;

  const mounted = useRef(true);
  const seqRef = useRef(0);
  const failuresRef = useRef(0);
  const activeRef = useRef<Array<{ key: string; flight: Flight }>>([]);

  const load = useCallback(async () => {
    if (!path) return;
    const seq = ++seqRef.current;
    const flight = acquire(key);
    activeRef.current.push({ key, flight });

    try {
      const result = (await flight.promise) as T;
      if (!mounted.current || seq !== seqRef.current) return;
      setData(result);
      setError(null);
      failuresRef.current = 0;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (!mounted.current || seq !== seqRef.current) return;
      setError(errorMessage(err));
      failuresRef.current = Math.min(failuresRef.current + 1, 5);
    } finally {
      release(key, flight);
      activeRef.current = activeRef.current.filter((item) => item.flight !== flight);
      if (mounted.current && seq === seqRef.current) setLoading(false);
    }
  }, [key, path]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void load();

    const base = intervalMs > 0 ? intervalMs * networkMultiplier() : 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (!base || document.hidden) return;
      const delay = Math.min(base * 2 ** failuresRef.current, 60_000);
      timer = setTimeout(() => {
        void load().then(schedule);
      }, delay);
    };
    schedule();

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = undefined;
      } else {
        void load();
        schedule();
      }
    };
    const onRefresh = () => void load();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(REFRESH_EVENT, onRefresh);

    return () => {
      mounted.current = false;
      for (const { key: activeKey, flight } of activeRef.current) release(activeKey, flight);
      activeRef.current = [];
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [load, intervalMs]);

  return { data, error, loading, refetch: load };
}
