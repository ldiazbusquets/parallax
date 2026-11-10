import { describe, expect, it } from 'vitest';
import { squarify } from './treemap';

describe('squarified treemap', () => {
  const items = [60, 30, 20, 10, 5, 3, 2].map((w, i) => ({ id: i, w }));
  const out = squarify(items, (t) => t.w, { x: 0, y: 0, w: 600, h: 400 });
  it('places every item with area proportional to its weight', () => {
    expect(out).toHaveLength(7);
    const total = 130, area = 600 * 400;
    for (const p of out) expect(p.w * p.h).toBeCloseTo((p.item.w / total) * area, 3);
  });
  it('fills the box exactly, without overlaps', () => {
    expect(out.reduce((a, p) => a + p.w * p.h, 0)).toBeCloseTo(600 * 400, 3);
    for (const p of out) { expect(p.x).toBeGreaterThanOrEqual(-1e-6); expect(p.y).toBeGreaterThanOrEqual(-1e-6); expect(p.x + p.w).toBeLessThanOrEqual(600 + 1e-6); expect(p.y + p.h).toBeLessThanOrEqual(400 + 1e-6); }
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(ox > 1e-6 && oy > 1e-6).toBe(false);
    }
  });
  it('keeps boxes reasonably square and drops zero weights', () => {
    const big = out[0]; expect(Math.max(big.w / big.h, big.h / big.w)).toBeLessThan(3);
    expect(squarify([{ w: 0 }, { w: 5 }], (t) => t.w, { x: 0, y: 0, w: 10, h: 10 })).toHaveLength(1);
  });
});
