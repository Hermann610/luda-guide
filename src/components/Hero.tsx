import Deer from "./Deer";
import { MousePointerClick, Search, UtensilsCrossed, Calculator } from "lucide-react";

export default function Hero({ onStart }: { onStart: () => void }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-[#fdf8ef] via-[#fdf3e3] to-[#fbe9d8] px-6 py-12 md:px-12 md:py-16">
      {/* 背景装饰 */}
      <div className="absolute inset-0 dotted-bg opacity-40" />
      <div className="absolute -top-10 -right-10 text-[200px] leading-none opacity-[0.06] font-black select-none font-serif-sc">鹿</div>
      <div className="absolute top-6 right-8 md:right-24 text-4xl animate-float select-none">🍂</div>
      <div className="absolute bottom-8 left-1/3 text-3xl animate-wiggle select-none hidden md:block">🎲</div>

      <div className="relative flex flex-col md:flex-row items-center gap-8">
        <div className="flex-1 text-center md:text-left">
          <div className="sticker bg-primary/10 text-primary mb-4 animate-pop">
            🎲 摸鱼小工具 · 非官方 · 免费共享
          </div>
          <h1 className="text-4xl md:text-6xl font-black font-serif-sc leading-tight">
            鹿大<span className="text-primary">摸鱼站</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            网页版制作：<b className="text-foreground">Hermann</b> · <span className="sticker bg-amber-100 text-amber-800 !py-0.5">V1.0</span>
          </p>
          <p className="mt-3 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
            一个安静的摸鱼角落：不知道吃什么，让小鹿帮你抽；
            想算绩点，成绩单一键导入。别的没有，就是好玩。
          </p>

          <div className="mt-5 flex flex-wrap gap-3 justify-center md:justify-start">
            <button onClick={onStart}
              className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 transition flex items-center gap-2 shadow-lg shadow-primary/25 animate-wiggle">
              <Search className="w-4 h-4" /> 开始摸鱼
            </button>
          </div>
        </div>

        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-amber-200/50 blur-2xl scale-90" />
          <div className="relative animate-float">
            <Deer className="w-40 h-40 md:w-56 md:h-56" />
          </div>
          <div className="absolute -bottom-1 -left-3 sticker bg-amber-400 text-amber-950 shadow-md -rotate-3 animate-pop" style={{ animationDelay: "200ms" }}>
            实事求是
          </div>
        </div>
      </div>

      <div className="relative mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { icon: <UtensilsCrossed className="w-4 h-4" />, t: "今天吃什么", d: "选择困难症救星，小鹿替你抽" },
          { icon: <Calculator className="w-4 h-4" />, t: "GPA 一键算", d: "成绩单 xlsx 导入，秒出绩点" },
        ].map((f) => (
          <div key={f.t} className="rounded-2xl bg-white/70 backdrop-blur border p-3.5 hover:bg-white hover:shadow-md transition">
            <div className="flex items-center gap-2 font-bold text-sm text-primary">{f.icon} {f.t}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
              <MousePointerClick className="w-3 h-3 mt-0.5 shrink-0 opacity-50" /> {f.d}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
