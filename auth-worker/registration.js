import { TTL_MS, b64url, hmacKey, json, pbkdf2, readSmallBody, sign, validateName } from './auth-utils.js';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const unavailable = () => json({ ok: false, error: '注册服务暂时不可用，请稍后再试' }, 503);
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(16)));

export function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  // 校内邮箱的精确域名；校友邮箱 alu.ruc.edu.cn 不在此范围。
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*@ruc\.edu\.cn$/.test(email) ? email : null;
}

async function digest(value, secret) {
  const key = await hmacKey(secret);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

// Pages 为请求正文、路径及访客 IP 签名，防止直接访问 Worker 伪造限流 IP。
export async function registrationRequest(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: '请求方法不支持' }, 405);
  if (env.REGISTRATION_ENABLED !== 'true' || !env.REGISTRATION || !env.BREVO_API_KEY || !env.MAIL_FROM) return unavailable();
  const path = new URL(request.url).pathname;
  if (!['/api/register/code', '/api/register/complete'].includes(path)) return json({ ok: false }, 404);
  let text;
  try { text = await readSmallBody(request); } catch { return json({ ok: false, error: '请求过大' }, 413); }
  const timestamp = request.headers.get('X-Registration-Time') ?? '';
  const ip = request.headers.get('X-Registration-IP') ?? '';
  const proof = request.headers.get('X-Registration-Proof') ?? '';
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > MINUTE
    || !ip || ip.length > 64 || !/^[a-f0-9]{64}$/.test(proof)) return json({ ok: false, error: '无效请求' }, 403);
  const key = await hmacKey(env.SESSION_SECRET);
  const signature = Uint8Array.from(proof.match(/../g), byte => parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', key, signature,
    new TextEncoder().encode(JSON.stringify([path, timestamp, ip, text])))) return json({ ok: false, error: '无效请求' }, 403);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: '请求格式错误' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: '请求格式错误' }, 400);
  const store = env.REGISTRATION.get(env.REGISTRATION.idFromName('ruc-registration-v1'));
  return store.fetch(new Request(`https://registration.internal/${path.endsWith('/code') ? 'code' : 'complete'}`, {
    method: 'POST', body: JSON.stringify({ ...body, ip }),
  }));
}

// 一个协调对象保证邮箱/用户名唯一性、验证码消费和限流不受 KV 最终一致性影响。
export class RegistrationStore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
  }

  serialized(callback) {
    const result = this.queue.then(callback);
    this.queue = result.catch(() => {});
    return result;
  }

  fetch(request) {
    return this.serialized(async () => {
      try {
        if (request.method !== 'POST') return json({ ok: false }, 405);
        let body;
        try { body = JSON.parse(await readSmallBody(request)); } catch { return json({ ok: false, error: '请求格式错误' }, 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false }, 400);
        const path = new URL(request.url).pathname;
        if (path === '/login') return await this.login(body);
        if (this.env.REGISTRATION_ENABLED !== 'true' || !this.env.BREVO_API_KEY || !this.env.MAIL_FROM) return unavailable();
        const email = normalizeEmail(body.email);
        if (!email) return json({ ok: false, error: '请使用本人 @ruc.edu.cn 校内邮箱' }, 400);
        if (path === '/code') return await this.sendCode(email, body.ip);
        if (path === '/complete') return await this.complete(email, body);
        return json({ ok: false }, 404);
      } catch { return unavailable(); }
    });
  }

  async tempPut(key, value) {
    await this.ctx.storage.put(`temp:${key}`, value);
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + HOUR);
  }

  async counter(key, duration) {
    const old = await this.ctx.storage.get(`temp:${key}`);
    return old && old.expiresAt > Date.now() ? old : { count: 0, expiresAt: Date.now() + duration };
  }

  async sendCode(email, ip) {
    if (typeof ip !== 'string' || !ip || ip.length > 64) return json({ ok: false }, 400);
    const emailKey = await digest(email, this.env.SESSION_SECRET);
    const ipKey = await digest(ip, this.env.SESSION_SECRET);
    const day = await this.counter('daily', DAY);
    day.events = (day.events ?? []).filter(time => time > Date.now() - DAY);
    day.count = day.events.length;
    const mailLimit = await this.counter(`mail:${emailKey}`, HOUR);
    const ipLimit = await this.counter(`ip:${ipKey}`, HOUR);
    const previous = await this.ctx.storage.get(`temp:code:${emailKey}`);
    if (day.count >= 250 || mailLimit.count >= 5 || ipLimit.count >= 20) {
      return json({ ok: false, error: '发送次数已达上限，请稍后再试' }, 429);
    }
    if (previous?.sentAt + MINUTE > Date.now()) {
      return json({ ok: false, error: '请等待 60 秒后再发送', retryAfter: Math.ceil((previous.sentAt + MINUTE - Date.now()) / 1000) }, 429);
    }
    // 均匀采样六位验证码，不在响应、日志或持久存储中保存明文。
    const number = new Uint32Array(1);
    do { crypto.getRandomValues(number); } while (number[0] >= 4294000000);
    const code = String(number[0] % 1000000).padStart(6, '0');
    const challenge = randomHex();
    const record = { challenge, digest: await digest(JSON.stringify([email, challenge, code]), this.env.SESSION_SECRET),
      attempts: 0, sentAt: Date.now(), expiresAt: Date.now() + 10 * MINUTE, delivered: false };
    // 失败或超时也占用配额，避免重复发送耗尽服务商额度。
    await this.tempPut('daily', { count: day.count + 1, events: [...day.events, Date.now()], expiresAt: Date.now() + DAY });
    for (const [key, value] of [[`mail:${emailKey}`, mailLimit], [`ip:${ipKey}`, ipLimit]]) {
      await this.tempPut(key, { ...value, count: value.count + 1 });
    }
    await this.tempPut(`code:${emailKey}`, record);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: controller.signal,
        headers: { 'api-key': this.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: this.env.MAIL_FROM, name: '鹿大摸鱼站' }, to: [{ email }],
          subject: '鹿大摸鱼站 · 注册验证码',
          textContent: `你的注册验证码是：${code}\n10 分钟内有效，仅能使用一次。请勿把验证码告诉他人。\n本邮件用于验证校内邮箱，没有请求注册请忽略。\n鹿大摸鱼站为个人非官方项目。`,
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data?.messageId !== 'string' || !data.messageId) return unavailable();
      await this.tempPut(`code:${emailKey}`, { ...record, delivered: true });
      return json({ ok: true, challenge, expiresIn: 600, retryAfter: 60 });
    } catch { return unavailable(); }
    finally { clearTimeout(timer); }
  }

  async complete(email, body) {
    if (typeof body.username !== 'string' || typeof body.password !== 'string'
      || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)
      || typeof body.challenge !== 'string' || !/^[a-f0-9]{32}$/.test(body.challenge)) {
      return json({ ok: false, error: '请填写账号、密码和六位验证码，并先发送验证码' }, 400);
    }
    const username = body.username.trim();
    const nameError = validateName(username);
    if (nameError) return json({ ok: false, error: nameError }, 400);
    if (body.password.length < 8 || body.password.length > 64) return json({ ok: false, error: '密码需为 8-64 位' }, 400);
    const emailKey = await digest(email, this.env.SESSION_SECRET);
    const codeKey = `temp:code:${emailKey}`;
    const record = await this.ctx.storage.get(codeKey);
    if (!record?.delivered || record.expiresAt <= Date.now()) return json({ ok: false, error: '验证码已失效，请重新发送' }, 400);
    if (record.attempts >= 5) return json({ ok: false, error: '验证码尝试次数过多，请重新发送' }, 429);
    if (record.challenge !== body.challenge
      || record.digest !== await digest(JSON.stringify([email, body.challenge, body.code]), this.env.SESSION_SECRET)) {
      await this.tempPut(`code:${emailKey}`, { ...record, attempts: record.attempts + 1 });
      return json({ ok: false, error: '验证码不正确，请使用最新邮件中的验证码' }, 400);
    }
    // 不允许覆盖原 KV 预置账号；管理员不要在 KV 新增已注册的同名账号。
    if (await this.env.USERS.get(username) !== null) return json({ ok: false, error: '账号名已被使用，请换一个' }, 409);
    if (await this.ctx.storage.get(`user:${username}`) || await this.ctx.storage.get(`email:${email}`)) {
      return json({ ok: false, error: '账号名或邮箱已注册，请登录或换一个账号名' }, 409);
    }
    const salt = randomHex();
    const hash = await pbkdf2(body.password, salt);
    const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: username, exp: Date.now() + TTL_MS })));
    const token = await sign(payload, this.env.SESSION_SECRET);
    const created = await this.ctx.storage.transaction(async storage => {
      // 账号索引使用规范化邮箱，避免会话密钥轮换破坏唯一性。
      if (await storage.get(`user:${username}`) || await storage.get(`email:${email}`)) return false;
      await storage.put(`user:${username}`, { salt, hash, email, createdAt: Date.now() });
      await storage.put(`email:${email}`, username);
      await storage.delete(codeKey);
      return true;
    });
    return created ? json({ ok: true, username, token }) : json({ ok: false, error: '账号名或邮箱已注册，请登录或换一个账号名' }, 409);
  }

  async login(body) {
    if (typeof body.username !== 'string' || typeof body.password !== 'string') return json({ ok: false }, 400);
    const username = body.username.trim();
    if (validateName(username) || body.password.length < 6 || body.password.length > 64) return json({ ok: false }, 400);
    const account = await this.ctx.storage.get(`user:${username}`);
    if (!account) return json({ ok: false, error: '账号或密码不正确' }, 403);
    const key = `login:${username}`;
    const failures = await this.counter(key, 10 * MINUTE);
    if (failures.count >= 10) return json({ ok: false, error: '尝试次数过多，请 10 分钟后再试' }, 429);
    if (!/^[a-f0-9]{32}$/.test(account.salt) || !/^[a-f0-9]{64}$/.test(account.hash)) return unavailable();
    if (await pbkdf2(body.password, account.salt) !== account.hash) {
      await this.tempPut(key, { ...failures, count: failures.count + 1 });
      return json({ ok: false, error: '账号或密码不正确' }, 403);
    }
    await this.ctx.storage.delete(`temp:${key}`);
    const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: username, exp: Date.now() + TTL_MS })));
    return json({ ok: true, username, token: await sign(payload, this.env.SESSION_SECRET) });
  }

  alarm() {
    return this.serialized(async () => {
      const records = await this.ctx.storage.list({ prefix: 'temp:' });
      let remaining = false;
      for (const [key, value] of records) {
        if (value.expiresAt <= Date.now()) await this.ctx.storage.delete(key);
        else remaining = true;
      }
      if (remaining) await this.ctx.storage.setAlarm(Date.now() + HOUR);
    });
  }
}
