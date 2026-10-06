import { TTL_MS, validateName, b64url, pbkdf2, hmacKey, sign, json } from './auth-utils.js';
import { registrationRequest } from './registration.js';
export { RegistrationStore } from './registration.js';

const LB_KEY = "leaderboard:v1";
const LB_MAX = 50;

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// 校验会话令牌（与 Pages 中间件同一套 HMAC），返回用户名或 null
async function verifySessionToken(token, secret) {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), new TextEncoder().encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (typeof data?.u !== "string" || !data.u.trim() || data.u.length > 20 || !Number.isFinite(data.exp) || Date.now() >= data.exp) return null;
    return data.u;
  } catch {
    return null;
  }
}

async function getLeaderboard(env) {
  const list = await env.USERS.get(LB_KEY, "json");
  if (list === null) return [];
  if (!Array.isArray(list) || list.some(entry => !entry || typeof entry.u !== "string"
    || !entry.u.trim() || !Number.isInteger(entry.s) || entry.s < 0 || entry.s > 99999
    || !Number.isFinite(entry.t) || entry.t < 0)) {
    throw new Error("Invalid leaderboard record");
  }
  return list;
}

async function handleRequest(req, env) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (!env.USERS || typeof env.SESSION_SECRET !== "string" || !env.SESSION_SECRET) {
      return json({ ok: false, error: "服务暂时不可用，请稍后再试" }, 503);
    }

    if (url.pathname.startsWith('/api/register/')) return registrationRequest(req, env);

    // 排行榜：返回前 50 名 {u, s, t}
    if (req.method === "GET" && url.pathname === "/api/score/leaderboard") {
      const list = await getLeaderboard(env);
      return json({ ok: true, leaderboard: list.slice(0, LB_MAX) });
    }

    // 提交成绩：需携带有效会话令牌，只记录个人最好成绩
    if (req.method === "POST" && url.pathname === "/api/score/submit") {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const username = await verifySessionToken(token, env.SESSION_SECRET);
      if (!username) return json({ ok: false, error: "请先登录" }, 401);

      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: "请求格式错误" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "请求格式错误" }, 400);
      const score = body.score;
      if (!Number.isInteger(score) || score < 0 || score > 99999) {
        return json({ ok: false, error: "成绩不合法" }, 400);
      }

      const list = await getLeaderboard(env);
      const idx = list.findIndex((e) => e.u === username);
      let isNewBest = false;
      if (idx === -1) {
        list.push({ u: username, s: score, t: Date.now() });
        isNewBest = true;
      } else if (score > list[idx].s) {
        list[idx].s = score;
        list[idx].t = Date.now();
        isNewBest = true;
      }
      list.sort((a, b) => b.s - a.s || a.t - b.t);
      const trimmed = list.slice(0, LB_MAX);
      await env.USERS.put(LB_KEY, JSON.stringify(trimmed));

      const rank = trimmed.findIndex((e) => e.u === username);
      return json({ ok: true, isNewBest, best: rank >= 0 ? trimmed[rank].s : 0, rank: rank >= 0 ? rank + 1 : null });
    }

    if (req.method === "POST" && url.pathname === "/api/auth") {
      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: "请求格式错误" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)
        || typeof body.username !== "string" || typeof body.password !== "string") {
        return json({ ok: false, error: "请求格式错误" }, 400);
      }
      const username = body.username.trim();
      const password = body.password;

      const nameErr = validateName(username);
      if (nameErr) return json({ ok: false, error: nameErr }, 400);
      if (password.length < 6 || password.length > 64) {
        return json({ ok: false, error: "密码需为 6-64 位" }, 400);
      }

      // 简单防爆破：同一用户名失败 10 次锁定 10 分钟
      const lockKey = `lock:${username}`;
      const fails = Number((await env.USERS.get(lockKey)) ?? 0);
      if (fails >= 10) {
        return json({ ok: false, error: "尝试次数过多，请 10 分钟后再试" }, 429);
      }

      const existing = await env.USERS.get(username, "json");
      if (!existing) {
        // 已验证邮箱的账号由 Durable Object 保存；关闭新注册不影响其登录。
        if (env.REGISTRATION) {
          const store = env.REGISTRATION.get(env.REGISTRATION.idFromName('ruc-registration-v1'));
          return store.fetch(new Request('https://registration.internal/login', {
            method: 'POST', body: JSON.stringify({ username, password }),
          }));
        }
        // 不开放注册：账号不存在直接拒绝（账号由管理员在 KV 中预置）
        await env.USERS.put(lockKey, String(fails + 1), { expirationTtl: 600 });
        return json({ ok: false, error: "账号不存在，本站不开放注册" }, 403);
      }
      if (typeof existing.salt !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(existing.salt)
        || typeof existing.hash !== "string" || !/^[0-9a-f]{64}$/i.test(existing.hash)) {
        return json({ ok: false, error: "服务暂时不可用，请稍后再试" }, 503);
      }
      const hash = await pbkdf2(password, existing.salt);
      if (hash !== existing.hash) {
        await env.USERS.put(lockKey, String(fails + 1), { expirationTtl: 600 });
        return json({ ok: false, error: "密码不正确" }, 403);
      }
      await env.USERS.delete(lockKey);

      const expiry = Date.now() + TTL_MS;
      const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: username, exp: expiry })).buffer);
      const token = await sign(payload, env.SESSION_SECRET);
      return json({ ok: true, username, token });
    }

    return json({ ok: false, error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    try { return await handleRequest(req, env); }
    catch { return json({ ok: false, error: "服务暂时不可用，请稍后再试" }, 503); }
  },
};
