import { useEffect, useRef, useState } from "react";
import { Eye, Users } from "lucide-react";

// Vercount（不蒜子升级版）统计脚本：全站 pv / uv
let scriptLoaded = false;
function loadCounterScript() {
  if (scriptLoaded || typeof document === "undefined") return;
  scriptLoaded = true;
  const s = document.createElement("script");
  s.src = "https://cn.vercount.one/js";
  s.async = true;
  document.body.appendChild(s);
}

// 读取不蒜子兼容 span 的最终数值
function readCounter(id: string): number | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const n = parseInt(el.textContent?.replace(/[^\d]/g, "") ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// 数字滚动动画
function useCountUp(target: number | null, duration = 1200): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (target === null) return;
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return target === null ? 0 : value;
}

function BigNumber({ icon, label, value, loading }: {
  icon: React.ReactNode; label: string; value: number; loading: boolean;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground mb-1.5">
        {icon} {label}
      </div>
      <div className="text-3xl md:text-4xl font-black font-serif-sc tabular-nums tracking-tight">
        {loading ? <span className="text-muted-foreground/50">…</span> : value.toLocaleString()}
      </div>
    </div>
  );
}

export default function StatsBand() {
  const [pv, setPv] = useState<number | null>(null);
  const [uv, setUv] = useState<number | null>(null);

  useEffect(() => {
    loadCounterScript();
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      const p = readCounter("busuanzi_value_site_pv");
      const u = readCounter("busuanzi_value_site_uv");
      if (p !== null) setPv(p);
      if (u !== null) setUv(u);
      if ((p !== null && u !== null) || tries > 40) window.clearInterval(timer);
    }, 500);
    return () => { window.clearInterval(timer); };
  }, []);

  const pvAnim = useCountUp(pv);
  const uvAnim = useCountUp(uv);

  return (
    <div className="rounded-2xl border bg-card px-6 py-6 md:py-7">
      {/* 隐藏的兼容容器：vercount 脚本会往里填数 */}
      <span id="busuanzi_container_site_pv" className="hidden">
        <span id="busuanzi_value_site_pv" />
      </span>
      <span id="busuanzi_container_site_uv" className="hidden">
        <span id="busuanzi_value_site_uv" />
      </span>

      <div className="grid grid-cols-3 gap-6 items-center divide-x divide-dashed divide-border">
        <BigNumber icon={<Eye className="w-3.5 h-3.5" />} label="总访问量" value={pvAnim} loading={pv === null} />
        <BigNumber icon={<Users className="w-3.5 h-3.5" />} label="总访客数" value={uvAnim} loading={uv === null} />
        <BigNumber icon={<span className="text-sm">🎲</span>} label="摸鱼工具" value={3} loading={false} />
      </div>
      <p className="text-center text-[11px] text-muted-foreground/70 mt-4">
        访问量由 Vercount 公益计数服务统计 · 仅记录次数，不收集个人信息
      </p>
    </div>
  );
}
