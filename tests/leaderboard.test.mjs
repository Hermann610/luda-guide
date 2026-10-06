import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLeaderboard } from '../src/lib/leaderboard.ts';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

test('distinguishes empty leaderboard from HTTP errors and invalid bodies', async () => {
  globalThis.fetch = async () => Response.json({ leaderboard: [] });
  assert.deepEqual(await fetchLeaderboard(), []);
  globalThis.fetch = async () => Response.json({}, { status: 401 });
  await assert.rejects(fetchLeaderboard(), /登录/);
  globalThis.fetch = async () => Response.json({ leaderboard: [] }, { status: 503 });
  await assert.rejects(fetchLeaderboard(), /不可用/);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(fetchLeaderboard(), /数据异常/);
});
test('validates rows and renders all 50 supported ranks', async () => {
  const list = Array.from({ length: 50 }, (_, i) => ({ u: `u${i}`, s: 50 - i, t: i }));
  globalThis.fetch = async () => Response.json({ leaderboard: list });
  assert.equal((await fetchLeaderboard()).length, 50);
  for (const invalid of [null, { u: 'x', s: '5', t: 0 }, { u: 'x', s: -1, t: 0 }, ...[ [list[0], list[0]] ]]) {
    globalThis.fetch = async () => Response.json({ leaderboard: Array.isArray(invalid) ? invalid : [invalid] });
    await assert.rejects(fetchLeaderboard(), /数据异常/);
  }
});
test('passes cancellation to fetch so obsolete loads can be stopped', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    return Response.json({ leaderboard: [] });
  };
  await fetchLeaderboard(controller.signal);
});
