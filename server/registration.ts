export async function readSmallBody(request: Request): Promise<string> {
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

export async function signedRegistrationHeaders(path: string, body: string, ip: string, secret: string): Promise<Headers> {
  const timestamp = String(Date.now());
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(JSON.stringify([path, timestamp, ip, body])));
  const proof = [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return new Headers({ 'Content-Type': 'application/json', 'X-Registration-Time': timestamp,
    'X-Registration-IP': ip, 'X-Registration-Proof': proof });
}

export const registrationForm = (enabled: boolean) => `
<div class="card">
  <div class="deer">🦌</div><h1>校内邮箱注册</h1>
  <div class="sub">验证人大邮箱，开启你的摸鱼时光</div>
  ${enabled ? '' : '<div class="notice">注册暂未开放，请稍后再来或联系站长。</div>'}
  <form id="register-form">
    <label for="email">人大校内邮箱</label>
    <input id="email" name="email" type="email" autocomplete="email" placeholder="你的邮箱@ruc.edu.cn" maxlength="254" required />
    <button type="button" id="send-code" ${enabled ? '' : 'disabled'} style="margin-top:12px">发送验证码</button>
    <label for="code">邮件中的六位验证码</label>
    <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required />
    <label for="username">账号名</label>
    <input id="username" name="username" autocomplete="username" minlength="2" maxlength="20" placeholder="2–20 位，注册后用于登录" required />
    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="64" required />
    <label for="confirm">确认密码</label>
    <input id="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="64" required />
    <p class="tip" style="text-align:left">验证码 10 分钟有效，每个邮箱只能注册一个账号。本站为个人非官方项目，仅验证邮箱使用权。邮箱将用于账号去重，验证码邮件由 Brevo 发送；请使用与学校账号不同的密码。</p>
    <button type="submit" id="submit-register" ${enabled ? '' : 'disabled'}>验证并注册</button>
    <div id="register-status" class="err" role="status" aria-live="polite" hidden></div>
  </form>
  <noscript><div class="notice">请启用 JavaScript 以接收验证码并完成注册。</div></noscript>
  <a class="guest" href="/login">已有账号？去登录</a>
</div>
<script>
(() => {
  const form = document.getElementById('register-form');
  const email = document.getElementById('email');
  const send = document.getElementById('send-code');
  const submit = document.getElementById('submit-register');
  const status = document.getElementById('register-status');
  let challenge = '', verifiedEmail = '', resendAt = 0, busy = false;
  const message = text => { status.hidden = false; status.textContent = text; };
  const updateSend = () => {
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    send.disabled = busy || seconds > 0 || ${!enabled};
    send.textContent = seconds ? seconds + ' 秒后可重发' : '发送验证码';
  };
  setInterval(updateSend, 1000);
  email.addEventListener('input', () => { challenge = ''; verifiedEmail = ''; document.getElementById('code').value = ''; });
  const call = async (path, body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.ok !== true) {
        if (data.retryAfter) resendAt = Date.now() + data.retryAfter * 1000;
        throw new Error(typeof data.error === 'string' ? data.error : '服务暂时不可用，请稍后再试');
      }
      return data;
    } finally { clearTimeout(timer); }
  };
  const failure = error => message(error.name === 'AbortError' ? '请求超时，请稍后重试' : error.message || '请求失败，请检查网络后重试');
  send.addEventListener('click', async () => {
    if (busy || send.disabled) return;
    if (!email.reportValidity()) return;
    const target = email.value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*@ruc\\.edu\\.cn$/.test(target)) return message('请使用本人 @ruc.edu.cn 校内邮箱');
    busy = true; updateSend(); submit.disabled = true; email.readOnly = true;
    // 发信结果不确定时保守等待，旧验证码不再用于本页提交。
    challenge = ''; verifiedEmail = ''; resendAt = Date.now() + 60000;
    try {
      const data = await call('/api/register/code', { email: target });
      challenge = data.challenge; verifiedEmail = target;
      resendAt = Date.now() + data.retryAfter * 1000;
      message('验证码已提交发送，请检查校内邮箱和垃圾邮件文件夹。');
    } catch (error) { failure(error); }
    finally { busy = false; email.readOnly = false; submit.disabled = ${!enabled}; updateSend(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || submit.disabled) return;
    if (!challenge || verifiedEmail !== email.value.trim().toLowerCase()) return message('请先向当前邮箱发送验证码');
    const password = document.getElementById('password').value;
    if (password !== document.getElementById('confirm').value) return message('两次密码输入不一致');
    busy = true; submit.disabled = true; updateSend();
    try {
      await call('/api/register/complete', { email: verifiedEmail, challenge,
        code: document.getElementById('code').value, username: document.getElementById('username').value.trim(), password });
      location.assign('/');
    } catch (error) { failure(error); }
    finally { busy = false; submit.disabled = ${!enabled}; updateSend(); }
  });
})();
</script>`;
