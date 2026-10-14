import { describe, expect, it } from 'vitest';
import { createGame, pause, stepGame, togglePause } from '../src/game/game';
import { FixedClock } from '../src/game/clock';
import { NO_CONTROLS } from '../src/game/types';
import { firstLevel } from '../src/levels/first';
import { Keyboard } from '../src/input/keyboard';

describe('game lifecycle and rules', () => {
  it('preserves bodies while ready/paused but lets both players reposition', () => {
    const g = createGame(firstLevel); const bodies = structuredClone(g.bodies);
    const input = { movement: [{ x: 1, y: 0 }, { x: -1, y: 0 }] as [{x:number;y:number},{x:number;y:number}], fields: [true, true] as [boolean, boolean] };
    stepGame(g, input); expect(g.bodies).toEqual(bodies);
    expect(g.players[0].position.x).toBeGreaterThan(firstLevel.players[0].position.x);
    expect(g.players[1].position.x).toBeLessThan(firstLevel.players[1].position.x);
    togglePause(g); stepGame(g, NO_CONTROLS); const after = structuredClone(g.bodies); const elapsed = g.elapsed;
    pause(g); for (let i = 0; i < 120; i++) stepGame(g, input);
    expect(g.bodies).toEqual(after); expect(g.elapsed).toBe(elapsed);
    togglePause(g); stepGame(g, NO_CONTROLS); expect(g.bodies).not.toEqual(after);
  });
  it('restarts with a deep independent state', () => {
    const a = createGame(firstLevel); const initial = structuredClone(a); togglePause(a);
    for (let i = 0; i < 120; i++) stepGame(a, NO_CONTROLS);
    expect(createGame(firstLevel)).toEqual(initial);
    a.players[0].field.radius = 1; a.level.port.radius = 1;
    expect(createGame(firstLevel)).toEqual(initial);
  });
  it('bounds players and normalizes diagonal movement', () => {
    const g = createGame(firstLevel); const before = { ...g.players[0].position };
    const input = { movement: [{ x: 1, y: 1 }, { x: -1, y: -1 }] as [{x:number;y:number},{x:number;y:number}], fields: [false, false] as [boolean, boolean] };
    stepGame(g, input);
    expect(Math.hypot(g.players[0].position.x - before.x, g.players[0].position.y - before.y)).toBeCloseTo(260 / 60);
    for (let i = 0; i < 1000; i++) stepGame(g, input);
    expect(g.players[0].position).toEqual({ x: 1087, y: 607 }); expect(g.players[1].position).toEqual({ x: 13, y: 13 });
  });
  it.each(['planet', 'asteroid', 'blackHole'] as const)('loses on %s collision', kind => {
    const g = createGame(firstLevel); g.bodies = g.bodies.slice(0, 2);
    g.bodies[1].kind = kind; g.bodies[1].captureRadius = 30;
    g.bodies[0].position = { ...g.bodies[1].position };
    togglePause(g); stepGame(g, NO_CONTROLS); expect(g.phase).toBe('lost');
    const ended = structuredClone(g); togglePause(g); stepGame(g, NO_CONTROLS); expect(g).toEqual(ended);
  });
  it('loses when the ship crosses the world bounds', () => {
    const g = createGame(firstLevel); g.bodies[0].position.x = 1095;
    togglePause(g); stepGame(g, NO_CONTROLS); expect(g.phase).toBe('lost');
  });
  it('wins only with full containment and speed at or below threshold', () => {
    for (const speed of [0, 47.9, 48, 48.1, 90]) {
      const g = createGame(firstLevel); g.bodies = [g.bodies[0]];
      g.bodies[0].position = { ...g.level.port.position }; g.bodies[0].velocity = { x: speed, y: 0 };
      togglePause(g); stepGame(g, NO_CONTROLS); expect(g.phase).toBe(speed <= 48 ? 'won' : 'running');
    }
    const g = createGame(firstLevel); g.bodies = [g.bodies[0]];
    g.bodies[0].position = { x: 1035, y: 340 }; g.bodies[0].velocity = { x: 0, y: 0 };
    togglePause(g); stepGame(g, NO_CONTROLS); expect(g.phase).toBe('running');
  });
  it('turns an invalid simulation into a recoverable failure', () => {
    const g = createGame(firstLevel); g.bodies[0].velocity.x = NaN;
    togglePause(g); stepGame(g, NO_CONTROLS); expect(g.phase).toBe('lost'); expect(g.message).toContain('数值异常');
    expect(createGame(firstLevel).phase).toBe('ready');
  });
});

describe('fixed clock and input', () => {
  it('produces the same simulated state at 30, 60 and 144 rendering FPS', () => {
    const states = [30, 60, 144].map(fps => {
      const g = createGame(firstLevel); togglePause(g); const clock = new FixedClock();
      for (let i = 0; i < fps * 3; i++) clock.advance(1 / fps, () => stepGame(g, NO_CONTROLS));
      return g;
    });
    expect(states[0]).toEqual(states[1]); expect(states[1]).toEqual(states[2]);
  });
  it('caps catch-up and rejects invalid frame times', () => {
    const clock = new FixedClock(); expect(clock.advance(120, () => {})).toBe(15);
    expect(clock.advance(NaN, () => {})).toBe(0); expect(clock.advance(-1, () => {})).toBe(0);
    clock.advance(0.01, () => {}); clock.reset(); expect(clock.advance(0.01, () => {})).toBe(0);
  });
  it('tracks simultaneous keys, suppresses action repeat and clears stuck keys', () => {
    const actions: string[] = []; const k = new Keyboard(action => actions.push(action));
    for (const key of ['KeyW', 'KeyD', 'ArrowLeft', 'ArrowDown', 'KeyF', 'Enter']) expect(k.keyDown(key)).toBe(true);
    expect(k.read()).toEqual({ movement: [{ x: 1, y: -1 }, { x: -1, y: 1 }], fields: [true, true] });
    k.keyDown('Space'); k.keyDown('Space', true); k.keyDown('Space'); expect(actions).toEqual(['toggle']);
    k.keyUp('Space'); k.keyDown('Space'); expect(actions).toEqual(['toggle', 'toggle']);
    k.keyDown('KeyR'); expect(actions.at(-1)).toBe('reset');
    expect(k.keyDown('KeyZ')).toBe(false); k.clear(); expect(k.read()).toEqual(NO_CONTROLS);
  });
});
