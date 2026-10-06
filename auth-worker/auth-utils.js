// luda-auth：旧预置账号与已验证校内邮箱账号共用的密码/会话工具。
// 会话：HMAC-SHA256 签名令牌（与 Pages 中间件共享 SESSION_SECRET）

export const TTL_MS = 7 * 24 * 3600 * 1000; // 7 天

// 基础合规校验：长度、字符集、简单敏感词
const NAME_RE = /^[\w一-鿿-]{2,20}$/;
const BLOCKED = ["admin", "administrator", "root", "system", "官方", "管理员", "鹿大生存指南", "鹿大摸鱼站", "hermann"];

export function validateName(name) {
  if (!NAME_RE.test(name)) return "名称需为 2-20 位，只能包含中文、字母、数字、下划线或连字符";
  const lower = name.toLowerCase();
  if (BLOCKED.some((b) => lower.includes(b.toLowerCase()))) return "这个名称不能使用，请换一个";
  return null;
}

export function b64url(buf) {  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function pbkdf2(password, saltHex) {
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

export async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

export async function sign(payloadB64, secret) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${b64url(sig)}`;
}

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function readSmallBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('Request too large'); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
