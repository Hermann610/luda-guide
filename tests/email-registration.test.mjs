import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../auth-worker/index.js';
import { RegistrationStore, normalizeEmail } from '../auth-worker/registration.js';
import { onRequest } from '../functions/_middleware.ts';
import { signedRegistrationHeaders } from '../server/registration.ts';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalTimeout = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = originalFetch; Date.now = originalNow; globalThis.setTimeout = originalTimeout; });
const secret = 'test-secret-only';
function setup() {
  const records = new Map(), legacy = new Map(), sent = [];
  let alarm = null;
  const storage = {
    async get(key) { return structuredClone(records.get(key)); },
    async put(key, value) { records.set(key, structuredClone(value)); },
    async delete(key) { return records.delete(key); },
    async getAlarm() { return alarm; }, async setAlarm(value) { alarm = value; },
    async list({ prefix }) { return new Map([...records].filter(([key]) => key.startsWith(prefix))); },
    async transaction(callback) {
      const saved = structuredClone(records);
      try { return await callback(storage); }
      catch (error) { records.clear(); for (const [key, value] of saved) records.set(key, value); throw error; }
    },
  };
  const env = { SESSION_SECRET: secret, REGISTRATION_ENABLED: 'true', BREVO_API_KEY: 'fake-api-key', MAIL_FROM: 'sender@example.com',
    USERS: { async get(key, type) { const value = legacy.get(key) ?? null; return type === 'json' && value !== null ? JSON.parse(value) : value; },
      async put(key, value) { legacy.set(key, value); }, async delete(key) { legacy.delete(key); } } };
  const store = new RegistrationStore({ storage }, env);
  env.REGISTRATION = { idFromName: name => name, get: () => store };
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json({ messageId: 'test-message' }, { status: 201 }); };
  const call = async (action, body, ip = '192.0.2.1') => {
    const path = `/api/register/${action}`;
    const text = JSON.stringify(body);
    return worker.fetch(new Request(`https://worker.invalid${path}`, { method: 'POST',
      headers: await signedRegistrationHeaders(path, text, ip, env.SESSION_SECRET), body: text }), env);
  };
  const code = () => sent.at(-1).textContent.match(/验证码是：(\d{6})/)[1];
  const begin = async email => { const response = await call('code', { email }); assert.equal(response.status, 200); return (await response.json()).challenge; };
  return { records, legacy, env, store, storage, sent, call, code, begin };
}
const credentials = (challenge, code, username = '同学01', email = 'student@ruc.edu.cn') => ({ email, challenge, code, username, password: 'separate-password' });

test('exact RUC domain only, types/aliases/alumni/spoofed suffixes rejected before sending', async () => {
  const state = setup();
  assert.equal(normalizeEmail(' Student@RUC.EDU.CN '), 'student@ruc.edu.cn');
  for (const email of [null, {}, 'student@alu.ruc.edu.cn', 'student@ruc.edu.cn.evil.com', 'student+alias@ruc.edu.cn', 'a\n@ruc.edu.cn', 'student@qq.com']) {
    assert.equal((await state.call('code', { email })).status, 400);
  }
  assert.equal(state.sent.length, 0);
});

test('Pages to Worker signup creates signed HttpOnly session and login works with registration disabled', async () => {
  const state = setup();
  const mailFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => String(url).startsWith('https://worker.invalid')
    ? worker.fetch(new Request(url, init), state.env) : mailFetch(url, init);
  const context = (path, body) => ({ env: { AUTH_API: 'https://worker.invalid', SESSION_SECRET: secret, REGISTRATION_ENABLED: 'true' },
    request: new Request(`https://pages.invalid${path}`, { method: 'POST', headers: {
      Origin: 'https://pages.invalid', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) }),
    next: () => new Response('private') });
  const sent = await onRequest(context('/api/register/code', { email: 'student@ruc.edu.cn' }));
  assert.equal(sent.status, 200);
  const data = await sent.json();
  assert.equal(data.code, undefined);
  const complete = await onRequest(context('/api/register/complete', credentials(data.challenge, state.code())));
  assert.equal(complete.status, 200);
  assert.deepEqual(await complete.json(), { ok: true });
  assert.match(complete.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(state.legacy.has('同学01'), false);
  const account = state.records.get('user:同学01');
  assert.equal(account.password, undefined);
  assert.equal(account.email, 'student@ruc.edu.cn');
  assert.match(account.hash, /^[a-f0-9]{64}$/);
  assert.notEqual(account.hash, 'separate-password');
  state.env.REGISTRATION_ENABLED = 'false';
  const login = await worker.fetch(new Request('https://worker.invalid/api/auth', { method: 'POST',
    body: JSON.stringify({ username: '同学01', password: 'separate-password' }) }), state.env);
  assert.equal(login.status, 200);
  const token = (await login.json()).token;
  const page = await onRequest({ ...context('/', {}), request: new Request('https://pages.invalid/', { headers: { Cookie: `luda_session=${token}` } }) });
  assert.equal(await page.text(), 'private');
  assert.equal((await state.call('code', { email: 'other@ruc.edu.cn' })).status, 503);
});

test('OTP expiry, five guesses and successful consumption are enforced', async () => {
  let now = originalNow(); Date.now = () => now;
  const state = setup();
  const challenge = await state.begin('student@ruc.edu.cn');
  const actual = state.code(), wrong = actual === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await state.call('complete', credentials(challenge, wrong))).status, 400);
  assert.equal((await state.call('complete', credentials(challenge, actual))).status, 429);
  now += 60001;
  const latest = await state.begin('student@ruc.edu.cn');
  now += 600001;
  assert.equal((await state.call('complete', credentials(latest, state.code()))).status, 400);
  const current = await state.begin('student@ruc.edu.cn');
  const body = credentials(current, state.code());
  assert.equal((await state.call('complete', body)).status, 200);
  assert.equal((await state.call('complete', body)).status, 400);
});

test('concurrent sends reserve cooldown once; resend replaces the previous challenge', async () => {
  let now = originalNow(); Date.now = () => now;
  const state = setup();
  const responses = await Promise.all([state.call('code', { email: 'student@ruc.edu.cn' }), state.call('code', { email: 'STUDENT@RUC.EDU.CN' })]);
  assert.deepEqual(responses.map(response => response.status), [200, 429]);
  const old = credentials((await responses[0].json()).challenge, state.code());
  assert.equal(state.sent.length, 1);
  now += 60001;
  const challenge = await state.begin('student@ruc.edu.cn');
  assert.equal((await state.call('complete', old)).status, 400);
  assert.equal((await state.call('complete', credentials(challenge, state.code()))).status, 200);
});

test('concurrent registrations cannot claim the same username or overwrite an account', async () => {
  const state = setup();
  const a = await state.begin('student@ruc.edu.cn'), codeA = state.code();
  const b = await state.begin('other@ruc.edu.cn'), codeB = state.code();
  const responses = await Promise.all([
    state.call('complete', credentials(a, codeA)), state.call('complete', credentials(b, codeB, '同学01', 'other@ruc.edu.cn')),
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 409]);
  assert.equal(state.records.get('user:同学01').email, 'student@ruc.edu.cn');
  const sameCode = credentials(b, codeB, '同学02', 'other@ruc.edu.cn');
  assert.equal((await state.call('complete', sameCode)).status, 200);
});

test('one mailbox cannot claim a second username; legacy KV accounts are preserved', async () => {
  let now = originalNow(); Date.now = () => now;
  const state = setup();
  let challenge = await state.begin('student@ruc.edu.cn');
  state.legacy.set('同学01', '{"original":true}');
  assert.equal((await state.call('complete', credentials(challenge, state.code()))).status, 409);
  assert.equal(state.legacy.get('同学01'), '{"original":true}');
  assert.equal((await state.call('complete', credentials(challenge, state.code(), '同学02'))).status, 200);
  now += 60001;
  challenge = await state.begin('student@ruc.edu.cn');
  assert.equal((await state.call('complete', credentials(challenge, state.code(), '同学03'))).status, 409);
  assert.equal(state.records.has('user:同学03'), false);
});

test('daily/email/IP limits reject before contacting the mail provider', async () => {
  let now = originalNow(); Date.now = () => now;
  const state = setup();
  for (let i = 0; i < 5; i++) { await state.begin('student@ruc.edu.cn'); now += 60001; }
  assert.equal((await state.call('code', { email: 'student@ruc.edu.cn' })).status, 429);
  for (let i = 0; i < 15; i++) await state.begin(`student${i}@ruc.edu.cn`);
  assert.equal((await state.call('code', { email: 'next@ruc.edu.cn' })).status, 429);
  state.records.set('temp:daily', { count: 250, events: Array(250).fill(now), expiresAt: now + 86400000 });
  assert.equal((await state.call('code', { email: 'fresh@ruc.edu.cn' }, '192.0.2.2')).status, 429);
  assert.equal(state.sent.length, 20);
});

test('mail provider rejection, malformed response and timeout cannot validate an OTP', async () => {
  globalThis.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 4000 ? 1 : delay, ...args);
  for (const mode of ['reject', 'missing-id', 'timeout']) {
    const state = setup();
    let captured;
    globalThis.fetch = async (_url, init) => {
      captured = JSON.parse(init.body);
      if (mode === 'timeout') return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('private-key')), { once: true }));
      return Response.json(mode === 'reject' ? { message: 'private-key' } : {}, { status: mode === 'reject' ? 429 : 201 });
    };
    const response = await state.call('code', { email: 'student@ruc.edu.cn' });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private-key|fake-api-key/);
    const record = [...state.records.entries()].find(([key]) => key.startsWith('temp:code:'))[1];
    assert.equal(record.delivered, false);
    const code = captured.textContent.match(/验证码是：(\d{6})/)[1];
    assert.equal((await state.call('complete', credentials(record.challenge, code))).status, 400);
    assert.equal((await state.call('code', { email: 'student@ruc.edu.cn' })).status, 429);
  }
});

test('transaction failure leaves no partial account; same verified challenge can be retried', async () => {
  const state = setup();
  const challenge = await state.begin('student@ruc.edu.cn'), code = state.code();
  const originalPut = state.storage.put;
  state.storage.put = async (key, value) => { if (key.startsWith('email:')) throw new Error('storage-failure'); return originalPut(key, value); };
  assert.equal((await state.call('complete', credentials(challenge, code))).status, 503);
  assert.equal(state.records.has('user:同学01'), false);
  state.storage.put = originalPut;
  assert.equal((await state.call('complete', credentials(challenge, code))).status, 200);
});

test('unsigned/tampered/stale proxy requests and oversized bodies are rejected', async () => {
  const state = setup();
  const path = '/api/register/code', body = JSON.stringify({ email: 'student@ruc.edu.cn' });
  const headers = await signedRegistrationHeaders(path, body, '192.0.2.1', secret);
  for (const [requestHeaders, requestBody] of [[{}, body], [headers, body + ' '], [headers, 'x'.repeat(4097)]]) {
    const response = await worker.fetch(new Request(`https://worker.invalid${path}`, { method: 'POST', headers: requestHeaders, body: requestBody }), state.env);
    assert.equal(response.status, requestBody.length > 4096 ? 413 : 403);
  }
  Date.now = () => originalNow() + 61000;
  assert.equal((await worker.fetch(new Request(`https://worker.invalid${path}`, { method: 'POST', headers, body }), state.env)).status, 403);
  assert.equal(state.sent.length, 0);
});

test('Pages rejects cross-origin calls; closed registration stays closed with anonymous GET form', async () => {
  const state = setup();
  const env = { AUTH_API: 'https://worker.invalid', SESSION_SECRET: secret, REGISTRATION_ENABLED: 'true' };
  const response = await onRequest({ env, request: new Request('https://pages.invalid/api/register/code', {
    method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' }) });
  assert.equal(response.status, 403);
  env.REGISTRATION_ENABLED = 'false';
  const page = await onRequest({ env, request: new Request('https://pages.invalid/register') });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /注册暂未开放/);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.equal(state.sent.length, 0);
});

test('bad signup fields do not create accounts; registered login locks after ten wrong attempts', async () => {
  const state = setup();
  const challenge = await state.begin('student@ruc.edu.cn');
  const good = credentials(challenge, state.code());
  for (const patch of [{ username: 'admin' }, { password: 'short' }, { code: 123456 }, { username: {} }, { challenge: 'bad' }]) {
    assert.equal((await state.call('complete', { ...good, ...patch })).status, 400);
  }
  assert.equal(state.records.has('user:同学01'), false);
  assert.equal((await state.call('complete', good)).status, 200);
  const login = () => worker.fetch(new Request('https://worker.invalid/api/auth', { method: 'POST', body: JSON.stringify({ username: '同学01', password: 'wrong-password' }) }), state.env);
  const responses = await Promise.all(Array.from({ length: 10 }, login));
  assert.ok(responses.every(response => response.status === 403));
  assert.equal((await login()).status, 429);
});

test('alarm cleans expired challenges/counters and retains account and email uniqueness records', async () => {
  let now = originalNow(); Date.now = () => now;
  const state = setup();
  const challenge = await state.begin('student@ruc.edu.cn');
  assert.equal((await state.call('complete', credentials(challenge, state.code()))).status, 200);
  now += 86400001;
  await state.store.alarm();
  assert.ok([...state.records.keys()].every(key => !key.startsWith('temp:')));
  assert.equal(state.records.get('user:同学01').email, 'student@ruc.edu.cn');
  assert.equal([...state.records.keys()].filter(key => key.startsWith('email:')).length, 1);
});

test('session secret rotation preserves mailbox uniqueness', async () => {
  const state = setup();
  let challenge = await state.begin('student@ruc.edu.cn');
  assert.equal((await state.call('complete', credentials(challenge, state.code()))).status, 200);
  state.env.SESSION_SECRET = 'rotated-test-secret';
  challenge = await state.begin('STUDENT@RUC.EDU.CN');
  assert.equal((await state.call('complete', credentials(challenge, state.code(), '另一个同学'))).status, 409);
  assert.equal(state.records.has('user:另一个同学'), false);
});

test('global send cap is a rolling window rather than resetting to allow two bursts in one provider day', async () => {
  let now = originalNow(); Date.now = () => now;
  const state = setup();
  state.records.set('temp:daily', { count: 250, events: Array(250).fill(now - 23 * 3600000), expiresAt: now + 3600000 });
  assert.equal((await state.call('code', { email: 'student@ruc.edu.cn' })).status, 429);
  now += 3600001;
  assert.equal((await state.call('code', { email: 'student@ruc.edu.cn' })).status, 200);
});
