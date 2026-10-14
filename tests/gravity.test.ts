import { describe, expect, it } from 'vitest';
import type { Body } from '../src/game/types';
import { bodyGravity, gravitationalMass } from '../src/physics/gravity';
import { fieldAcceleration } from '../src/physics/fields';
import { integrate, MAX_SPEED } from '../src/physics/world';
import { length, sub } from '../src/physics/vector';
import { firstLevel } from '../src/levels/first';

function flyby(offset: number, planetSpeed: number) {
  const planet: Body = { id: 'source', kind: 'planet', radius: 50, density: 4, response: 0, affectedByFields: true, position: { x: 0, y: 0 }, velocity: { x: planetSpeed, y: 0 } };
  const ship: Body = { id: 'probe', kind: 'ship', radius: 8, response: 1, affectedByFields: true, position: { x: offset, y: -400 }, velocity: { x: planetSpeed, y: 80 } };
  const initialSpeed = length(ship.velocity);
  let clearance = Infinity;
  for (let i = 0; i < 60 * 16; i++) {
    integrate([planet, ship], [], 1 / 60);
    clearance = Math.min(clearance, length(sub(ship.position, planet.position)) - ship.radius - planet.radius);
  }
  return { initialSpeed, finalSpeed: length(ship.velocity), relativeSpeed: length(sub(ship.velocity, planet.velocity)), ship, planet, clearance };
}

describe('volume-derived gravity and orbital integration', () => {
  it.each([0, 1] as const)('player %s visibly moves the large planet, more slowly than a small body', playerIndex => {
    const planet = structuredClone(firstLevel.bodies[1]);
    const small = { ...structuredClone(planet), id: 'small', kind: 'asteroid' as const, radius: 18, response: 1 };
    const players = structuredClone(firstLevel.players);
    players[playerIndex].active = true;
    players[playerIndex].position = { x: playerIndex === 0 ? 450 : 650, y: 340 };
    for (let i = 0; i < 120; i++) {
      integrate([planet], players, 1 / 60);
      integrate([small], players, 1 / 60);
    }
    const displacement = 550 - planet.position.x;
    expect(displacement).toBeGreaterThan(15);
    expect(displacement).toBeLessThan(550 - small.position.x);
    expect(planet.velocity.x).toBeLessThan(-10);
    const before = planet.position.x;
    players[playerIndex].active = false;
    integrate([planet], players, 1 / 60);
    expect(planet.position.x).toBeLessThan(before); // retains inertia when the field is off
  });
  it('gives eight times the mass/source strength for twice the radius at equal density', () => {
    const a = { ...structuredClone(firstLevel.bodies[2]), radius: 20 };
    const b = { ...structuredClone(a), radius: 40 };
    expect(gravitationalMass(b) / gravitationalMass(a)).toBeCloseTo(8);
    expect(bodyGravity(b).strength / bodyGravity(a).strength).toBeCloseTo(8);
    expect(length(fieldAcceleration({ x: 60, y: 0 }, { x: 0, y: 0 }, bodyGravity(b))))
      .toBeGreaterThan(length(fieldAcceleration({ x: 60, y: 0 }, { x: 0, y: 0 }, bodyGravity(a))));
  });
  it('asteroids attract the ship without any manually assigned gravity field', () => {
    const ship = structuredClone(firstLevel.bodies[0]); const rock = structuredClone(firstLevel.bodies[2]);
    rock.position = { x: 0, y: 0 }; rock.velocity = { x: 0, y: 0 };
    ship.position = { x: 50, y: 0 }; ship.velocity = { x: 0, y: 0 };
    integrate([ship, rock], [], 1 / 60);
    expect(ship.velocity.x).toBeLessThan(0); expect(rock.velocity.x).toBeGreaterThan(0);
    expect(ship.velocity.y).toBe(0);
  });
  it('lets density increase black-hole gravity independently of visible size', () => {
    const rock = structuredClone(firstLevel.bodies[2]);
    const hole = { ...rock, kind: 'blackHole' as const };
    expect(bodyGravity(hole).strength / bodyGravity(rock).strength).toBeCloseTo(40);
    expect(bodyGravity({ ...rock, density: 2 }).strength / bodyGravity(rock).strength).toBeCloseTo(2);
  });
  it('enforces a global speed cap and optional lower body cap during drift and kicks', () => {
    for (const maxSpeed of [undefined, 80, 400, 0]) {
      const ship = { ...structuredClone(firstLevel.bodies[0]), maxSpeed, velocity: { x: 1000, y: 1000 } };
      const before = { ...ship.position };
      const cap = Math.min(MAX_SPEED, maxSpeed ?? MAX_SPEED);
      const players = structuredClone(firstLevel.players); players.forEach(p => { p.active = true; p.position = { x: 150, y: 350 }; });
      integrate([ship], players, 1 / 60);
      expect(length(ship.velocity)).toBeLessThanOrEqual(cap + 1e-9);
      expect(length(sub(ship.position, before))).toBeLessThanOrEqual(cap / 60 + 1e-9);
    }
  });
  it('is independent of the body array order', () => {
    const a = structuredClone(firstLevel.bodies); const b = structuredClone(a).reverse();
    for (let i = 0; i < 120; i++) { integrate(a, firstLevel.players, 1 / 60); integrate(b, firstLevel.players, 1 / 60); }
    for (const body of a) {
      const other = b.find(candidate => candidate.id === body.id)!;
      expect(other.position.x).toBeCloseTo(body.position.x, 10);
      expect(other.position.y).toBeCloseTo(body.position.y, 10);
      expect(other.velocity.x).toBeCloseTo(body.velocity.x, 10);
      expect(other.velocity.y).toBeCloseTo(body.velocity.y, 10);
    }
  });
  it('bends a static-planet flyby without creating net far-field speed', () => {
    const result = flyby(-100, 0);
    expect(result.clearance).toBeGreaterThan(0);
    expect(result.ship.velocity.x).toBeGreaterThan(5);
    expect(result.finalSpeed).toBeCloseTo(result.initialSpeed, 3);
  });
  it('gains or loses world-frame speed on opposite sides of a moving planet', () => {
    const behind = flyby(-100, 25); const ahead = flyby(100, 25);
    expect(behind.clearance).toBeGreaterThan(0); expect(ahead.clearance).toBeGreaterThan(0);
    expect(behind.finalSpeed).toBeGreaterThan(behind.initialSpeed + 1);
    expect(ahead.finalSpeed).toBeLessThan(ahead.initialSpeed - 1);
    expect(behind.relativeSpeed).toBeCloseTo(80, 3); expect(ahead.relativeSpeed).toBeCloseTo(80, 3);
    expect(behind.planet.position.x).toBeCloseTo(400);
  });
});
