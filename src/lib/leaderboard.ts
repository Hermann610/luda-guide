export interface LeaderEntry { u: string; s: number; t: number }

export async function fetchLeaderboard(signal?: AbortSignal): Promise<LeaderEntry[]> {
  const response = await fetch('/api/score/leaderboard', { signal, cache: 'no-store' });
  if (response.status === 401) throw new Error('登录已过期，请重新登录后重试。');
  if (!response.ok) throw new Error('排行榜暂时不可用，请稍后重试。');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('leaderboard' in data) || !Array.isArray(data.leaderboard)) {
    throw new Error('排行榜数据异常，请稍后重试。');
  }
  const users = new Set<string>();
  for (const entry of data.leaderboard) {
    if (!entry || typeof entry.u !== 'string' || !entry.u.trim() || users.has(entry.u)
      || !Number.isInteger(entry.s) || entry.s < 0 || entry.s > 99999
      || !Number.isFinite(entry.t) || entry.t < 0) {
      throw new Error('排行榜数据异常，请稍后重试。');
    }
    users.add(entry.u);
  }
  return data.leaderboard.slice(0, 50);
}
