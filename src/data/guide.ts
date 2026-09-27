// ==================== 趣味数据 ====================

// 「今天吃什么」美食池
export interface Food {
  name: string;
  place: string;
  campus: "中关村" | "通州";
  tag: string;
  emoji: string;
}

export const foodPool: Food[] = [
  { name: "西区麻辣香锅", place: "西区食堂", campus: "中关村", tag: "西区之光", emoji: "🌶️" },
  { name: "北区瑞士卷", place: "北区食堂（晚间）", campus: "中关村", tag: "甜品治愈", emoji: "🍰" },
  { name: "热干面", place: "中区食堂二楼", campus: "中关村", tag: "面食爱好者", emoji: "🍜" },
  { name: "卷饼王", place: "东区食堂二楼", campus: "中关村", tag: "碳水快乐", emoji: "🌯" },
  { name: "韩式拌饭", place: "友谊餐厅", campus: "中关村", tag: "留学生公寓西侧", emoji: "🍚" },
  { name: "铁锅炖", place: "东区食堂二楼", campus: "中关村", tag: "东北风味", emoji: "🥘" },
  { name: "汇贤府鲁菜", place: "中区食堂三楼", campus: "中关村", tag: "文创菜", emoji: "🍲" },
  { name: "美食厨房撸串", place: "知行区/北区三楼", campus: "中关村", tag: "深夜食堂", emoji: "🍢" },
  { name: "肯德基", place: "明商地下一层", campus: "中关村", tag: "高校首家完整版", emoji: "🍗" },
  { name: "猫叔咖啡+自习", place: "明德书店内", campus: "中关村", tag: "边喝边学", emoji: "☕" },
  { name: "丰园称重自选", place: "丰园食堂一层", campus: "通州", tag: "经济实惠", emoji: "🍛" },
  { name: "面面俱到食作区", place: "丰园食堂二层", campus: "通州", tag: "六大风味", emoji: "🍝" },
  { name: "清真拉面", place: "禾园食堂一层", campus: "通州", tag: "民族风味", emoji: "🍜" },
  { name: "控卡轻食", place: "丰园食堂三层", campus: "通州", tag: "健身友好", emoji: "🥗" },
  { name: "校徽拉花咖啡", place: "西南学部楼 24h 咖啡站", campus: "通州", tag: "打卡必喝", emoji: "🦌" },
  { name: "陕公书屋咖啡", place: "学生事务中心一层", campus: "通州", tag: "图书文创", emoji: "📖" },
  { name: "先锋早餐半价", place: "学生大伙食堂（7:15 前）", campus: "通州", tag: "早起福利", emoji: "🌅" },
  { name: "蜜雪冰城", place: "远见公寓 G 层", campus: "通州", tag: "奶茶自由", emoji: "🧋" },
  { name: "嘉园二楼自选", place: "嘉园食堂二层", campus: "通州", tag: "新食堂解锁", emoji: "🍱" },
  { name: "禾园二楼新花样", place: "禾园食堂二层", campus: "通州", tag: "上新了", emoji: "🆕" },
  { name: "禾园二楼麦当劳", place: "禾园食堂二层", campus: "通州", tag: "金拱门", emoji: "🍟" },
  { name: "禾园一楼小咖", place: "禾园食堂一层", campus: "通州", tag: "咖啡续命", emoji: "☕" },
  { name: "禾园一楼自选", place: "禾园食堂一层", campus: "通州", tag: "自选菜品", emoji: "🍚" },
  { name: "瑞幸咖啡", place: "京东群学楼一层", campus: "通州", tag: "生椰拿铁", emoji: "🦌" },
  { name: "丰园三楼麻辣烫", place: "丰园食堂三层", campus: "通州", tag: "热辣滚烫", emoji: "🍲" },
];

// GPA 换算表（4 分制）
export const gpaScale: { grade: string; range: string; gpa: number }[] = [
  { grade: "A", range: "90—100", gpa: 4.0 },
  { grade: "A-", range: "86—89", gpa: 3.7 },
  { grade: "B+", range: "83—85", gpa: 3.3 },
  { grade: "B", range: "80—82", gpa: 3.0 },
  { grade: "B-", range: "76—79", gpa: 2.7 },
  { grade: "C+", range: "73—75", gpa: 2.3 },
  { grade: "C", range: "70—72", gpa: 2.0 },
  { grade: "C-", range: "66—69", gpa: 1.7 },
  { grade: "D+", range: "63—65", gpa: 1.3 },
  { grade: "D / P", range: "60—62", gpa: 1.0 },
  { grade: "F", range: "< 60", gpa: 0.0 },
];

export function scoreToGpa(score: number): number {
  if (score >= 90) return 4.0;
  if (score >= 86) return 3.7;
  if (score >= 83) return 3.3;
  if (score >= 80) return 3.0;
  if (score >= 76) return 2.7;
  if (score >= 73) return 2.3;
  if (score >= 70) return 2.0;
  if (score >= 66) return 1.7;
  if (score >= 63) return 1.3;
  if (score >= 60) return 1.0;
  return 0.0;
}
