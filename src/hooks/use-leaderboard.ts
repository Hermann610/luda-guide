import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '@/lib/leaderboard';
import type { LeaderEntry } from '@/lib/leaderboard';

export function useLeaderboard(refreshKey = 0) {
  const [retryKey, setRetryKey] = useState(0);
  const key = `${refreshKey}:${retryKey}`;
  const [result, setResult] = useState<{ key: string; list: LeaderEntry[]; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetchLeaderboard(controller.signal)
      .then(list => { if (alive) setResult({ key, list, error: null }); })
      .catch(error => {
        if (alive) setResult({ key, list: [], error: controller.signal.aborted ? '加载超时，请重试。' : error instanceof Error ? error.message : '网络异常，请重试。' });
      })
      .finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [key]);
  return {
    list: result?.key === key ? result.list : null,
    error: result?.key === key ? result.error : null,
    retry: () => setRetryKey(value => value + 1),
  };
}
