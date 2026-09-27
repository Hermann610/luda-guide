// luda-auth：鹿大摸鱼站开放注册/登录服务
// 存储：Cloudflare KV（用户名 → PBKDF2 密码哈希）
// 会话：HMAC-SHA256 签名令牌（与 Pages 中间件共享 SESSION_SECRET）

const TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

// 基础合规校验：长度、字符集、简单敏感词
const NAME_RE = /^[\w一-鿿-]{2,20}$/;
const BLOCKED = ["admin", "administrator", "root", "system", "官方", "管理员", "鹿大生存指南", "鹿大摸鱼站", "hermann"];

function validateName(name) {
  if (!NAME_RE.test(name)) return "名称需为 2-20 位，只能包含中文、字母、数字、下划线或连字符";
  const lower = name.toLowerCase();
  if (BLOCKED.some((b) => lower.includes(b.toLowerCase()))) return "这个名称不能使用，请换一个";
  return null;
}

function b64url(buf) {  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key, 256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

async function sign(payloadB64, secret) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${b64url(sig)}`;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

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
    if (!data?.u || !Number.isFinite(data.exp) || Date.now() > data.exp) return null;
    return String(data.u);
  } catch {
    return null;
  }
}

async function getLeaderboard(env) {
  const list = await env.USERS.get(LB_KEY, "json");
  return Array.isArray(list) ? list : [];
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true });
    }

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
      const score = Number(body.score);
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
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");

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
        // 不开放注册：账号不存在直接拒绝（账号由管理员在 KV 中预置）
        await env.USERS.put(lockKey, String(fails + 1), { expirationTtl: 600 });
        return json({ ok: false, error: "账号不存在，本站不开放注册" }, 403);
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
  },
};
