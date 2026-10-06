export function pickFood<T>(items: readonly T[], previous?: T | null, random = Math.random): T | null {
  const alternatives = items.filter(item => item !== previous);
  const pool = alternatives.length ? alternatives : items;
  if (!pool.length) return null;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}
