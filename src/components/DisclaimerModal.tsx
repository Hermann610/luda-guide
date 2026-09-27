import { useEffect, useRef, useState } from "react";
import { ShieldAlert, FileText } from "lucide-react";

const STORAGE_KEY = "luda_disclaimer_v1";
const COUNTDOWN = 8;

const TERMS = [
  "本网站为个人制作的非官方页面，与任何学校、机构无关，不代表任何组织立场。",
  "站内工具与内容仅供娱乐和参考，不构成任何建议；涉及学业等重要事项，请以官方渠道信息为准。",
  "站内信息整理自网络，相关权利归原作者所有；如有侵权，请联系作者（2304179201@qq.com）删除。",
  "网站免费共享，禁止任何形式的商业使用；访问即表示你理解并接受以上条款。",
];

export default function DisclaimerModal() {
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN);
  const [agreed, setAgreed] = useState(false);
  const [declined, setDeclined] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      // ?skip_disclaimer=1 可跳过弹窗（如 iframe 嵌入场景），不写入本地记录
      if (new URLSearchParams(location.search).has("skip_disclaimer")) return;
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open || seconds <= 0) return;
    timerRef.current = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [open, seconds]);

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* 隐私模式下忽略 */ }
    setOpen(false);
  };

  if (!open) return null;

  // 不同意：只显示一张说明卡片，不再展示站点内容
  if (declined) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center paper-card p-8">
          <div className="text-4xl mb-3">🦌💨</div>
          <h2 className="font-black font-serif-sc text-xl mb-2">那就先不打扰啦</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            你选择了不同意使用协议，本站内容将不会展示。
            如果改变主意，清除浏览器中本站的本地数据后刷新即可重新阅读协议。
          </p>
        </div>
      </div>
    );
  }

  const canAgree = seconds <= 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-card border shadow-2xl overflow-hidden animate-pop">
        {/* 标题栏 */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-[#fdf8ef] to-[#fbe9d8]">
          <div className="flex items-center gap-2 font-black font-serif-sc text-lg">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            开始之前，先花 8 秒看看这份声明
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            为了你好也我好——这份协议保护的是每一位使用者的知情权。
          </p>
        </div>

        {/* 协议正文：固定高度可滚动 */}
        <div className="px-6 py-4">
          <div className="rounded-xl border bg-muted/40 p-4 h-52 overflow-y-auto space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <FileText className="w-3.5 h-3.5" /> 使用协议 · 请完整阅读（{COUNTDOWN} 秒后可同意）
            </div>
            {TERMS.map((t, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground/90">
                <b className="text-primary mr-1">{i + 1}.</b>{t}
              </p>
            ))}
          </div>

          {/* 倒计时提示 */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {canAgree ? "✅ 可以勾选了" : `⏳ 请再阅读 ${seconds} 秒`}
            </span>
            {seconds > 0 && (
              <span className="font-mono font-bold text-amber-600">{seconds}s</span>
            )}
          </div>
        </div>

        {/* 操作区 */}
        <div className="px-6 pb-6 space-y-3">
          <label className={`flex items-center gap-2 text-sm select-none ${canAgree ? "cursor-pointer text-foreground" : "cursor-not-allowed text-muted-foreground/60"}`}>
            <input
              type="checkbox"
              disabled={!canAgree}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 accent-[#8a1f2d]"
            />
            我已阅读并理解上述协议{canAgree ? "" : `（${seconds}s 后可勾选）`}
          </label>

          <div className="flex gap-3">
            <button
              onClick={() => setDeclined(true)}
              className="flex-1 rounded-full border-2 border-red-300 text-red-600 font-bold py-2.5 hover:bg-red-50 transition"
            >
              不同意
            </button>
            <button
              disabled={!agreed}
              onClick={accept}
              className="flex-1 rounded-full bg-primary text-primary-foreground font-bold py-2.5 transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
            >
              同意，进入指南
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            同意后本设备不再弹出 · 选择会保存在你的浏览器本地，不会上传
          </p>
        </div>
      </div>
    </div>
  );
}
