import { useEffect, useState } from "react";
import { foodPool } from "@/data/guide";
import { fetchLeaderboard } from "@/lib/leaderboard";
import { UtensilsCrossed, RefreshCw, MapPin } from "lucide-react";
import type { LeaderEntry } from "@/components/BirdLeaderboard";

function pick<T>(arr: T[], exclude?: T): T {
  const pool = arr.filter((x) => x !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function FunZone() {
  // ---- 今天吃什么 ----
  const [campus, setCampus] = useState<"全部" | "中关村" | "通州">("全部");
  const [food, setFood] = useState<(typeof foodPool)[number] | null>(null);
  const [spinning, setSpinning] = useState(false);

  // ---- 像素小鸟前三榜 ----
  const [top3, setTop3] = useState<LeaderEntry[] | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const retry = () => { setTop3(null); setTopError(null); setRetryKey(key => key + 1); };
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetchLeaderboard(controller.signal)
      .then(list => { if (alive) setTop3(list.slice(0, 3)); })
      .catch(error => {
        if (alive) setTopError(controller.signal.aborted ? "加载超时，请重试。" : error instanceof Error ? error.message : "网络异常，请重试。");
      })
      .finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); };
  }, [retryKey]);

  const spinFood = () => {
    setSpinning(true);
    let count = 0;
    const timer = setInterval(() => {
      const pool = campus === "全部" ? foodPool : foodPool.filter((f) => f.campus === campus);
      setFood(pick(pool));
      count++;
      if (count > 12) {
        clearInterval(timer);
        setSpinning(false);
      }
    }, 80);
  };

  return (
    <div>
      {/* 今天吃什么 */}
      <div className="paper-card relative overflow-hidden p-6 md:p-8">
        <div className="tape" />
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="w-6 h-6 text-orange-600" />
          <h3 className="text-xl md:text-2xl font-black font-serif-sc">今天吃什么？</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">选择困难症的救星。小鹿替你做决定。</p>

        <div className="flex gap-2 mb-4">
          {(["全部", "中关村", "通州"] as const).map((c) => (
            <button key={c} onClick={() => setCampus(c)}
              className={`sticker transition ${campus === c ? "bg-orange-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {c}
            </button>
          ))}
        </div>

        <div className={`rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/60 p-6 text-center min-h-[150px] flex flex-col items-center justify-center ${food && !spinning ? "animate-pop" : ""}`}>
          {food ? (
            <>
              <div className={`text-5xl mb-2 ${spinning ? "animate-roulette" : "animate-float"}`}>{food.emoji}</div>
              <div className="text-xl font-black font-serif-sc text-orange-800">{food.name}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {food.campus} · {food.place}
              </div>
              <span className="sticker bg-orange-200 text-orange-900 mt-2">{food.tag}</span>
            </>
          ) : (
            <div className="text-muted-foreground">
              <div className="text-4xl mb-2">🍽️</div>
              点击下方按钮，让小鹿帮你抽一顿
            </div>
          )}
        </div>

        <button onClick={spinFood} disabled={spinning}
          className="mt-4 w-full rounded-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 transition flex items-center justify-center gap-2 disabled:opacity-70">
          <RefreshCw className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} />
          {spinning ? "小鹿疯狂奔跑中…" : food ? "不满意，再抽一次" : "开始抽餐"}
        </button>
      </div>

      {/* 像素小鸟入口 + 前三榜 */}
      <div className="paper-card mt-6 p-5 md:p-6">
        <a href="/game" className="flex items-center gap-4 group">
          <div className="text-4xl group-hover:animate-float">🐤</div>
          <div className="flex-1">
            <h3 className="text-lg font-black font-serif-sc">像素小鸟</h3>
            <p className="text-sm text-muted-foreground">课间摸鱼经典，登录后成绩上榜，和同学比一比谁飞得远。</p>
          </div>
          <div className="sticker bg-amber-100 text-amber-800 group-hover:bg-amber-200 transition shrink-0">去玩 →</div>
        </a>
        <div className="mt-4 pt-4 border-t border-dashed border-amber-900/15">
          <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1">
            🏆 当前前三
          </div>
          {topError ? (
            <div role="alert" className="text-xs text-red-700">
              {topError} <button onClick={retry} className="ml-2 underline">重试</button>
              {topError.includes("登录") && <a href="/login" className="ml-2 underline">去登录</a>}
            </div>
          ) : top3 === null ? (
            <div className="text-xs text-muted-foreground">加载中…</div>
          ) : top3.length === 0 ? (
            <div className="text-xs text-muted-foreground">还没有人上榜，去玩第一局，把名字留在最上面 👆</div>
          ) : (
            <ol className="flex flex-wrap gap-2">
              {top3.map((e, i) => (
                <li key={e.u} className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm">
                  <span>{["🥇", "🥈", "🥉"][i]}</span>
                  <span className="font-medium max-w-[8em] truncate">{e.u}</span>
                  <span className="font-mono font-bold text-amber-700">{e.s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
