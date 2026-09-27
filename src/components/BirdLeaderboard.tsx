import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

export interface LeaderEntry {
  u: string;
  s: number;
  t: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function BirdLeaderboard({ refreshKey, me }: { refreshKey: number; me: string | null }) {
  const [list, setList] = useState<LeaderEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/score/leaderboard")
      .then((r) => r.json())
      .then((d) => { if (alive) setList(Array.isArray(d.leaderboard) ? d.leaderboard : []); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  return (
    <div className="paper-card p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="w-5 h-5 text-amber-600" />
        <h3 className="text-lg font-black font-serif-sc">排行榜</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">按用户名记录最好成绩，前 50 名上榜。</p>

      {list === null ? (
        <div className="text-sm text-muted-foreground py-6 text-center">加载中…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          还没有人上榜，来玩第一局吧 🐤
        </div>
      ) : (
        <ol className="space-y-1.5">
          {list.slice(0, 20).map((e, i) => (
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
