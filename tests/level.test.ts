import { describe, expect, it } from 'vitest';
import { createGame, pause, stepGame, togglePause } from '../src/game/game';
import type { Controls, GameState } from '../src/game/types';
import { NO_CONTROLS } from '../src/game/types';
import { firstLevel } from '../src/levels/first';
import type { Vec2 } from '../src/physics/vector';
import { length } from '../src/physics/vector';

/** Uses only real eight-direction movement while paused: never teleports players or edits the ship. */
function positionPlayer(game: GameState, index: 0 | 1, target: Vec2): void {
  const tolerance = game.players[index].speed / 60 / 2 + 0.01;
  for (let i = 0; i < 600; i++) {
    const delta = { x: target.x - game.players[index].position.x, y: target.y - game.players[index].position.y };
    if (Math.abs(delta.x) <= tolerance && Math.abs(delta.y) <= tolerance) return;
    const controls: Controls = structuredClone(NO_CONTROLS);
    controls.movement[index] = { x: Math.abs(delta.x) <= tolerance ? 0 : Math.sign(delta.x), y: Math.abs(delta.y) <= tolerance ? 0 : Math.sign(delta.y) };
    stepGame(game, controls);
  }
  throw new Error('Player could not reach staging position');
}

describe('playable first level, using only player movement and fields', () => {
  for (const launchX of [410, 420, 430]) for (const turnX of [640, 650, 660]) for (const aimY of [380, 390, 400]) {
    it(`wins with launch cutoff x=${launchX}, turn x=${turnX}, tangent y=${aimY}`, () => {
      const g = createGame(firstLevel);
      positionPlayer(g, 1, { x: 1050, y: 420 });
      togglePause(g);
      let stage = 0; let p1Steps = 0; let p2Steps = 0;
      for (let i = 0; i < 1800 && g.phase === 'running'; i++) {
        const ship = g.bodies[0];
        if (stage === 0 && ship.position.x >= launchX) stage = 1;
        if (stage === 1 && ship.position.x >= turnX) {
          pause(g); const before = structuredClone(g.bodies);
          positionPlayer(g, 0, { x: 690, y: 320 });
          expect(g.bodies).toEqual(before);
          togglePause(g); stage = 2;
        }
        const projectedY = ship.position.y + (g.level.port.position.x - ship.position.x) * ship.velocity.y / ship.velocity.x;
        if (stage === 2 && projectedY >= aimY) stage = 3;
        const fields: [boolean, boolean] = [stage === 0 || stage === 2, stage === 3];
        if (fields[0]) p1Steps++; if (fields[1]) p2Steps++;
        stepGame(g, { ...NO_CONTROLS, fields });
      }
      expect(g.phase).toBe('won');
      expect(length(g.bodies[0].velocity)).toBeLessThanOrEqual(48);
      expect(g.elapsed).toBeLessThan(30);
      expect(p1Steps).toBeGreaterThan(0); expect(p2Steps).toBeGreaterThan(0);
    });
  }
});
