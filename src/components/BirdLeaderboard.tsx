import { useLeaderboard } from "@/hooks/use-leaderboard";
import { Trophy } from "lucide-react";

export type { LeaderEntry } from "@/lib/leaderboard";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function BirdLeaderboard({ refreshKey, me }: { refreshKey: number; me: string | null }) {
  const { list, error, retry } = useLeaderboard(refreshKey);

  return (
    <div className="paper-card p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="w-5 h-5 text-amber-600" />
        <h3 className="text-lg font-black font-serif-sc">排行榜</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">按用户名记录最好成绩，前 50 名上榜。</p>

      {error ? (
        <div role="alert" className="text-sm text-red-700 py-4 text-center">
          <p>{error}</p>
          <button onClick={retry} className="mt-2 rounded-full border px-4 py-1">重试</button>
          {error.includes("登录") && <a href="/login" className="ml-3 underline">去登录</a>}
        </div>
      ) : list === null ? (
        <div className="text-sm text-muted-foreground py-6 text-center">加载中…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          还没有人上榜，来玩第一局吧 🐤
        </div>
      ) : (
        <ol className="space-y-1.5">
          {list.map((e, i) => (
            <li
              key={e.u}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                me === e.u
                  ? "bg-primary/10 border border-primary/40 font-bold text-primary"
                  : "bg-muted/50"
              }`}
            >
              <span className="w-6 text-center shrink-0">{MEDALS[i] ?? <span className="text-muted-foreground">{i + 1}</span>}</span>
              <span className="truncate flex-1">{e.u}</span>
              <span className="font-mono font-bold text-base">{e.s}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
