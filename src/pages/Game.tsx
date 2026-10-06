import { useEffect, useState } from "react";
import PixelBird from "@/components/PixelBird";
import BirdLeaderboard from "@/components/BirdLeaderboard";
import DisclaimerModal from "@/components/DisclaimerModal";
import Deer from "@/components/Deer";
import { ArrowLeft, LogIn, LogOut, User } from "lucide-react";

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

export default function Game() {
  const [user, setUser] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "info" | "err"; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const handleGameOver = (score: number) => {
    if (!user) {
      setFeedback({ kind: "info", text: `本局 ${score} 分。登录后即可参与排行榜 →` });
      return;
    }
    setFeedback({ kind: "info", text: `本局 ${score} 分，成绩提交中…` });
    fetch("/api/score/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setFeedback(
            d.isNewBest
              ? { kind: "ok", text: `★ 新纪录 ${d.best} 分！当前排名第 ${d.rank} 名` }
              : { kind: "info", text: `本局 ${score} 分，你的最好成绩仍是 ${d.best} 分（第 ${d.rank} 名）` }
          );
          setRefreshKey((k) => k + 1);
        } else {
          setFeedback({ kind: "err", text: d.error ?? "成绩提交失败" });
        }
      })
      .catch(() => setFeedback({ kind: "err", text: "网络异常，成绩未提交" }));
  };

  return (
    <div className="min-h-screen">
      <DisclaimerModal />
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/85 border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
          <a href="/" className="flex items-center gap-1.5 sm:gap-2 font-black font-serif-sc text-base sm:text-lg whitespace-nowrap">
            <Deer className="w-6 h-6 sm:w-8 sm:h-8" />
            鹿大<span className="text-primary">摸鱼站</span>
          </a>
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1 text-[13px] sm:text-sm font-medium">
            <a href="/" className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full hover:bg-muted transition flex items-center gap-1 whitespace-nowrap">
              <ArrowLeft className="w-3.5 h-3.5" /> 首页
            </a>
            <NavAuth />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="mb-4">
          <div className="text-xs font-bold text-primary tracking-widest">摸鱼 · 小游戏</div>
          <h1 className="text-2xl md:text-3xl font-black font-serif-sc">🐤 像素小鸟</h1>
          <p className="text-sm text-muted-foreground mt-1">点击屏幕 / 按空格起飞，穿过管道得分。登录后成绩自动上榜。</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div>
            <div className="rounded-2xl overflow-hidden border-2 border-amber-900/20 shadow-lg h-[58vh] min-h-[400px] md:h-[64vh]">
              <PixelBird onGameOver={handleGameOver} />
            </div>
            <div className="mt-3 min-h-[24px] text-sm">
              {feedback && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${
                    feedback.kind === "ok"
                      ? "bg-amber-100 text-amber-800"
                      : feedback.kind === "err"
                        ? "bg-red-100 text-red-700"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {feedback.text}
                  {feedback.kind === "info" && feedback.text.includes("登录后") && (
                    <a href="/login" className="text-primary font-bold hover:underline">去登录</a>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <BirdLeaderboard refreshKey={refreshKey} me={user} />
            <div className="paper-card p-5 text-xs text-muted-foreground leading-relaxed">
              <div className="font-bold text-foreground mb-1">玩法说明</div>
              点击屏幕或按空格键扇动翅膀；碰到管道或落地即结束。
              排行榜只记录每个用户的最好成绩，重复游玩自动刷新。
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
