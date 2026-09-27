import { useMemo, useRef, useState } from "react";
import { gpaScale, scoreToGpa } from "@/data/guide";
import { Calculator, Plus, Trash2, GraduationCap, Upload, FileSpreadsheet } from "lucide-react";

interface Course {
  id: number;
  name: string;
  credit: number;
  score: number;
}

let nextId = 3;

// 等级制 → 百分制估算（取人大绩点区间中值附近）
const GRADE_MAP: Record<string, number> = {
  "优": 92, "优秀": 92, "A": 92,
  "良": 84, "良好": 84, "B": 84,
  "中": 74, "中等": 74, "C": 74,
  "及格": 62, "合格": 62, "D": 62,
  "不及格": 0, "不合格": 0, "F": 0,
};
// 不纳入 GPA 的成绩标记
const PASS_MARKS = new Set(["通过", "P", "p", "免修", "免考", "缺考"]);

export default function GpaCalculator() {
  const [courses, setCourses] = useState<Course[]>([
    { id: 1, name: "微积分", credit: 4, score: 88 },
    { id: 2, name: "大学英语", credit: 2, score: 92 },
  ]);

  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- 微人大成绩单 xlsx 导入 ----
  const importTranscript = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // 找表头行与关键列
      let headerIdx = -1, nameCol = -1, creditCol = -1, scoreCol = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const cells = (rows[i] ?? []).map((c) => String(c).trim());
        const ni = cells.findIndex((c) => c.includes("课程名称") || (c === "课程" && !cells.some((x) => x.includes("代码"))));
        const ci = cells.findIndex((c) => c === "学分" || c.includes("学分"));
        const si = cells.findIndex((c) => c.includes("成绩") || c.includes("分数") || c === "总评");
        if (ni >= 0 && ci >= 0) { headerIdx = i; nameCol = ni; creditCol = ci; scoreCol = si; break; }
      }
      if (headerIdx < 0) {
        setImportMsg({ ok: false, text: "没认出成绩单的表头，请确认是从教务系统导出的 xlsx 成绩单。" });
        return;
      }

      const imported: Course[] = [];
      let skipped = 0, gradeCount = 0;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i] ?? [];
        const name = String(r[nameCol] ?? "").trim();
        const credit = parseFloat(String(r[creditCol] ?? ""));
        if (!name || !Number.isFinite(credit) || credit <= 0) { if (name) skipped++; continue; }
        if (name.includes("平均") || name.includes("合计") || name.includes("总计")) continue;

        let score: number | null = null;
        const raw = String(r[scoreCol] ?? "").trim();
        if (scoreCol >= 0) {
          const num = parseFloat(raw);
          if (Number.isFinite(num) && raw !== "") score = Math.min(100, Math.max(0, num));
          else if (raw in GRADE_MAP) { score = GRADE_MAP[raw]; gradeCount++; }
          else if (PASS_MARKS.has(raw)) { skipped++; continue; }
        }
        if (score === null) { skipped++; continue; }
        imported.push({ id: nextId++, name, credit, score });
      }

      if (!imported.length) {
        setImportMsg({ ok: false, text: "表格里没找到有效课程行，检查下是不是成绩单文件～" });
        return;
      }
      setCourses(imported);
      setImportMsg({
        ok: true,
        text: `导入成功：识别 ${imported.length} 门课` +
          (gradeCount ? `（其中 ${gradeCount} 门等级制按区间中值估算）` : "") +
          (skipped ? `，跳过 ${skipped} 行` : "") +
          "。",
      });
    } catch {
      setImportMsg({ ok: false, text: "文件解析失败，请换 xlsx 格式再试。" });
    }
  };

  const gpa = useMemo(() => {
    const totalCredit = courses.reduce((s, c) => s + (c.credit || 0), 0);
    if (!totalCredit) return 0;
    const total = courses.reduce((s, c) => s + scoreToGpa(c.score) * (c.credit || 0), 0);
    return total / totalCredit;
  }, [courses]);

  const verdict =
    gpa >= 3.7 ? { text: "绩点战神，稳住别浪 🚀", color: "text-emerald-600" }
    : gpa >= 3.4 ? { text: "相当优秀，继续保持", color: "text-emerald-600" }
    : gpa >= 3.2 ? { text: "中上水平，再加把劲", color: "text-amber-600" }
    : gpa >= 2.0 ? { text: "还来得及，下一门课开始发力", color: "text-amber-600" }
    : { text: "小鹿为你加油，先从 60 分保卫战开始", color: "text-primary" };

  const update = (id: number, patch: Partial<Course>) =>
    setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="paper-card relative overflow-hidden p-4 sm:p-6 md:p-8">
      <div className="tape" />
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-6 h-6 text-sky-600 shrink-0" />
        <h3 className="text-xl md:text-2xl font-black font-serif-sc">GPA 计算器</h3>
        <span className="sticker bg-sky-100 text-sky-800 ml-1">4 分制</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        4 分制实时换算。手动输入，或把成绩单文件丢进来一键算。
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importTranscript(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold px-4 py-2 transition flex items-center gap-1.5 shadow-md shadow-sky-600/20"
        >
          <Upload className="w-3.5 h-3.5" /> 导入成绩单
        </button>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> 从教务系统导出的成绩单（xlsx）一键算绩点
        </span>
        {importMsg && (
          <div className={`w-full text-xs rounded-lg px-3 py-2 border ${importMsg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
            {importMsg.text}
          </div>
        )}
        <p className="w-full text-[11px] text-muted-foreground/70">
          文件只在你的浏览器本地解析，不会上传到任何服务器。
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-2">
          {courses.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border bg-white p-2.5 sm:p-3">
              {/* 手机端：课程名独占一行；桌面端：自适应宽度 */}
              <input
                value={c.name}
                onChange={(e) => update(c.id, { name: e.target.value })}
                className="w-full sm:w-auto sm:flex-1 sm:min-w-0 rounded-lg border border-transparent bg-muted/60 px-3 py-2 text-base sm:text-sm font-medium outline-none focus:border-sky-400 focus:bg-white"
                placeholder="课程名"
              />
              <div className="flex flex-1 items-center gap-x-2 gap-y-1 min-w-0">
                <label className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">学分</span>
                  <input
                    type="number" inputMode="decimal" min={0.5} max={12} step={0.5}
                    value={c.credit}
                    onChange={(e) => update(c.id, { credit: Number(e.target.value) })}
                    className="w-14 sm:w-16 rounded-lg border border-transparent bg-muted/60 px-2 py-2 text-base sm:text-sm outline-none focus:border-sky-400 focus:bg-white"
                  />
                </label>
                <label className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground">成绩</span>
                  <input
                    type="number" inputMode="numeric" min={0} max={100}
                    value={c.score}
                    onChange={(e) => update(c.id, { score: Math.min(100, Math.max(0, Number(e.target.value))) })}
                    className="w-14 sm:w-16 rounded-lg border border-transparent bg-muted/60 px-2 py-2 text-base sm:text-sm outline-none focus:border-sky-400 focus:bg-white"
                  />
                </label>
                <span className="sticker bg-sky-100 text-sky-800 shrink-0 w-11 sm:w-12 justify-center">{scoreToGpa(c.score).toFixed(1)}</span>
                <button onClick={() => setCourses((cs) => cs.filter((x) => x.id !== c.id))}
                  className="p-1.5 text-muted-foreground hover:text-red-500 transition shrink-0 ml-auto" aria-label="删除课程">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => setCourses((cs) => [...cs, { id: nextId++, name: `课程 ${cs.length + 1}`, credit: 2, score: 85 }])}
            className="w-full rounded-xl border-2 border-dashed border-sky-300 text-sky-700 font-bold py-2.5 hover:bg-sky-50 transition flex items-center justify-center gap-1">
            <Plus className="w-4 h-4" /> 添加课程
          </button>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white p-5 sm:p-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 dotted-bg" />
            <GraduationCap className="w-8 h-8 mx-auto mb-1 opacity-80" />
            <div className="text-4xl sm:text-5xl font-black font-serif-sc animate-pop" key={gpa.toFixed(3)}>{gpa.toFixed(3)}</div>
            <div className="text-sky-200 text-xs sm:text-sm mt-1">平均学分绩点（{courses.reduce((s, c) => s + (c.credit || 0), 0)} 学分）</div>
            <div className={`mt-3 text-xs sm:text-sm font-bold bg-white/15 rounded-full px-3 py-1.5 inline-block ${verdict.color === "text-emerald-600" ? "text-emerald-200" : verdict.color === "text-amber-600" ? "text-amber-200" : "text-sky-100"}`}>
              {verdict.text}
            </div>
          </div>
          <div className="mt-3 rounded-xl border bg-white overflow-hidden">
            <div className="text-xs font-bold text-muted-foreground px-3 py-2 bg-muted/50">分数—绩点对照</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 text-[11px] px-3 pb-2 max-h-40 overflow-y-auto">
              {gpaScale.map((g) => (
                <div key={g.grade} className="py-1 border-b border-dashed flex justify-between gap-1">
                  <span className="font-bold">{g.grade}</span>
                  <span className="text-muted-foreground">{g.range}</span>
                  <span>{g.gpa.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
