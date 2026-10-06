// Cloudflare Pages Functions 中间件：邀请制访问 + 登录
// 账号校验调用 luda-auth Worker（用户存储在 KV），密码不经过本站代码

interface Env {
  AUTH_API: string;
  SESSION_SECRET: string;
}

const COOKIE_NAME = "luda_session";
const SESSION_TTL_S = 7 * 24 * 3600; // 7 天

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

// 解析会话令牌：payload.sig，payload = base64url(JSON {u, exp})
async function readSession(cookieHeader: string, secret: string): Promise<string | null> {
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  let token: string;
  try { token = decodeURIComponent(m[1]); } catch { return null; }
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

const PAGE = (body: string) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>鹿大摸鱼站 · 登录</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #fdf8ef; font-family: "Noto Serif SC", "Songti SC", serif; color: #3a2c22; padding: 24px; }
  .card { width: 100%; max-width: 360px; background: #fffdf8; border: 1px solid #ead9c2;
          border-radius: 20px; padding: 36px 28px; box-shadow: 0 12px 40px rgba(138,31,45,.08); }
  .deer { font-size: 44px; text-align: center; }
  h1 { font-size: 20px; text-align: center; margin: 10px 0 4px; }
  .sub { text-align: center; font-size: 12px; color: #a08d7a; margin-bottom: 8px; line-height: 1.7; }
  label { display: block; font-size: 13px; font-weight: bold; margin: 14px 0 6px; color: #6b5a49; }
  input { width: 100%; padding: 12px 14px; border: 1.5px solid #e3d3bd; border-radius: 12px;
          font-size: 15px; outline: none; background: #fff; transition: border-color .2s; }
  input:focus { border-color: #8a1f2d; }
  button { width: 100%; margin-top: 22px; padding: 13px; border: 0; border-radius: 999px;
           background: #8a1f2d; color: #fff; font-size: 15px; font-weight: bold; cursor: pointer; transition: background .2s; }
  button:hover { background: #701824; }
  .err { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: #fdecec;
         border: 1px solid #f5c6c6; color: #b02a2a; font-size: 13px; text-align: center; }
  .notice { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: #fdf3e3;
            border: 1.5px solid #e8b04b; color: #8a5a10; font-size: 13px; font-weight: bold;
            text-align: center; line-height: 1.7; }
  .tip { margin-top: 18px; text-align: center; font-size: 11px; color: #b3a18e; line-height: 1.7; }
  .guest { display: block; text-align: center; margin-top: 12px; font-size: 12px; color: #a08d7a; }
</style>
</head>
<body>${body}</body>
</html>`;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

const loginForm = (error?: string) => PAGE(`
  <div class="card">
  <div class="deer">🦌</div>
  <h1>登录</h1>
  <div class="sub">请使用内部账号登录</div>
  <div class="notice">🔒 本站不对外开放<br />只是一个练手项目，没什么可以看的了<br /><span style="font-size:12px; font-weight:normal;">账号问题请联系 2304179201@qq.com</span></div>
  <form method="POST" action="/login">
    <label for="u">账号</label>
    <input id="u" name="username" autocomplete="username" required autofocus maxlength="20" />
    <label for="p">密码</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required minlength="6" maxlength="64" />
    <button type="submit">进入</button>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  </form>
  <div class="tip">登录状态保留 7 天<br />没有账号？请联系站长</div>
  </div>
`);

const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

// Cover both the response headers and body read with the same timeout.
async function workerRequest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${env.AUTH_API}${path}`, { ...init, signal: controller.signal });
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, headers: response.headers,
    });
  } finally { clearTimeout(timer); }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const url = new URL(context.request.url);
  const cookie = context.request.headers.get("Cookie") ?? "";
  const user = await readSession(cookie, env.SESSION_SECRET);

  // 当前登录用户（前端导航栏用）
  if (url.pathname === "/api/me") {
    return new Response(JSON.stringify({ user }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // 退出登录
  if (url.pathname === "/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/",
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // 登录页
  if (url.pathname === "/login") {
    if (context.request.method === "POST") {
      let username = "", password = "";
      try {
        const form = await context.request.formData();
        username = String(form.get("username") ?? "").trim();
        password = String(form.get("password") ?? "");
      } catch { /* 按校验失败处理 */ }

      try {
        const resp = await workerRequest(env, "/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await resp.json() as { ok: boolean; token?: string; error?: string };
        if (resp.ok && data?.ok === true && typeof data.token === "string"
          && await readSession(`${COOKIE_NAME}=${encodeURIComponent(data.token)}`, env.SESSION_SECRET) === username) {
          return new Response(null, {
            status: 302,
            headers: {
              "Location": "/",
              "Set-Cookie": `${COOKIE_NAME}=${encodeURIComponent(data.token)}; Path=/; Max-Age=${SESSION_TTL_S}; HttpOnly; Secure; SameSite=Lax`,
              "Cache-Control": "no-store",
            },
          });
        }
        return new Response(loginForm(typeof data?.error === "string" ? data.error : "登录失败，请稍后再试"), {
          status: resp.status === 429 ? 429 : resp.status >= 500 || resp.ok ? 503 : 401, headers,
        });
      } catch {
        return new Response(loginForm("服务暂时不可用，请稍后再试"), { status: 503, headers });
      }
    }
    return new Response(loginForm(), { headers: { ...headers, "Cache-Control": "no-store" } });
  }

  // 未登录：接口返回 401，页面跳转登录（/api/me、/login、/logout 不受限）
  if (!user) {
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return new Response(null, { status: 302, headers: { "Location": "/login", "Cache-Control": "no-store" } });
  }

  // 小游戏排行榜
  if (url.pathname === "/api/score/leaderboard") {
    try {
      const resp = await workerRequest(env, "/api/score/leaderboard", {
        headers: { "Cache-Control": "no-store" },
      });
      return new Response(resp.body, {
        status: resp.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch {
      return new Response(JSON.stringify({ ok: false, leaderboard: [] }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  // 小游戏成绩提交（需登录，会话令牌原样转发给 Worker 校验）
  if (url.pathname === "/api/score/submit" && context.request.method === "POST") {
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    try {
      const token = m ? decodeURIComponent(m[1]) : "";
      const resp = await workerRequest(env, "/api/score/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: context.request.body,
        // @ts-expect-error duplex 为 undici 扩展，Cloudflare Pages Functions 运行时支持
        duplex: "half",
      });
      return new Response(resp.body, {
        status: resp.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "服务暂时不可用" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  // 已登录，放行
  return context.next();
};
