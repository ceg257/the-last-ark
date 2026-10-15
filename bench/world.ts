import { createBody } from '../src/game/entities';
import { firstLevel } from '../src/levels/first';
import type { Body, Level } from '../src/game/types';

/**
 * 合成世界：以原试玩关为底，追加 n 个天体铺在一个大范围圆盘上。
 *
 * 关键：**必须剥离一切会让预测提前终止的东西**，否则 predictTrajectory 会在头几步
 * 因碰撞/入港而 break（trajectory.ts:42-46），测到的就不是完整视界。
 * 因此：所有天体 collision:'none'，且不配置 mission / port。
 */
export function syntheticLevel(extra: number, spread = 20): Level {
  const bodies: Body[] = structuredClone(firstLevel.bodies)
    .map(body => ({ ...body, collision: 'none' as const }));
  for (let i = 0; i < extra; i++) {
    const angle = i * 2.399963229728653; // golden angle，避免聚簇
    // spread=20 是"拥挤局部"（设计文档警告的最坏情况）；spread=220 约等于
    // 每 2048 区块 ~25 个天体铺开的真实区块世界。
    const distance = 300 + spread * Math.sqrt(i);
    const isPlanet = i % 9 === 0;
    bodies.push(createBody({
      id: `synth-${i}`,
      kind: isPlanet ? 'planet' : 'asteroid',
      position: { x: 550 + Math.cos(angle) * distance, y: 340 + Math.sin(angle) * distance },
      velocity: { x: Math.cos(angle * 1.7) * 3, y: Math.sin(angle * 1.7) * 3 },
      radius: isPlanet ? 30 + (i % 40) : 8 + (i % 14),
      collision: 'none',
    }));
  }
  return { ...firstLevel, bodies, mission: undefined, port: undefined };
}
