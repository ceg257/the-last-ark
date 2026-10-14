import { describe, expect, it } from 'vitest';
import { fieldAcceleration } from '../src/physics/fields';
import { sweptOverlap } from '../src/physics/collision';
import { integrate, MAX_ACCELERATION, MAX_SPEED } from '../src/physics/world';
import { finite, length } from '../src/physics/vector';
import { firstLevel } from '../src/levels/first';
import { createGame, stepGame, togglePause } from '../src/game/game';
import { NO_CONTROLS } from '../src/game/types';

describe('field forces', () => {
  it('attracts toward P1 and repels away from P2', () => {
    expect(fieldAcceleration({ x: 10, y: 0 }, { x: 0, y: 0 }, firstLevel.players[0].field).x).toBeLessThan(0);
    expect(fieldAcceleration({ x: 10, y: 0 }, { x: 0, y: 0 }, firstLevel.players[1].field).x).toBeGreaterThan(0);
  });
  it('is finite at coincidence, capped nearby and zero outside its radius', () => {
    const f = firstLevel.players[0].field;
    for (const x of [0, 1e-10, 1e-7, 1, 100, f.radius, 10000]) {
      const a = fieldAcceleration({ x, y: 0 }, { x: 0, y: 0 }, f);
      expect(finite(a)).toBe(true); expect(length(a)).toBeLessThanOrEqual(f.maxAcceleration);
    }
    expect(fieldAcceleration({ x: f.radius, y: 0 }, { x: 0, y: 0 }, f)).toEqual({ x: 0, y: 0 });
  });
  it('adds both player fields as vectors and applies the same force to asteroids', () => {
    const g = createGame(firstLevel);
    const ship = g.bodies[0]; const asteroid = g.bodies[2];
    ship.position = { x: 400, y: 200 }; asteroid.position = { ...ship.position };
    ship.velocity = { x: 0, y: 0 }; asteroid.velocity = { x: 0, y: 0 };
    g.players[0].position = { x: 450, y: 200 }; g.players[1].position = { x: 400, y: 150 };
    g.players.forEach(p => { p.active = true; });
    integrate([ship, asteroid], g.players, 1 / 60);
    expect(ship.velocity.x).toBeGreaterThan(0); expect(ship.velocity.y).toBeGreaterThan(0);
    expect(asteroid.velocity).toEqual(ship.velocity);
  });
  it('planet gravity acts on all affected bodies but player positions never change', () => {
    const g = createGame(firstLevel); const players = structuredClone(g.players);
    const planet = g.bodies[1];
    for (const b of [g.bodies[0], g.bodies[2]]) { b.position = { x: 400, y: 340 }; b.velocity = { x: 0, y: 0 }; }
    integrate(g.bodies, g.players, 1 / 60);
    expect(g.bodies[0].velocity.x).toBeGreaterThan(0); expect(g.bodies[2].velocity.x).toBeGreaterThan(0);
    expect(g.players).toEqual(players); expect(planet.velocity).toEqual({ x: 0, y: 0 });
  });
  it('respects eligibility and low massive-body response', () => {
    const g = createGame(firstLevel);
    g.players[0].position = { x: 500, y: 340 }; g.players[0].active = true;
    const ship = g.bodies[0]; const planet = g.bodies[1];
    ship.position = { ...planet.position }; ship.velocity = { x: 0, y: 0 };
    // Measure response to the same player field independently; overlapping bodies
    // also attract one another once their half-step positions separate.
    integrate([ship], g.players, 1 / 60);
    integrate([planet], g.players, 1 / 60);
    expect(planet.velocity.x / ship.velocity.x).toBeCloseTo(planet.response);
    ship.affectedByFields = false; ship.velocity = { x: 0, y: 0 };
    integrate([ship], g.players, 1 / 60); expect(ship.velocity).toEqual({ x: 0, y: 0 });
  });
  it('is stable over 10 simulated minutes of overlapping moving fields', () => {
    const g = createGame(firstLevel);
    for (let i = 0; i < 36000; i++) {
      g.players.forEach((p, j) => { p.active = true; p.position = { x: 550 + 90 * Math.sin(i / 50 + j), y: 310 + 90 * Math.cos(i / 70 + j) }; });
      const before = g.bodies.map(b => ({ ...b.velocity }));
      integrate(g.bodies, g.players, 1 / 60);
      g.bodies.forEach((b, j) => {
        expect(finite(b.position) && finite(b.velocity)).toBe(true);
        expect(length(b.velocity)).toBeLessThanOrEqual(MAX_SPEED + 1e-8);
        expect(Math.hypot(b.velocity.x - before[j].x, b.velocity.y - before[j].y)).toBeLessThanOrEqual(MAX_ACCELERATION / 60 + 1e-8);
      });
    }
  });
  it('sweeps collision paths rather than missing a crossed obstacle', () => {
    expect(sweptOverlap({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, 3)).toBe(true);
    expect(sweptOverlap({ x: 0, y: 10 }, { x: 100, y: 10 }, { x: 50, y: 0 }, { x: 50, y: 0 }, 3)).toBe(false);
  });
  it('the first level fails without intervention', () => {
    const g = createGame(firstLevel); togglePause(g);
    for (let i = 0; i < 3600 && g.phase === 'running'; i++) stepGame(g, NO_CONTROLS);
    expect(g.phase).toBe('lost'); expect(g.message).toContain('撞击');
  });
});
