import type { Level } from '../game/types';
export const firstLevel: Level = {
  id: 'first-crossing', name: '原试玩 / 绕行与制动', width: 1100, height: 620,
  scoring: { threeStarsSeconds: 18, twoStarsSeconds: 30 },
  seed: 2401, mapBounds: { minX: -600, minY: -600, maxX: 1800, maxY: 1200 },
  port: { position: { x: 970, y: 340 }, radius: 68, maxEntrySpeed: 48 },
  mission: {
    objectives: [{ id: 'dock', label: '绕开中央天体，低速进入空间港（≤ 48）', target: { entityId: 'station' },
      condition: { type: 'near_entity', entityId: 'ark', targetId: 'station', maxSpeed: 48, fullContainment: true } }],
    triggers: [{ id: 'after-bypass', condition: { type: 'enter_region', entityId: 'ark',
      region: { shape: 'rect', bounds: { minX: 640, maxX: 700, minY: 100, maxY: 280 } } },
      actions: [{ type: 'checkpoint', id: 'after-bypass' }, { type: 'hint', text: '已保存绕行检查点 · 制动至 ≤ 48 入港；R 恢复' }] }],
  },
  players: [
    { id: 'attractor', kind: 'player', position: { x: 350, y: 160 }, radius: 13, speed: 260, acceleration: 650, braking: 260 / 0.6, velocity: { x: 0, y: 0 }, active: false,
      field: { radius: 280, strength: 1_200_000, softening: 70, maxAcceleration: 100, polarity: 1 } },
    { id: 'repulsor', kind: 'player', position: { x: 900, y: 340 }, radius: 13, speed: 260, acceleration: 650, braking: 260 / 0.6, velocity: { x: 0, y: 0 }, active: false,
      field: { radius: 320, strength: 1_500_000, softening: 75, maxAcceleration: 110, polarity: -1 } },
  ],
  bodies: [
    { id: 'ark', kind: 'ship', position: { x: 120, y: 340 }, velocity: { x: 65, y: 0 }, radius: 8, affectedByFields: true, response: 1 },
    { id: 'planet', kind: 'planet', position: { x: 550, y: 340 }, velocity: { x: 0, y: 0 }, radius: 65, density: 1, affectedByFields: true, response: 0.18, stabilization: { halfLife: 1.2 } },
    { id: 'asteroid', kind: 'asteroid', position: { x: 750, y: 490 }, velocity: { x: -3, y: -1 }, radius: 18, affectedByFields: true, response: 1, stabilization: { halfLife: 1 } },
    { id: 'station', kind: 'station', position: { x: 970, y: 340 }, velocity: { x: 0, y: 0 }, radius: 68, affectedByFields: false, response: 0 },
  ],
};
