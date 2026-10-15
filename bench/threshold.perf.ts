import { describe, it } from 'vitest';
import { createGame, FIXED_DT } from '../src/game/game';
import { integrate } from '../src/physics/world';
import { syntheticLevel } from './world';

/**
 * 定 `INDEX_THRESHOLD`（src/physics/world.ts 的直扫/索引分界）用的一次性测量。
 *
 * 单步 `integrate` 的耗时随 n 怎么长，直接反映两条路径的相对代价：
 * 直扫是 O(n²)，索引是 O(n·格子)。把 `INDEX_THRESHOLD` 分别设成 0（全直扫）、
 * 128、1e9（全索引）各跑一次，曲线交点就是分界。
 *
 * 只看这条曲线的形状，不要拿它当性能记录 —— 正式数字在 physics.perf.ts。
 */
const SIZES = [4, 8, 16, 32, 64, 96, 128, 192, 256];

function timeStep(extra: number): number {
  const live = createGame(syntheticLevel(extra, 220));
  const initial = live.bodies.map(body => ({ p: { ...body.position }, v: { ...body.velocity } }));
  const step = () => {
    live.bodies.forEach((body, i) => {
      body.position.x = initial[i].p.x; body.position.y = initial[i].p.y;
      body.velocity.x = initial[i].v.x; body.velocity.y = initial[i].v.y;
    });
    integrate(live.bodies, live.players, FIXED_DT);
  };
  for (let i = 0; i < 30; i++) step();
  const iterations = Math.max(30, Math.round(6000 / live.bodies.length));
  const started = performance.now();
  for (let i = 0; i < iterations; i++) step();
  return (performance.now() - started) / iterations;
}

describe('阈值扫描', () => {
  it('单步 integrate 随 n 的耗时', () => {
    for (const size of SIZES) {
      const extra = Math.max(0, size - 4);
      const ms = timeStep(extra);
      console.log(`[sweep] n=${size}：${(ms * 1000).toFixed(2)} µs/步，${(ms * 1e6 / size).toFixed(0)} ns/天体`);
    }
  });
});
