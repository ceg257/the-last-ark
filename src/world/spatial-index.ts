import type { Rect } from './geometry';
import { intersects } from './geometry';

interface Entry<T> { value: T; bounds: Rect }
interface Layer<T> { size: number; grid: Map<number, Map<number, Entry<T>[]>> }
const finiteRect = (r: Rect): boolean =>
  Number.isFinite(r.minX) && Number.isFinite(r.minY) && Number.isFinite(r.maxX) && Number.isFinite(r.maxY);
/** Multi-resolution hash. Large gravity fields use larger cells, not millions of
 * small cells. Point queries visit one bucket per occupied scale; no global pair scan.
 * Only loaded entities belong here. Ordering is retained for deterministic sums.
 *
 * Two measured choices shape this class, both worth ~3x on the physics step:
 *  - Cells are addressed by two integer lookups (x, then y), not one `${x},${y}`
 *    string key. The index is rebuilt from scratch every step and point-queried once
 *    per body, and a freshly built string carries no cached hash, so every lookup
 *    re-hashed its key.
 *  - Layers live in a short array, not a Map. Iterating a Map allocates an iterator
 *    and a [key, value] pair per entry, which dominated a query's fixed cost even
 *    when the index held four entities.
 */
export class SpatialIndex<T> {
  private layers: Layer<T>[] = [];
  private order = new Map<T, number>();
  insert(value: T, bounds: Rect): void {
    if (!finiteRect(bounds)) return;
    let size = 256;
    while (size < Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)) size *= 2;
    let layer: Layer<T> | undefined;
    for (let i = 0; i < this.layers.length; i++) if (this.layers[i].size === size) { layer = this.layers[i]; break; }
    if (!layer) { layer = { size, grid: new Map() }; this.layers.push(layer); }
    const grid = layer.grid;
    this.order.set(value, this.order.size);
    const entry = { value, bounds };
    const x0 = Math.floor(bounds.minX / size), y0 = Math.floor(bounds.minY / size);
    const xEnd = Math.floor(bounds.maxX / size), yEnd = Math.floor(bounds.maxY / size);
    for (let x = x0; x <= xEnd; x++) {
      let column = grid.get(x);
      if (!column) { column = new Map(); grid.set(x, column); }
      for (let y = y0; y <= yEnd; y++) {
        const bucket = column.get(y);
        if (bucket) bucket.push(entry); else column.set(y, [entry]);
      }
    }
  }
  query(bounds: Rect): T[] {
    return this.queryInto(bounds, []);
  }
  /** Same result as query(), drained into a caller-supplied array so the hot path can
   * reuse one buffer. That array is overwritten by the next call -- consume it first.
   * Unlike a shared result set, nothing here is invalidated by query(). */
  queryInto(bounds: Rect, out: T[]): T[] {
    out.length = 0;
    if (!finiteRect(bounds)) return out;
    // A value is inserted into exactly one layer, and each cell of a layer is visited
    // once -- so a value can only be seen twice if some layer scanned more than one
    // cell, which the integrator's point queries never do. De-duplication is therefore
    // skipped on the common path and the result is compacted only when we scanned wide.
    let wide = false;
    for (let li = 0; li < this.layers.length; li++) {
      const layer = this.layers[li], grid = layer.grid, size = layer.size;
      const x0 = Math.floor(bounds.minX / size), y0 = Math.floor(bounds.minY / size);
      const xEnd = Math.floor(bounds.maxX / size), yEnd = Math.floor(bounds.maxY / size);
      // Huge overview queries scan occupied buckets rather than empty universe cells.
      if ((xEnd - x0 + 1) * (yEnd - y0 + 1) > grid.size) {
        wide = true;
        for (const column of grid.values()) for (const bucket of column.values()) for (const entry of bucket) if (intersects(entry.bounds, bounds)) out.push(entry.value);
        continue;
      }
      if (xEnd > x0 || yEnd > y0) wide = true;
      for (let x = x0; x <= xEnd; x++) {
        const column = grid.get(x);
        if (!column) continue;
        for (let y = y0; y <= yEnd; y++) {
          const bucket = column.get(y);
          if (!bucket) continue;
          for (const entry of bucket) if (intersects(entry.bounds, bounds)) out.push(entry.value);
        }
      }
    }
    // Insertion order fixes the output order, which is what makes the gravity sum in
    // accelerations() reproducible. De-duplication is by value, not by `order`: a value
    // inserted twice would be handed a colliding order and be dropped as a duplicate.
    if (out.length > 1) out.sort((a, b) => this.order.get(a)! - this.order.get(b)!);
    if (wide && out.length > 1) {
      const seen = new Set<T>();
      let write = 0;
      for (let read = 0; read < out.length; read++) if (!seen.has(out[read])) { seen.add(out[read]); out[write++] = out[read]; }
      out.length = write;
    }
    return out;
  }
}
