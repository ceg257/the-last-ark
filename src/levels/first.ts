import type { Level } from '../game/types';
export const firstLevel: Level = {
  id: 'first-crossing', name: '01 / 绕行与制动', width: 1100, height: 620,
  port: { position: { x: 970, y: 340 }, radius: 68, maxEntrySpeed: 48 },
  players: [
    { id: 'attractor', position: { x: 350, y: 160 }, radius: 13, speed: 260, active: false,
      field: { radius: 280, strength: 1_200_000, softening: 70, maxAcceleration: 100, polarity: 1 } },
    { id: 'repulsor', position: { x: 900, y: 340 }, radius: 13, speed: 260, active: false,
      field: { radius: 320, strength: 1_500_000, softening: 75, maxAcceleration: 110, polarity: -1 } },
  ],
  bodies: [
    { id: 'ark', kind: 'ship', position: { x: 120, y: 340 }, velocity: { x: 65, y: 0 }, radius: 8, affectedByFields: true, response: 1 },
    { id: 'planet', kind: 'planet', position: { x: 550, y: 340 }, velocity: { x: 0, y: 0 }, radius: 65, density: 1, affectedByFields: true, response: 0.0001 },
    { id: 'asteroid', kind: 'asteroid', position: { x: 750, y: 490 }, velocity: { x: -3, y: -1 }, radius: 18, affectedByFields: true, response: 1 },
  ],
};
