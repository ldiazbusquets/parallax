// Squarified treemap (Bruls, Huizing & van Wijk, 2000): lays weighted items into a rectangle so every box's area
// is proportional to its weight and boxes stay as close to square as possible. Pure function, unit-tested.
export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed<T> extends Rect { item: T }

function worst(row: number[], side: number, scale: number): number {
  const s = row.reduce((a, b) => a + b, 0) * scale;
  if (!s) return Infinity;
  let max = 0, min = Infinity;
  for (const v of row) { const a = v * scale; if (a > max) max = a; if (a < min) min = a; }
  const s2 = s * s, side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/** Items must be sorted by weight, largest first; zero or negative weights are dropped. */
export function squarify<T>(items: T[], weight: (t: T) => number, box: Rect): Placed<T>[] {
  const list = items.filter((t) => weight(t) > 0);
  const total = list.reduce((a, t) => a + weight(t), 0);
  const out: Placed<T>[] = [];
  if (!list.length || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total; // area per unit of weight
  let r = { ...box }, i = 0;
  while (i < list.length) {
    const side = Math.min(r.w, r.h);
    const row: T[] = [list[i]];
    let j = i + 1;
    while (j < list.length) {
      const cur = row.map(weight), next = [...cur, weight(list[j])];
      if (worst(next, side, scale) > worst(cur, side, scale)) break;
      row.push(list[j]); j++;
    }
    // lay the row along the shorter side
    const area = row.reduce((a, t) => a + weight(t), 0) * scale;
    if (r.w >= r.h) {
      const w = Math.min(r.w, area / r.h);
      let y = r.y;
      for (const t of row) { const h = (weight(t) * scale) / w; out.push({ item: t, x: r.x, y, w, h }); y += h; }
      r = { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    } else {
      const h = Math.min(r.h, area / r.w);
      let x = r.x;
      for (const t of row) { const w = (weight(t) * scale) / h; out.push({ item: t, x, y: r.y, w, h }); x += w; }
      r = { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
    }
    i = j;
  }
  return out;
}
