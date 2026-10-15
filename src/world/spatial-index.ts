import type { Rect } from './geometry';
import { intersects } from './geometry';

interface Entry<T> { value: T; bounds: Rect }
/** Multi-resolution hash. Large gravity fields use larger cells, not millions of
 * small cells. Point queries visit one bucket per occupied scale; no global pair scan.
 * Only loaded entities belong here. Ordering is retained for deterministic sums.
 */
export class SpatialIndex<T> {
  private layers = new Map<number, Map<string, Entry<T>[]>>();
  private order = new Map<T, number>();
  insert(value: T, bounds: Rect): void {
    if (!Object.values(bounds).every(Number.isFinite)) return;
    let size = 256;
    while (size < Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)) size *= 2;
    let grid = this.layers.get(size);
    if (!grid) { grid = new Map(); this.layers.set(size, grid); }
    this.order.set(value, this.order.size);
    const entry = { value, bounds };
    const x0 = Math.floor(bounds.minX / size), y0 = Math.floor(bounds.minY / size);
    for (let dx = 0; dx <= Math.floor(bounds.maxX / size) - x0; dx++) {
      for (let dy = 0; dy <= Math.floor(bounds.maxY / size) - y0; dy++) {
        const x = x0 + dx, y = y0 + dy;
        const key = `${x},${y}`; const bucket = grid.get(key) ?? []; bucket.push(entry); grid.set(key, bucket);
      }
    }
  }
  query(bounds: Rect): T[] {
    const result = new Set<T>();
    if (!Object.values(bounds).every(Number.isFinite)) return [];
    for (const [size, grid] of this.layers) {
      const cells = (Math.floor(bounds.maxX / size) - Math.floor(bounds.minX / size) + 1) * (Math.floor(bounds.maxY / size) - Math.floor(bounds.minY / size) + 1);
      // Huge overview queries scan occupied buckets rather than empty universe cells.
      if (cells > grid.size) {
        for (const bucket of grid.values()) for (const entry of bucket) if (intersects(entry.bounds, bounds)) result.add(entry.value);
        continue;
      }
      const x0 = Math.floor(bounds.minX / size), y0 = Math.floor(bounds.minY / size);
      for (let dx = 0; dx <= Math.floor(bounds.maxX / size) - x0; dx++) {
        for (let dy = 0; dy <= Math.floor(bounds.maxY / size) - y0; dy++) {
          const x = x0 + dx, y = y0 + dy;
          for (const entry of grid.get(`${x},${y}`) ?? []) if (intersects(entry.bounds, bounds)) result.add(entry.value);
        }
      }
    }
    return [...result].sort((a, b) => this.order.get(a)! - this.order.get(b)!);
  }
}
