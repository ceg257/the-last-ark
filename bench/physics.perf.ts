import { describe, it } from 'vitest';
import { createGame, FIXED_DT } from '../src/game/game';
import { predictTrajectory, PREDICTION_SECONDS } from '../src/game/trajectory';
import { integrate } from '../src/physics/world';
import { syntheticLevel } from './world';

const STEPS_PER_FORECAST = Math.ceil(PREDICTION_SECONDS / FIXED_DT); // 720

function timeMs(label: string, iterations: number, warmup: number, run: () => void): number {
  for (let i = 0; i < warmup; i++) run();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) run();
  const perOp = (performance.now() - started) / iterations;
  console.log(`[time] ${label}：${perOp.toFixed(4)} ms/op（${iterations} 次，预热 ${warmup}）`);
  return perOp;
}

/** 拥挤局部（spread=20）vs 真实区块密度（spread=220），两种都要看。 */
const CASES: Array<{ extra: number; spread: number; label: string }> = [
  { extra: 0, spread: 20, label: 'n=4' },
  { extra: 50, spread: 20, label: 'n=54 · 拥挤' },
  { extra: 50, spread: 220, label: 'n=54 · 铺开' },
  { extra: 500, spread: 20, label: 'n=504 · 拥挤' },
  { extra: 500, spread: 220, label: 'n=504 · 铺开' },
];

describe('物理热路径', () => {
  for (const { extra, spread, label } of CASES) {
    // predictTrajectory 不修改真实状态（tests/trajectory.test.ts:11-12），可安全复用。
    const predictionGame = createGame(syntheticLevel(extra, spread));
    const predictIterations = extra >= 500 ? 3 : extra >= 50 ? 5 : 20;
    const predictPerCall = timeMs(`predictTrajectory · ${label}`, predictIterations, 1, () => { predictTrajectory(predictionGame); });

    // 单步积分：每次迭代前复位，否则天体会飞散开，成本会随时间衰减。
    const live = createGame(syntheticLevel(extra, spread));
    const initial = live.bodies.map(body => ({ position: { ...body.position }, velocity: { ...body.velocity } }));
    const reset = () => {
      live.bodies.forEach((body, i) => {
        body.position = { ...initial[i].position };
        body.velocity = { ...initial[i].velocity };
      });
    };
    const integratePerStep = timeMs(`integrate 单步 · ${label}`, 500, 50, () => { reset(); integrate(live.bodies, live.players, FIXED_DT); });

    // 决定性测量：每步真正做了多少次引力求值？这个数大说明是算法问题，
    // 这个数小而耗时大才说明是分配/开销问题。
    for (let i = 0; i < 100; i++) { reset(); integrate(live.bodies, live.players, FIXED_DT); }
    reset();
    const pairs = integrate(live.bodies, live.players, FIXED_DT).candidatePairs;
    console.log(`[pairs] ${label}：单步候选对 ${pairs}（平均每体 ${(pairs / live.bodies.length).toFixed(1)}），`
      + `每次求值 ${(integratePerStep * 1e6 / Math.max(pairs, 1)).toFixed(0)} ns`);

    // 一次预测 = 720 步。重力占其中多少？占比低则优化重力是旁枝。
    const perStepInForecast = predictPerCall / STEPS_PER_FORECAST;
    console.log(`[share] ${label}：重力占预测单步的 ${(integratePerStep / perStepInForecast * 100).toFixed(1)}%（`
      + `integrate ${integratePerStep.toFixed(4)} ms vs 预测单步 ${perStepInForecast.toFixed(4)} ms）`);
  }

  it('完成测量', () => { /* 测量结果通过 console.log 输出 */ });
});

/**
 * 成本曲线：把"固定开销"从两点外推变成实测。
 *
 * 预测一次 = 720 × stepGame = 720 ×（与 n 无关的固定开销 + n × 逐体开销）。
 * 截距大 ⇒ 该削的是预测步本身（每步都要跑的记账）；斜率大 ⇒ 该削的是逐体开销。
 * syntheticLevel 把天体铺在 300 + spread·√i 上，半径 ∝ √n ⇒ 面密度恒定，
 * 所以斜率里混不到"变拥挤"带来的额外候选对。
 */
const CURVE: Array<{ extra: number; label: string }> = [
  { extra: 0, label: 'n=4' },
  { extra: 4, label: 'n=8' },
  { extra: 12, label: 'n=16' },
  { extra: 28, label: 'n=32' },
  { extra: 60, label: 'n=64' },
];

describe('预测成本曲线 · 铺开', () => {
  it('拟合固定开销与逐体开销', () => {
    const points: Array<{ n: number; ms: number }> = [];
    // 下限：只剩飞船与空间港，预测仍要跑满 720 步 —— 全部是固定开销。
    const floor = createGame(syntheticLevel(0, 220));
    floor.bodies = floor.bodies.filter(b => b.kind === 'ship' || b.kind === 'station');
    points.push({ n: floor.bodies.length, ms: timeMs('predictTrajectory · n=2（下限）', 40, 5, () => { predictTrajectory(floor); }) });
    for (const { extra, label } of CURVE) {
      const game = createGame(syntheticLevel(extra, 220));
      points.push({ n: game.bodies.length, ms: timeMs(`predictTrajectory · ${label}`, 20, 3, () => { predictTrajectory(game); }) });
    }
    for (const { n, ms } of points) console.log(`[curve] n=${n}：${ms.toFixed(4)} ms（${(ms / n).toFixed(4)} ms/天体）`);
    // 拟合 a + b·n + c·n²，只取 n ≤ 32：world.ts 的 INDEX_THRESHOLD=48 以上换走空间
    // 索引，是另一个区间。为什么必须带二次项：直扫区间每个天体都要过一遍全部 n 个源做
    // AABB 测试，成本是 O(n²) 而不是 O(n)，所以线性拟合会给出**负截距**（已实测踩过两次，
    // 那不是"固定开销为负"，那是模型错了）。截距 a 才是真正的每步固定开销。
    const fit = points.filter(p => p.n <= 32);
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (const { n, ms } of fit) {
      const n2 = n * n;
      s0 += 1; s1 += n; s2 += n2; s3 += n2 * n; s4 += n2 * n2;
      t0 += ms; t1 += ms * n; t2 += ms * n2;
    }
    const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    const fixed = (t0 * (s2 * s4 - s3 * s3) - s1 * (t1 * s4 - s3 * t2) + s2 * (t1 * s3 - t2 * s2)) / det;
    const perBody = (s0 * (t1 * s4 - t2 * s3) - t0 * (s1 * s4 - s3 * s2) + s2 * (s1 * t2 - t1 * s2)) / det;
    const quad = (s0 * (s2 * t2 - t1 * s3) - s1 * (s1 * t2 - t1 * s2) + t0 * (s1 * s3 - s2 * s2)) / det;
    console.log(`[fit] 直扫区间（n≤32）最小二乘：预测一次 ≈ ${fixed.toFixed(3)} ms 固定 + ${perBody.toFixed(4)} ms/天体 + ${quad.toFixed(5)} ms/天体²`);
    console.log(`[fit] 折算到单步：固定 ${(fixed / STEPS_PER_FORECAST * 1000).toFixed(2)} µs/步，逐体 ${(perBody / STEPS_PER_FORECAST * 1000).toFixed(2)} µs/天体/步`);
  });
});
