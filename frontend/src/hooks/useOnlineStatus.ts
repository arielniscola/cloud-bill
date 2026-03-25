import { useState, useEffect, useCallback, useRef } from 'react';

export interface OnlineStatus {
  /** true = internet disponible (navigator.onLine) */
  isInternetOnline: boolean;
  /** true = backend local responde al /health */
  isBackendOnline: boolean;
  /** true = todo funciona (internet + backend) */
  isFullyOnline: boolean;
  /** true = backend ok pero sin internet (AFIP no disponible) */
  isLocalOnly: boolean;
}

const HEALTH_URL = '/health';
const POLL_INTERVAL_MS = 30_000; // 30 s
const HEALTH_TIMEOUT_MS = 5_000; // 5 s

async function checkBackend(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): OnlineStatus {
  const [isInternetOnline, setIsInternetOnline] = useState<boolean>(navigator.onLine);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true); // optimistic
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runHealthCheck = useCallback(async () => {
    const ok = await checkBackend();
    setIsBackendOnline(ok);
  }, []);

  useEffect(() => {
    // Initial check
    runHealthCheck();

    // Browser online/offline events
    const onOnline = () => {
      setIsInternetOnline(true);
      runHealthCheck(); // recheck immediately
    };
    const onOffline = () => setIsInternetOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Poll backend health every 30 s
    pollRef.current = setInterval(runHealthCheck, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runHealthCheck]);

  return {
    isInternetOnline,
    isBackendOnline,
    isFullyOnline: isInternetOnline && isBackendOnline,
    isLocalOnly: isBackendOnline && !isInternetOnline,
  };
}
