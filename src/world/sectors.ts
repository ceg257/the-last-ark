import type { Body } from '../game/types';
import type { Vec2 } from '../physics/vector';

export const SECTOR_SIZE = 2048;
export interface SectorKey { x: number; y: number }
export interface SectorData { key: SectorKey; seed: number; bodies: Body[] }
/** Future streaming adapter: save dynamic state before unload; load must restore
 * saved bodies before generating from the sector seed. Not wired to an infinite world.
 */
export interface SectorProvider {
  load(key: SectorKey, seed: number): Promise<SectorData>;
  save(data: SectorData): Promise<void>;
  unload(key: SectorKey): Promise<void>;
}
export const sectorAt = (p: Vec2): SectorKey => ({ x: Math.floor(p.x / SECTOR_SIZE), y: Math.floor(p.y / SECTOR_SIZE) });
export function sectorSeed(worldSeed: number, key: SectorKey): number {
  let n = (worldSeed ^ Math.imul(key.x, 0x45d9f3b) ^ Math.imul(key.y, 0x119de1f3)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d); n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let n = Math.imul(state ^ (state >>> 15), state | 1); n ^= n + Math.imul(n ^ (n >>> 7), n | 61); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; };
}
/** Demand follows ship AND players, never screen/zoom. Bounded load planning only. */
export function planSectors(foci: Vec2[], maxSectors = 27): SectorKey[] {
  const keys = new Map<string, SectorKey>();
  for (const radius of [0, 1]) for (const focus of foci) {
    const center = sectorAt(focus);
    for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) {
      const key = { x: center.x + x, y: center.y + y }; keys.set(`${key.x},${key.y}`, key);
    }
  }
  return [...keys.values()].slice(0, Math.max(0, maxSectors));
}
