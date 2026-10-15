import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/camera/camera';
import { FixedClock } from '../src/game/clock';
import { createGame, stepGame, togglePause } from '../src/game/game';
import { NO_CONTROLS } from '../src/game/types';
import { firstLevel } from '../src/levels/first';
// Importing these is itself the node-safety assertion. vitest runs in the node environment
// (vitest.config.ts sets no `environment`), so any module-scope document / window /
// getContext would throw while loading them and take this whole file down. Same guard as
// movement-scoring.test.ts:12, which imports telemetry from canvas.ts for the same reason.
import { render, renderTitle } from '../src/render/canvas';
import { createStarfield, drawStarfield } from '../src/render/starfield';
import { createVisualState, parseQuality, QUALITY, TITLE_SEED, updateVisuals } from '../src/render/scene-visuals';
import { drawBody, rockShape } from '../src/render/celestial';
import { collectFields, drawFields, drawNetForceArrow } from '../src/render/field-visuals';
import type { FieldSource } from '../src/render/field-visuals';
import { createBody } from '../src/game/entities';
import { bodyGravity } from '../src/physics/gravity';
import { appendTrailSample, createTrail, shipTrailStyle } from '../src/render/trail';
import type { Trail } from '../src/render/trail';

describe('render state never writes the simulation', () => {
  it('leaves GameState bit-identical across a single rendered frame', () => {
    const game = createGame(firstLevel); togglePause(game);
    const visuals = createVisualState();
    for (let i = 0; i < 60; i++) { stepGame(game, NO_CONTROLS); updateVisuals(visuals, game, 0, 1 / 60); }
    const before = structuredClone(game);
    updateVisuals(visuals, game, 0, 1 / 60);
    expect(game).toEqual(before);
  });
  it('stays identical to an unrendered run when only one is driven through the render pass', () => {
    const tracked = createGame(firstLevel), control = createGame(firstLevel); togglePause(tracked); togglePause(control);
    const visuals = createVisualState('high');
    const camera = createCamera({ x: 0, y: 0 });
    for (let i = 0; i < 240; i++) {
      stepGame(tracked, NO_CONTROLS);
      // Flip the revision halfway through: the reset path must not reach the simulation either.
      updateVisuals(visuals, tracked, i < 120 ? 0 : 1, 1 / 60);
      stepGame(control, NO_CONTROLS);
    }
    expect(tracked).toEqual(control);
    // updateVisuals takes no Camera at all -- everything camera-dependent lives in the draw
    // functions. This line is the regression guard for anyone who later adds one.
    expect(camera).toEqual({ position: { x: 0, y: 0 }, zoom: 0.8, width: 1100, height: 620 });
  });
  it('advances its own clock but clamps a tab-focus-sized frame delta', () => {
    const visuals = createVisualState();
    updateVisuals(visuals, undefined, 0, 30);
    expect(visuals.time).toBe(0.1);
    updateVisuals(visuals, undefined, 0, 1 / 60);
    expect(visuals.time).toBeCloseTo(0.1 + 1 / 60, 10);
  });
});

describe('trails', () => {
  /** While count < capacity the ring is linear: xs[0] is the oldest vertex. */
  const vertices = (trail: Trail) => Array.from(trail.xs.slice(0, trail.count));
  const shipId = (game: ReturnType<typeof createGame>) => game.bodies.find(body => body.kind === 'ship')!.id;
  const tailLength = (trail: Trail) => {
    let total = 0;
    for (let i = 1; i < trail.count; i++) total += Math.hypot(trail.xs[i] - trail.xs[i - 1], trail.ys[i] - trail.ys[i - 1]);
    return total;
  };

  it('emits identical vertices on a straight path at 30 and 144 rendering FPS', () => {
    const style = shipTrailStyle(QUALITY.medium);
    // 1-unit and 0.25-unit steps both land on exactly representable positions, so the two
    // runs are comparable bit for bit. This is only true of a straight line -- on a curve
    // the chords at different sample rates differ, which is why the next test uses a
    // tolerance instead.
    const run = (step: number) => {
      const trail = createTrail(style.capacity);
      for (let x = 0; x <= 30; x += step) appendTrailSample(trail, x, 0, style);
      return trail;
    };
    const slow = run(1), fast = run(0.25);
    expect(slow.count).toBe(5);
    expect(vertices(slow)).toEqual(vertices(fast));
    // The real invariant: vertices sit exactly one `spacing` apart, which is what makes the
    // sampling distance-driven rather than frame-driven.
    for (let i = 1; i < slow.count; i++) expect(slow.xs[i] - slow.xs[i - 1]).toBeCloseTo(style.spacing, 9);
  });

  it('produces the same tail length at 30, 60 and 144 rendering FPS', () => {
    const run = (fps: number) => {
      const game = createGame(firstLevel); togglePause(game);
      const visuals = createVisualState('medium');
      const clock = new FixedClock();
      for (let i = 0; i < fps; i++) {
        clock.advance(1 / fps, () => stepGame(game, NO_CONTROLS));
        updateVisuals(visuals, game, 0, 1 / fps);
      }
      return visuals.trails.get(shipId(game))!.trail;
    };
    const runs = [30, 60, 144].map(run);
    const lengths = runs.map(tailLength);
    // The simulation advances 60 fixed steps a second whatever the frame rate
    // (tests/game.test.ts:82), so the path is identical; only where along it we sample
    // differs, and arc-length resampling absorbs that to within one vertex.
    // Guard against a vacuous pass: an empty or near-empty tail would satisfy every
    // comparison below no matter how badly the sampling was broken.
    for (const trail of runs) expect(trail.count).toBeGreaterThan(8);
    for (const length of lengths) expect(Math.abs(length - lengths[0])).toBeLessThan(8);
    for (const trail of runs) expect(Math.abs(trail.count - runs[0].count)).toBeLessThanOrEqual(1);
  });

  it('freezes the tail while paused and clears it on a checkpoint restore', () => {
    const game = createGame(firstLevel); togglePause(game);
    const visuals = createVisualState();
    for (let i = 0; i < 120; i++) { stepGame(game, NO_CONTROLS); updateVisuals(visuals, game, 0, 1 / 60); }
    const slot = visuals.trails.get(shipId(game))!;
    expect(slot.trail.count).toBeGreaterThan(2);
    togglePause(game);
    const frozen = slot.trail.count;
    // A full second of paused rendering: the sim keeps its position, the tail must not grow.
    for (let i = 0; i < 60; i++) updateVisuals(visuals, game, 0, 1 / 60);
    expect(slot.trail.count).toBe(frozen);
    updateVisuals(visuals, game, 1, 1 / 60);
    expect(slot.trail.count).toBe(0);
    // The slots survive a restore: the ids are unchanged, only the geometry was stale.
    expect(visuals.trails.has(shipId(game))).toBe(true);
    expect(visuals.trails.size).toBe(3);
  });
});

describe('starfield', () => {
  it('generates the same field for the same seed and a different field for a different seed', () => {
    expect(createStarfield(2401, QUALITY.medium)).toEqual(createStarfield(2401, QUALITY.medium));
    expect(createStarfield(2401, QUALITY.medium)).not.toEqual(createStarfield(2402, QUALITY.medium));
  });
  it('keeps every normalized star coordinate inside one lattice tile', () => {
    const field = createStarfield(2401, QUALITY.high);
    expect(field.count).toBeGreaterThan(0);
    for (const layer of field.layers) {
      expect(layer.stars.length).toBe(layer.bucketStart[3] * 2);
      for (const value of layer.stars) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1); }
    }
  });
  it('scales with quality and draws nothing at fx=off', () => {
    expect(createStarfield(2401, QUALITY.off).count).toBe(0);
    expect(createStarfield(2401, QUALITY.high).count).toBeGreaterThan(createStarfield(2401, QUALITY.low).count);
  });
  it('rebuilds the starfield only when the level changes', () => {
    const visuals = createVisualState(), game = createGame(firstLevel);
    updateVisuals(visuals, game, 0, 1 / 60);
    const first = visuals.starfield;
    for (let i = 0; i < 120; i++) updateVisuals(visuals, game, 0, 1 / 60);
    expect(visuals.starfield).toBe(first);
    updateVisuals(visuals, undefined, 0, 1 / 60);
    expect(visuals.starfield).not.toBe(first);
    expect(visuals.starfield.seed).toBe(TITLE_SEED);
  });
});

describe('field selection', () => {
  it('reuses the caller\'s array instead of allocating one per frame', () => {
    const game = createGame(firstLevel);
    const buffer: FieldSource[] = [];
    expect(collectFields(game, buffer)).toBe(buffer);
    const identity = collectFields(game, buffer);
    for (let i = 0; i < 120; i++) expect(collectFields(game, buffer)).toBe(identity);
  });

  it('selects celestial sources by field strength, never by kind', () => {
    const game = createGame(firstLevel);
    // Two bodies that invert kind and strength, so a kind-based predicate cannot pass:
    // an asteroid scaled up to planet mass, and a planet shrunk to pebble mass.
    // 110 000 * (r/65)^3 is the strength law (gravity.ts:20), so r=65 hits the planet's own
    // 110 000 whatever the kind, and r=10 lands at ~400.
    const bigRock = createBody({ id: 'big-rock', kind: 'asteroid', position: { x: 0, y: 0 }, radius: 65 });
    const pebble = createBody({ id: 'pebble', kind: 'planet', position: { x: 0, y: 0 }, radius: 10 });
    expect(bodyGravity(bigRock).strength).toBeCloseTo(110_000, 6);
    expect(bodyGravity(pebble).strength).toBeLessThan(5e4);
    game.bodies.push(bigRock, pebble);
    const ids = collectFields(game, []).filter(f => !f.controllable).map(f => f.id);
    expect(ids).toContain('big-rock');
    expect(ids).not.toContain('pebble');
    // And the real level: only the movable planet clears the bar, not its asteroids.
    const real = ids.filter(id => id !== 'big-rock');
    expect(real).toEqual(game.bodies.filter(body => body.kind === 'planet' && body.id !== 'pebble').map(body => body.id));
  });

  it('emits both player fields, carrying each one\'s polarity and activation', () => {
    const game = createGame(firstLevel);
    expect(game.players[0].field.polarity).toBe(1);
    expect(game.players[1].field.polarity).toBe(-1);
    // A level starts in 'ready' with both fields off -- which is exactly the state
    // drawPending renders a dashed ring for, so it is worth pinning here.
    expect(collectFields(game, []).filter(f => f.controllable).map(f => f.active)).toEqual([false, false]);
    game.players[0].active = true; game.players[1].active = true;
    const fields = collectFields(game, []).filter(f => f.controllable);
    expect(fields.map(f => [f.id, f.polarity, f.active])).toEqual([['attractor', 1, true], ['repulsor', -1, true]]);
    game.players[1].active = false;
    expect(collectFields(game, []).find(f => f.id === 'repulsor')!.active).toBe(false);
  });

  it('copies coordinates rather than aliasing the live simulation vectors', () => {
    const game = createGame(firstLevel);
    const planet = game.bodies.find(body => body.kind === 'planet')!;
    const fields = collectFields(game, []);
    const source = fields.find(f => f.id === planet.id)!;
    const capturedX = source.x;
    planet.position.x += 500;
    expect(source.x).toBe(capturedX);
  });
});

type RecordedOp = { op: 'arc' | 'line' | 'fill' | 'stroke'; x: number; y: number; r: number };
/** Recording context for the field pass. drawFields is called directly rather than through
 * render(), so what it emits is not mixed in with trajectories, trails and the HUD -- those
 * also stroke, and a shared recorder could not tell them apart.
 *
 * Every method the renderer touches is implemented: a missing one would throw (loud), which
 * is the point. Silently recording nothing would make every assertion below vacuous. */
function fieldRecorder() {
  const ops: RecordedOp[] = [];
  const push = (op: RecordedOp['op'], x = 0, y = 0, r = 0) => { ops.push({ op, x, y, r }); };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', lineCap: '',
    lineJoin: '', globalCompositeOperation: '',
    clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
    beginPath() {}, closePath() {}, setLineDash() {}, rect() {},
    fillText() {}, fillRect() {}, strokeRect() {},
    fill() { push('fill'); }, stroke() { push('stroke'); },
    moveTo(x: number, y: number) { push('line', x, y); }, lineTo(x: number, y: number) { push('line', x, y); },
    arc(x: number, y: number, r: number) { push('arc', x, y, r); },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}
/** Radii of the arcs centred on one entity, in draw order. */
const arcsAt = (ops: RecordedOp[], centre: { x: number; y: number }) =>
  ops.filter(op => op.op === 'arc' && op.x === centre.x && op.y === centre.y).map(op => op.r);

describe('field rendering', () => {
  const camera = createCamera({ x: 550, y: 340 });

  it('draws an active field as contours only -- no fill disc and no tick strokes', () => {
    // Both were tried and both were cut: the fill painted one flat pale disc over the
    // field's whole radius (the largest shape on screen whenever a field was on), and the
    // ten chevrons at 0.72R joined into a polygon floating inside the boundary ring. This
    // pins the removal, because "fewer shapes" is exactly the kind of thing that creeps back.
    const game = createGame(firstLevel);
    game.players[0].active = true;
    const { ctx, ops } = fieldRecorder();
    drawFields(ctx, collectFields(game, []), camera, QUALITY.medium, 'running');
    expect(ops.filter(op => op.op === 'fill')).toEqual([]);
    expect(ops.filter(op => op.op === 'line')).toEqual([]);
  });

  it('places the rings at the fractions the field law actually decays through', () => {
    const game = createGame(firstLevel);
    const attractor = game.players[0];
    attractor.active = true;
    const { ctx, ops } = fieldRecorder();
    drawFields(ctx, collectFields(game, []), camera, QUALITY.medium, 'running');
    const own = arcsAt(ops, attractor.position);
    expect(own.length).toBe(4);
    // Outermost first, then the boundary exactly on field.radius -- which is where
    // fieldAcceleration stops returning zero (fields.ts:8).
    [0.87, 0.64, 0.37, 1].forEach((factor, i) => expect(own[i]).toBeCloseTo(attractor.field.radius * factor, 6));
  });

  it('gives celestial fields the same taper rings, so a well never reads as one bare circle', () => {
    // A radius-65 planet has a 330-unit field -- 264 screen px at zoom 0.8, the single
    // largest shape in the level. Drawn as one ring with nothing inside it that is just an
    // unexplained circle, which is what it was reported as.
    const game = createGame(firstLevel);
    const planet = game.bodies.find(body => body.kind === 'planet')!;
    const { ctx, ops } = fieldRecorder();
    drawFields(ctx, collectFields(game, []), camera, QUALITY.medium, 'running');
    const own = arcsAt(ops, planet.position);
    const radius = bodyGravity(planet).radius;
    expect(own.length).toBe(4);
    [0.87, 0.64, 0.37, 1].forEach((factor, i) => expect(own[i]).toBeCloseTo(radius * factor, 6));
  });

  it("shows an inactive field's reach only while the player is positioning", () => {
    // The simulation applies exactly nothing for an inactive field, so a ring drawn while
    // running would claim a force that does not exist. 'ready' and 'paused' is where the
    // player is choosing a position and is actually asking how far the field reaches.
    const game = createGame(firstLevel); // starts 'ready' with both fields off
    const attractor = game.players[0];
    const arcsWhile = (phase: 'ready' | 'paused' | 'running') => {
      const { ctx, ops } = fieldRecorder();
      drawFields(ctx, collectFields(game, []), camera, QUALITY.medium, phase);
      return arcsAt(ops, attractor.position).length;
    };
    expect(arcsWhile('ready')).toBe(1);
    expect(arcsWhile('paused')).toBe(1);
    expect(arcsWhile('running')).toBe(0);
  });

  it('leaves the fx=off baseline at exactly one filled, stroked circle per active field', () => {
    // fx=off is the A/B baseline and the bisect tool, so its shape is frozen: one arc, one
    // fill, one stroke, per ACTIVE controllable field, and nothing at all for celestial ones.
    const game = createGame(firstLevel);
    game.players[0].active = true;
    const { ctx, ops } = fieldRecorder();
    drawFields(ctx, collectFields(game, []), camera, QUALITY.off, 'running');
    expect(ops.map(op => op.op)).toEqual(['arc', 'fill', 'stroke']);
    expect(ops[0].r).toBeCloseTo(game.players[0].field.radius, 6);
  });
});

describe('celestial bodies', () => {
  it('never draws an asteroid outline beyond its collision radius', () => {
    // Collision (game.ts sweptOverlap) uses the exact body.radius. An outline vertex past
    // 1.0 would put visible rock where the ship can still legally fly, which reads as a
    // phantom hit. Checked across level bodies AND synthetic ids so the PRNG is exercised
    // well past the handful of rocks that happen to exist today.
    const ids = [...firstLevel.bodies.map(body => body.id), 'rock', 'rock-2', 'asteroid:17', 'x', ''];
    for (const id of ids) {
      const shape = rockShape(id);
      expect(shape.outline.length).toBeGreaterThan(2);
      for (const factor of shape.outline) { expect(factor).toBeGreaterThan(0); expect(factor).toBeLessThanOrEqual(1); }
      // Every crater, centre plus rim, stays inside the shallowest possible outline.
      for (let i = 0; i < shape.craters.length; i += 3) {
        const centre = Math.hypot(shape.craters[i], shape.craters[i + 1]);
        expect(centre + shape.craters[i + 2]).toBeLessThan(0.86);
      }
    }
  });
  it('generates the same rock for the same id and a different one for another id', () => {
    expect(rockShape('rock-a')).toEqual(rockShape('rock-a'));
    expect(rockShape('rock-a')).not.toEqual(rockShape('rock-b'));
  });
  it('is immune to entity ids that collide as strings', () => {
    // 11 vertices x Float32Array: distinct ids must not silently share a shape.
    const ids = ['a', 'b', 'c', 'd', 'e', 'rock-1', 'rock_1', 'rock 1'];
    const seen = new Set(ids.map(id => Array.from(rockShape(id).outline).join(',')));
    expect(seen.size).toBe(ids.length);
  });
});

describe('quality parsing', () => {
  it('reads the fx URL parameter and defaults to medium', () => {
    expect(parseQuality('')).toBe('medium');
    expect(parseQuality('?fx=low')).toBe('low');
    expect(parseQuality('?fx=high')).toBe('high');
    expect(parseQuality('?fx=off')).toBe('off');
    expect(parseQuality('?fx=nonsense')).toBe('medium');
    expect(parseQuality('?dev=1&scene=coop_test&fx=high')).toBe('high');
  });
});

describe('render module loading', () => {
  it('imports every render module without a DOM', () => {
    expect([createVisualState, createStarfield, drawStarfield, updateVisuals, render, renderTitle, drawBody,
      rockShape, collectFields, drawFields, drawNetForceArrow].every(fn => typeof fn === 'function')).toBe(true);
  });
});
