import { fieldControls } from './helpers';
import { describe, expect, it } from 'vitest';
import { createGame, pause, stepGame, togglePause } from '../src/game/game';
import { NO_CONTROLS } from '../src/game/types';
import { firstLevel } from '../src/levels/first';
import { length } from '../src/physics/vector';
import { predictTrajectory } from '../src/game/trajectory';

import { positionPlayer } from './helpers';

describe('playable first level, using only player movement and fields', () => {
  it.each([410, 420, 430])('can plan and verify a winning braking trajectory after launch cutoff x=%s', launchX => {
    const g = createGame(firstLevel); positionPlayer(g, 1, { x: 1050, y: 420 }); togglePause(g);
    while (g.bodies[0].position.x < launchX && g.phase === 'running') stepGame(g, fieldControls([true, false]));
    while (g.bodies[0].position.x < 650 && g.phase === 'running') stepGame(g, NO_CONTROLS);
    expect(g.phase).toBe('running'); pause(g); positionPlayer(g, 0, { x: 690, y: 320 });
    let forecast = predictTrajectory(g);
    for (let trial = 0; trial < 30; trial++) {
      // Same operation as pausing, toggling P1 off/P2 on and inspecting the preview.
      stepGame(g, fieldControls([false, true]));
      forecast = predictTrajectory(g);
      if (forecast.outcome === 'completed') break;
      togglePause(g);
      for (let frame = 0; frame < 6; frame++) stepGame(g, fieldControls([true, false]));
      pause(g);
    }
    expect(forecast.outcome).toBe('completed'); togglePause(g);
    for (let i = 0; i < 720 && g.phase === 'running'; i++) stepGame(g, fieldControls([false, true]));
    expect(g.phase).toBe('completed'); expect(g.bodies[0].position).toEqual(forecast.points.at(-1));
  });
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
        const projectedY = ship.position.y + (g.level.port!.position.x - ship.position.x) * ship.velocity.y / ship.velocity.x;
        if (stage === 2 && projectedY >= aimY) stage = 3;
        const fields: [boolean, boolean] = [stage === 0 || stage === 2, stage === 3];
        if (fields[0]) p1Steps++; if (fields[1]) p2Steps++;
        stepGame(g, fieldControls(fields));
      }
      expect(g.phase).toBe('completed');
      expect(length(g.bodies[0].velocity)).toBeLessThanOrEqual(48);
      expect(g.elapsed).toBeLessThan(30);
      expect(p1Steps).toBeGreaterThan(0); expect(p2Steps).toBeGreaterThan(0);
    });
  }
});
