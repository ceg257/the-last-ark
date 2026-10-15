import { createGame } from '../src/game/game';
import { predictTrajectory } from '../src/game/trajectory';
import { syntheticLevel } from './world';

/**
 * CPU profile 用的一份固定工作量。
 *
 * 成本曲线实测（bench/physics.perf.ts）：预测一次 ≈ 1.39 ms 固定 + 1.92 ms/天体，
 * 即每步固定 1.94 µs、每体 2.67 µs。所以 n=4 时 85% 的时间在逐体开销上，
 * 而每体每步只有 0.1 次引力求值 —— 说明时间花在逐体的记账上，不在算术上。
 *
 * 因此这里分别压 n=4 与 n=32 两档，用 `node profile.mjs small|mid` 选：
 * 两档混在一起剖析会被 n=32 那档的绝对耗时盖过去，看不出 n=4 的形状。
 *
 * 走 `bench/profile.ts` + esbuild 打成单文件在**主** node 进程里跑：
 * vitest 的 worker（forks / threads）都抓不到 profile，见 profile.ts 顶部说明。
 */
export function runWorkload(scene = 'small'): void {
  if (scene === 'mid') {
    const mid = createGame(syntheticLevel(28, 220)); // n=32
    for (let i = 0; i < 10; i++) predictTrajectory(mid);
    for (let i = 0; i < 100; i++) predictTrajectory(mid); // ≈62 ms/次 → 6.2 s
    return;
  }
  const small = createGame(syntheticLevel(0, 220)); // n=4，当前关卡
  for (let i = 0; i < 50; i++) predictTrajectory(small);
  for (let i = 0; i < 400; i++) predictTrajectory(small); // ≈9.2 ms/次 → 3.7 s
}
