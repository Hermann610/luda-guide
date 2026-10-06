import { useEffect, useRef, useState } from "react";
import Hero from "@/components/Hero";
import FunZone from "@/components/FunZone";
import GpaCalculator from "@/components/GpaCalculator";
import StatsBand from "@/components/StatsBand";
import DisclaimerModal from "@/components/DisclaimerModal";
import Deer from "@/components/Deer";
import { Github, LogIn, LogOut, User } from "lucide-react";

function NavAuth() {
  const [user, setUser] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return null;
  if (user === null) {
    return (
      <a href="/login" className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full hover:bg-muted transition flex items-center gap-1 whitespace-nowrap">
        <LogIn className="w-3.5 h-3.5" /> 登录 / 注册
      </a>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-primary/10 text-primary flex items-center gap-1 font-medium whitespace-nowrap">
        <User className="w-3.5 h-3.5 shrink-0" /> <span className="max-w-[6em] truncate">{user}</span>
      </span>
      <a href="/logout" className="px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-full hover:bg-muted transition text-muted-foreground" title="退出登录">
        <LogOut className="w-3.5 h-3.5" />
      </a>
    </span>
  );
}

export default function Home() {
  const funRef = useRef<HTMLDivElement>(null);
  const scrollToFun = () => funRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen">
      <DisclaimerModal />
      {/* 顶部导航 */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/85 border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
          <a href="#top" className="flex items-center gap-1.5 sm:gap-2 font-black font-serif-sc text-base sm:text-lg whitespace-nowrap">
            <Deer className="w-6 h-6 sm:w-8 sm:h-8" />
            鹿大<span className="text-primary">摸鱼站</span>
          </a>
          <span className="hidden sm:inline-flex"><span className="sticker bg-amber-100 text-amber-800">V1.0</span></span>
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1 text-[13px] sm:text-sm font-medium">
            <a href="#fun" className="hidden sm:inline-flex px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full hover:bg-muted transition whitespace-nowrap">🎲 玩一玩</a>
            <a href="/game" className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full hover:bg-muted transition whitespace-nowrap">🐤 小游戏</a>
            <NavAuth />
          </div>
        </div>
      </nav>

      <main id="top" className="max-w-6xl mx-auto px-4 py-8 space-y-14">
        <Hero onStart={scrollToFun} />
        <StatsBand />

        <section id="fun" className="scroll-mt-20 space-y-6">
          <div>
            <div className="text-xs font-bold text-primary tracking-widest">摸鱼 · 工具箱</div>
            <h2 className="text-3xl font-black font-serif-sc">玩一玩</h2>
          </div>
          <div ref={funRef} className="scroll-mt-20 space-y-6">
            <FunZone />
            <GpaCalculator />
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t bg-card/60">
        <div className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-2 font-black font-serif-sc text-lg mb-2">
              <Deer className="w-9 h-9" /> 鹿大摸鱼站
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              网页版由 <b className="text-foreground">Hermann</b> 制作。<br />
              联系方式：<a className="text-primary hover:underline" href="mailto:2304179201@qq.com">2304179201@qq.com</a>
              ，欢迎补充指正。<br />
              本网页免费共享，禁止商业用途；信息来源于网络，如有侵权请联系作者删除。
            </p>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Github className="w-3.5 h-3.5" /> 纯前端静态页面 · 数据本地加载
            </p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="font-bold text-amber-800 mb-1">⚠️ 声明</div>
            <p className="text-xs text-amber-900/80 leading-relaxed">
              本站为个人制作的非官方页面，与任何学校及机构无关；
              站内工具与内容仅供娱乐和参考，不构成任何建议，重要事项请以官方渠道信息为准。
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
