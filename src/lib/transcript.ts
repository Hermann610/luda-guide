export interface ImportedCourse {
  name: string;
  credit: number;
  score: number;
}

// Keep the existing grade estimates; always disclose their use to the reader.
const GRADE_MAP: Record<string, number> = {
  优: 92, 优秀: 92, A: 92, 良: 84, 良好: 84, B: 84,
  中: 74, 中等: 74, C: 74, 及格: 62, 合格: 62, D: 62,
  不及格: 0, 不合格: 0, F: 0,
};
const PASS_MARKS = new Set(["通过", "P", "p", "免修", "免考", "缺考"]);
const cellText = (value: unknown) => String(value ?? "").trim();

function numberCell(value: unknown): number | null {
  const raw = cellText(value);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function parseTranscript(rows: unknown[][]) {
  let headerIdx = -1, nameCol = -1, creditCol = -1, scoreCol = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(cellText);
    const ni = cells.findIndex(c => c === "课程名称" || c === "课程");
    const ci = cells.findIndex(c => c === "学分");
    // Prefer the actual result over similarly named columns such as 成绩性质.
    const si = ["总评成绩", "总评", "成绩", "分数"].map(label => cells.indexOf(label)).find(col => col >= 0) ?? -1;
    if (ni >= 0 && ci >= 0 && si >= 0) {
      headerIdx = i; nameCol = ni; creditCol = ci; scoreCol = si; break;
    }
  }
  if (headerIdx < 0) throw new Error("没认出课程名称、学分和成绩列，请确认是教务系统导出的成绩单。");

  const courses: ImportedCourse[] = [];
  const issues: string[] = [];
  let gradeCount = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.every(cell => cellText(cell) === "")) continue;
    const name = cellText(row[nameCol]);
    if (/^(?:平均|合计|总计)/.test(name)) continue;
    const credit = numberCell(row[creditCol]);
    const raw = cellText(row[scoreCol]);
    let reason = "";
    let score = numberCell(raw);
    let estimated = false;
    if (!name) reason = "缺少课程名称";
    else if (credit === null || credit <= 0) reason = "学分须为正数";
    else if (PASS_MARKS.has(raw)) reason = `“${raw}”不纳入 GPA`;
    else {
      if (Object.hasOwn(GRADE_MAP, raw)) { score = GRADE_MAP[raw]; estimated = true; }
      if (score === null || score < 0 || score > 100) reason = "成绩须为 0–100 分或支持的等级";
    }
    if (reason) issues.push(`第 ${i + 1} 行${name ? `（${name}）` : ""}：${reason}`);
    else {
      courses.push({ name, credit: credit!, score: score! });
      if (estimated) gradeCount++;
    }
  }
  return { courses, issues, gradeCount };
}
