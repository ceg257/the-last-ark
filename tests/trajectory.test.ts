import { fieldControls } from './helpers';
import { describe, expect, it } from 'vitest';
import { createGame, FIXED_DT, stepGame, togglePause } from '../src/game/game';
import { predictTrajectory, PREDICTION_SECONDS } from '../src/game/trajectory';
import { firstLevel } from '../src/levels/first';
import { NO_CONTROLS } from '../src/game/types';

describe('real simulated trajectory', () => {
  it('leaves the complete live state untouched, including nested data and toggles', () => {
    const g = createGame(firstLevel); g.players[0].active = true;
    const before = structuredClone(g); const prediction = predictTrajectory(g);
    expect(prediction.points.length).toBeGreaterThan(5); expect(g).toEqual(before);
  });
  it('matches live integration at EVERY sampled point with moving celestial sources', () => {
    const g = createGame(firstLevel); g.players[0].active = true; g.bodies[1].velocity = { x: 4, y: -3 };
    const prediction = predictTrajectory(g, 4); togglePause(g);
    let sample = 1;
    for (let i = 0; i < 240; i++) {
      stepGame(g, fieldControls([true, false]));
      if ((i + 1) % 6 === 0) expect(g.bodies[0].position).toEqual(prediction.points[sample++]);
    }
    expect(sample).toBe(prediction.points.length);
  });
  it('interleaving forecasts with live stepping leaves the live run bit-identical', () => {
    // stepGame's previous-positions buffer is module-level and shared: a forecast and the
    // live game write the same body ids into it in turn (game.ts snapshotPrevious), and a
    // forecast is a clone -- same ids, different positions. If one run's snapshot leaked
    // into the other's, the swept collision test and every mission condition that reads
    // `previous` would be deciding on stale positions. This is the cheapest way to catch
    // that: run two identical games, and only drive one of them through 180 forecasts.
    const interleaved = createGame(firstLevel); interleaved.players[0].active = true; togglePause(interleaved);
    const alone = createGame(firstLevel); alone.players[0].active = true; togglePause(alone);
    for (let i = 0; i < 120; i++) {
      predictTrajectory(interleaved, 3);
      stepGame(interleaved, fieldControls([true, false]));
      stepGame(alone, fieldControls([true, false]));
    }
    expect(interleaved.bodies.map(b => b.position)).toEqual(alone.bodies.map(b => b.position));
    // distance is accumulated straight out of `previous` (game.ts: distance += length(sub(...))),
    // so it moves the moment a snapshot from the wrong run is used, even when nothing collides.
    expect(interleaved.distance).toEqual(alone.distance);
    expect(predictTrajectory(interleaved, 2).points).toEqual(predictTrajectory(alone, 2).points);
  });
  it('curves with attraction/repulsion and refreshes from new source locations', () => {
    const g = createGame(firstLevel);
    const off = predictTrajectory(g, 4);
    g.players[0].active = true;
    const on = predictTrajectory(g, 4);
    expect(on.points.at(-1)!.y).toBeLessThan(off.points.at(-1)!.y - 10);
    g.players[0].position = { x: 350, y: 500 };
    const moved = predictTrajectory(g, 4);
    expect(moved.points.at(-1)!.y).toBeGreaterThan(off.points.at(-1)!.y + 10);
    g.players[0].active = false; g.players[1].active = true; g.players[1].position = { x: 350, y: 500 };
    expect(predictTrajectory(g, 4).points.at(-1)!.y).toBeLessThan(off.points.at(-1)!.y);
  });
  it('stops exactly at the same collision as the real simulation', () => {
    const g = createGame(firstLevel); const prediction = predictTrajectory(g); togglePause(g);
    let steps = 0;
    while (g.phase === 'running' && steps < 720) { stepGame(g, NO_CONTROLS); steps++; }
    expect(prediction.outcome).toBe('failed'); expect(prediction.points.at(-1)).toEqual(g.bodies[0].position);
    expect(prediction.seconds).toBeCloseTo(steps * FIXED_DT);
  });
  it.each(['ready', 'paused'] as const)('predicts low-speed arrival from %s without advancing that state', phase => {
    const g = createGame(firstLevel); g.phase = phase; g.bodies = g.bodies.filter(b => b.kind === 'ship' || b.kind === 'station');
    g.bodies[0].position = { x: 900, y: 340 }; g.bodies[0].velocity = { x: 40, y: 0 };
    const prediction = predictTrajectory(g);
    expect(prediction.outcome).toBe('completed'); expect(prediction.seconds).toBeLessThan(1);
    expect(g.phase).toBe(phase); expect(g.elapsed).toBe(0);
  });
  it('bounds the forecast horizon and omits stale forecasts after game over', () => {
    const g = createGame(firstLevel); g.bodies = g.bodies.filter(b => b.kind === 'ship' || b.kind === 'station'); g.bodies[0].velocity = { x: 0, y: 0 };
    const prediction = predictTrajectory(g, 1000);
    expect(prediction.seconds).toBe(PREDICTION_SECONDS); expect(prediction.points.length).toBe(121);
    g.phase = 'failed'; expect(predictTrajectory(g).points).toEqual([]);
  });
});
