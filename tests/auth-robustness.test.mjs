import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../auth-worker/index.js';
import { onRequest } from '../functions/_middleware.ts';

const secret = 'test-only-session-secret';
const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; });
const kv = () => {
  const records = new Map();
  return {
    records,
    async get(key, type) { const raw = records.get(key) ?? null; return type === 'json' && raw !== null ? JSON.parse(raw) : raw; },
    async put(key, value) { records.set(key, value); },
    async delete(key) { records.delete(key); },
  };
};
const env = () => ({ USERS: kv(), SESSION_SECRET: secret });
const request = (path, body, token) => new Request(`https://test.invalid${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
async function token(user = 'student', exp = Date.now() + 60000) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp })).toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${Buffer.from(signature).toString('base64url')}`;
}
const context = (request) => ({ request, env: { AUTH_API: 'https://worker.invalid', SESSION_SECRET: secret }, next: () => new Response('private page') });

test('malformed Cookie is anonymous rather than an unhandled exception', async () => {
  const response = await onRequest(context(new Request('https://test.invalid/api/me', { headers: { Cookie: 'luda_session=%E0%A4%A' } })));
  assert.deepEqual(await response.json(), { user: null });
  const page = await onRequest(context(new Request('https://test.invalid/', { headers: { Cookie: 'luda_session=%' } })));
  assert.equal(page.status, 302);
});
test('null, arrays and wrong credential types receive 400', async () => {
  for (const body of [null, [], 3, { username: {}, password: 'abcdef' }, { username: 'student', password: 123456 }]) {
    assert.equal((await worker.fetch(request('/api/auth', body), env())).status, 400);
  }
});
test('score requires a real integer and valid session, zero remains valid', async () => {
  const session = await token();
  for (const body of [null, [], { score: null }, { score: false }, { score: '' }, { score: '12' }, { score: -1 }, { score: 1.5 }, { score: 100000 }]) {
    assert.equal((await worker.fetch(request('/api/score/submit', body, session), env())).status, 400);
  }
  const response = await worker.fetch(request('/api/score/submit', { score: 0 }, session), env());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).best, 0);
  assert.equal((await worker.fetch(request('/api/score/submit', { score: 2 }, 'bad'), env())).status, 401);
});
test('expired and malformed signed session payloads cannot access private pages', async () => {
  for (const session of [await token('student', Date.now() - 1), await token({ name: 'student' }), await token('')]) {
    const response = await onRequest(context(new Request('https://test.invalid/', { headers: { Cookie: `luda_session=${session}` } })));
    assert.equal(response.status, 302);
  }
});
test('KV failures and damaged account records produce no-store 503 without leaked details', async () => {
  const broken = env();
  broken.USERS.get = async () => { throw new Error('private binding details'); };
  const response = await worker.fetch(request('/api/auth', { username: 'student', password: 'abcdef' }), broken);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await response.text(), /private binding/);
  const damaged = env();
  damaged.USERS.records.set('student', JSON.stringify({ salt: null, hash: 'bad' }));
  assert.equal((await worker.fetch(request('/api/auth', { username: 'student', password: 'abcdef' }), damaged)).status, 503);
});
test('invalid leaderboard records are not overwritten on submission', async () => {
  const damaged = env();
  const raw = JSON.stringify([null]);
  damaged.USERS.records.set('leaderboard:v1', raw);
  const response = await worker.fetch(request('/api/score/submit', { score: 2 }, await token()), damaged);
  assert.equal(response.status, 503);
  assert.equal(damaged.USERS.records.get('leaderboard:v1'), raw);
});
test('login errors are escaped and rate-limit status is retained', async () => {
  globalThis.fetch = async () => Response.json({ ok: false, error: '<script>bad()</script>' }, { status: 429 });
  const response = await onRequest(context(new Request('https://test.invalid/login', { method: 'POST', body: new URLSearchParams({ username: 'student', password: 'abcdef' }) })));
  assert.equal(response.status, 429);
  const html = await response.text();
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('upstream stalls terminate with 503, including stalled response bodies', async () => {
  globalThis.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 8000 ? 1 : delay, ...args);
  for (const mode of ['headers', 'body']) {
    globalThis.fetch = (_url, options) => {
      if (mode === 'headers') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      return Promise.resolve({ status: 200, headers: new Headers(), arrayBuffer: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
    };
    const response = await onRequest(context(new Request('https://test.invalid/login', { method: 'POST', body: new URLSearchParams({ username: 'student', password: 'abcdef' }) })));
    assert.equal(response.status, 503);
  }
});
test('successful signed login and score submission continue to work', async () => {
  const session = await token();
  globalThis.fetch = async () => Response.json({ ok: true, token: session });
  const response = await onRequest(context(new Request('https://test.invalid/login', { method: 'POST', body: new URLSearchParams({ username: 'student', password: 'abcdef' }) })));
  assert.equal(response.status, 302);
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const state = env();
  assert.equal((await worker.fetch(request('/api/score/submit', { score: 8 }, session), state)).status, 200);
  const lower = await worker.fetch(request('/api/score/submit', { score: 2 }, session), state);
  assert.equal((await lower.json()).best, 8);
});
test('upstream cannot set an unsigned or mismatched user cookie', async () => {
  for (const value of ['invalid', await token('other')]) {
    globalThis.fetch = async () => Response.json({ ok: true, token: value });
    const response = await onRequest(context(new Request('https://test.invalid/login', { method: 'POST', body: new URLSearchParams({ username: 'student', password: 'abcdef' }) })));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
});
test('valid PBKDF2 login, invitation-only policy and existing lockout still work', async () => {
  const state = env();
  const password = 'test-password';
  const salt = new Uint8Array(16).fill(3);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  state.USERS.records.set('student', JSON.stringify({ salt: Buffer.from(salt).toString('hex'), hash: Buffer.from(hash).toString('hex') }));
  const login = await worker.fetch(request('/api/auth', { username: 'student', password }), state);
  assert.equal(login.status, 200);
  const session = (await login.json()).token;
  const page = await onRequest(context(new Request('https://test.invalid/', { headers: { Cookie: `luda_session=${session}` } })));
  assert.equal(await page.text(), 'private page');
  const unknown = await worker.fetch(request('/api/auth', { username: 'unknown', password }), state);
  assert.equal(unknown.status, 403);
  assert.equal(state.USERS.records.has('unknown'), false);
  state.USERS.records.set('lock:student', '10');
  assert.equal((await worker.fetch(request('/api/auth', { username: 'student', password }), state)).status, 429);
});
