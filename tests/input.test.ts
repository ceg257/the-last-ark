import { describe, expect, it } from 'vitest';
import { createControls, copyIntent, NEUTRAL_INTENT, NO_CONTROLS } from '../src/input/intent';
import type { PlayerControlIntent } from '../src/input/intent';
import { PlayerInputs } from '../src/input/sources';
import type { PlayerInputSource } from '../src/input/sources';
import { Keyboard } from '../src/input/keyboard';
import { WorldTarget } from '../src/input/world-target';
import { createCamera, follow, resizeCamera, setZoom } from '../src/camera/camera';
import { applyPlayerIntent } from '../src/physics/player';
import { add, length, limit, scale, sub } from '../src/physics/vector';
import { firstLevel } from '../src/levels/first';
import { createGame, stepGame } from '../src/game/game';
import { FixedClock } from '../src/game/clock';

/** Test-only stand-in for future hardware adapters. No browser Gamepad API or mouse binding. */
class FakeSource implements PlayerInputSource {
  intent: PlayerControlIntent = { ...NEUTRAL_INTENT };
  read(): PlayerControlIntent { return this.intent; }
  reset(): void { this.intent = { ...NEUTRAL_INTENT }; }
  releaseMovement(): void { this.intent = { ...NEUTRAL_INTENT, abilityActive: this.intent.abilityActive }; }
}

describe('device-independent input channels', () => {
  it('keeps the full dual keyboard trajectory bit-for-bit identical to the old dynamics', () => {
    const k = new Keyboard(() => {}), inputs = new PlayerInputs([k.source(0), k.source(1)]);
    const game = createGame(firstLevel), expected = structuredClone(game.players);
    const segments = [
      ['KeyD', 'KeyW', 'ArrowLeft', 'KeyF', 'Enter'], [],
      ['KeyA', 'ArrowDown', 'ArrowRight'], ['KeyS', 'ArrowUp'], [],
    ];
    for (const keys of segments) {
      k.releaseKeys(); keys.forEach(key => k.keyDown(key));
      for (let step = 0; step < 80; step++) {
        const axes = [
          { x: Number(k.pressed.has('KeyD')) - Number(k.pressed.has('KeyA')), y: Number(k.pressed.has('KeyS')) - Number(k.pressed.has('KeyW')) },
          { x: Number(k.pressed.has('ArrowRight')) - Number(k.pressed.has('ArrowLeft')), y: Number(k.pressed.has('ArrowDown')) - Number(k.pressed.has('ArrowUp')) },
        ];
        expected.forEach((p, i) => {
          // Frozen pre-abstraction formula: independent oracle for preserving current feel.
          const axis = limit(axes[i], 1), target = scale(axis, p.speed);
          const acceleration = length(axis) > 0 ? p.acceleration : p.braking;
          p.velocity = add(p.velocity, limit(sub(target, p.velocity), Math.max(0, acceleration) * (1 / 60)));
          p.position = add(p.position, scale(p.velocity, 1 / 60));
        });
        stepGame(game, inputs.read());
        expect(game.players.map(p => [p.position, p.velocity])).toEqual(expected.map(p => [p.position, p.velocity]));
        expect(game.players.every(p => p.active)).toBe(true);
      }
    }
  });

  it('mixes keyboard and analog intents without changing the other player or losing analog magnitude', () => {
    const k = new Keyboard(() => {}), analog = new FakeSource();
    const inputs = new PlayerInputs([k.source(0), analog]);
    k.keyDown('KeyD'); k.keyDown('KeyF'); k.keyDown('ArrowLeft'); k.keyDown('Enter');
    analog.intent = { moveX: 0.3, moveY: 0.4, abilityActive: true };
    const game = createGame(firstLevel), before = structuredClone(game);
    for (let i = 0; i < 30; i++) inputs.read();
    expect(game).toEqual(before); // Reading input cannot mutate the simulation.
    for (let i = 0; i < 60; i++) stepGame(game, inputs.read());
    expect(game.players[0].velocity).toEqual({ x: 260, y: 0 });
    expect(game.players[1].velocity).toEqual({ x: 78, y: 104 });
    expect(game.players.every(p => p.active)).toBe(true);
  });

  it('reassigns only one channel, clears stale intent and brakes through physics rather than resetting velocity', () => {
    const k = new Keyboard(() => {}), replacement = new FakeSource();
    const inputs = new PlayerInputs([k.source(0), k.source(1)]);
    for (const key of ['KeyD', 'KeyF', 'ArrowRight', 'Enter']) k.keyDown(key);
    const game = createGame(firstLevel);
    for (let i = 0; i < 24; i++) stepGame(game, inputs.read());
    replacement.intent = { moveX: -1, moveY: 0, abilityActive: true };
    inputs.setSource(1, replacement);
    expect(game.players[1].velocity.x).toBeCloseTo(260);
    expect(inputs.read().players[0]).toEqual({ moveX: 1, moveY: 0, abilityActive: true });
    expect(inputs.read().players[1]).toEqual(NEUTRAL_INTENT);
    expect(k.source(1).read()).toEqual(NEUTRAL_INTENT);
    stepGame(game, inputs.read());
    expect(game.players[1].velocity.x).toBeCloseTo(260 - game.players[1].braking / 60);
    expect(game.players[1].active).toBe(false);
    expect(game.players[0].active).toBe(true);
    inputs.setSource(1, replacement); // Reassigning the same channel is harmless.
  });

  it('does not allow the same stateful channel to be shared by both players', () => {
    const a = new FakeSource(), b = new FakeSource();
    expect(() => new PlayerInputs([a, a])).toThrow('independent');
    const inputs = new PlayerInputs([a, b]);
    expect(() => inputs.setSource(1, a)).toThrow('other player');
  });

  it('clears movement/targets on focus loss, retains toggles, and fully clears on scene reset', () => {
    const k = new Keyboard(() => {}), target = new FakeSource();
    const inputs = new PlayerInputs([k.source(0), target]);
    k.keyDown('KeyD'); k.keyDown('KeyF');
    target.intent = { ...NEUTRAL_INTENT, abilityActive: true, targetWorldPosition: { x: 900, y: 800 } };
    inputs.releaseMovement();
    expect(inputs.read()).toEqual(createControls({ abilityActive: true }, { abilityActive: true }));
    inputs.reset(); expect(inputs.read()).toEqual(NO_CONTROLS);
  });

  it('copies provider buffers and rejects invalid axes/targets without polluting physics', () => {
    const a = new FakeSource(), b = new FakeSource(), point = { x: 100, y: 200 };
    a.intent = { moveX: 3, moveY: -3, abilityActive: true, targetWorldPosition: point };
    const inputs = new PlayerInputs([a, b]), snapshot = inputs.read();
    point.x = 999;
    expect(snapshot.players[0]).toEqual({ moveX: 1, moveY: -1, abilityActive: true, targetWorldPosition: { x: 100, y: 200 } });
    const invalid = { moveX: NaN, moveY: Infinity, abilityActive: false, targetWorldPosition: { x: 0, y: -Infinity } };
    expect(copyIntent(invalid)).toEqual(NEUTRAL_INTENT);
    const player = structuredClone(firstLevel.players[0]);
    applyPlayerIntent(player, invalid, 1 / 60);
    expect(player.velocity).toEqual({ x: 0, y: 0 });
    expect(player.position).toEqual(firstLevel.players[0].position);
  });
});

describe('future pointer world-target contract', () => {
  it('converts client pixels including canvas offsets, CSS scaling and camera zoom once', () => {
    const camera = createCamera({ x: -1000, y: 2000 }, 1000, 600); setZoom(camera, 2);
    const target = new WorldTarget();
    target.capture({ x: 450, y: 150 }, { left: 100, top: 50, width: 500, height: 300 }, camera);
    expect(target.read()).toEqual({ x: -900, y: 1950 });
    const detached = target.read()!; detached.x = 0;
    expect(target.read()!.x).toBe(-900);
  });

  it('does not chase the ship when the camera follows, zooms or resizes without another pointer event', () => {
    const camera = createCamera({ x: 0, y: 0 }), target = new WorldTarget();
    const bounds = { left: 0, top: 0, width: 1100, height: 620 };
    target.capture({ x: 750, y: 310 }, bounds, camera);
    const captured = target.read();
    for (let i = 0; i < 60; i++) follow(camera, { x: i * 65, y: 340 }, { x: 65, y: 0 }, 1 / 60);
    setZoom(camera, 1.5); resizeCamera(camera, 800, 600);
    expect(target.read()).toEqual(captured);
    target.capture({ x: 751, y: 310 }, { ...bounds, width: 800, height: 600 }, camera);
    expect(target.read()).not.toEqual(captured);
    target.clear(); expect(target.read()).toBeUndefined();
  });

  it('clears invalid pointer projections instead of emitting NaN or retaining a stale target', () => {
    const target = new WorldTarget(), camera = createCamera({ x: 0, y: 0 });
    target.capture({ x: 10, y: 10 }, { left: 0, top: 0, width: 100, height: 100 }, camera);
    target.capture({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 100 }, camera);
    expect(target.read()).toBeUndefined();
    target.capture({ x: NaN, y: 10 }, { left: 0, top: 0, width: 100, height: 100 }, camera);
    expect(target.read()).toBeUndefined();
  });

  it.each([{ x: 600, y: 300 }, { x: -1000, y: -500 }, { x: 350.01, y: 160 }])('tracks target %j with bounded acceleration and settles without teleporting', targetWorldPosition => {
    const player = structuredClone(firstLevel.players[0]);
    const intent = { ...NEUTRAL_INTENT, abilityActive: true, targetWorldPosition };
    const start = { ...player.position };
    for (let i = 0; i < 1200; i++) {
      const velocity = { ...player.velocity }, position = { ...player.position };
      applyPlayerIntent(player, intent, 1 / 60);
      expect(length(sub(player.velocity, velocity))).toBeLessThanOrEqual(Math.max(player.acceleration, player.braking) / 60 + 1e-9);
      expect(length(player.velocity)).toBeLessThanOrEqual(player.speed + 1e-9);
      expect(player.position).toEqual(add(position, scale(player.velocity, 1 / 60)));
      expect(player.active).toBe(true);
      if (i === 0) expect(length(sub(player.position, start))).toBeLessThan(length(sub(targetWorldPosition, start)));
    }
    expect(length(sub(player.position, targetWorldPosition))).toBeLessThan(0.01);
    expect(length(player.velocity)).toBeLessThan(0.01);
  });

  it('brakes at the target with existing velocity and reverses smoothly after a target jump', () => {
    const player = structuredClone(firstLevel.players[0]); player.velocity.x = player.speed;
    applyPlayerIntent(player, { ...NEUTRAL_INTENT, targetWorldPosition: { ...player.position } }, 1 / 60);
    expect(player.velocity.x).toBeCloseTo(player.speed - player.braking / 60);
    const before = player.velocity.x;
    applyPlayerIntent(player, { ...NEUTRAL_INTENT, targetWorldPosition: { x: -1000, y: 160 } }, 1 / 60);
    expect(player.velocity.x).toBeGreaterThan(0);
    expect(before - player.velocity.x).toBeLessThanOrEqual(player.acceleration / 60 + 1e-9);
  });

  it('lets explicit movement axes override a stored target and brakes normally when the target is cleared', () => {
    const player = structuredClone(firstLevel.players[0]);
    applyPlayerIntent(player, { ...NEUTRAL_INTENT, moveX: -1, targetWorldPosition: { x: 1000, y: 160 } }, 1 / 60);
    expect(player.velocity.x).toBeLessThan(0);
    const before = player.velocity.x;
    applyPlayerIntent(player, NEUTRAL_INTENT, 1 / 60);
    expect(player.velocity.x).toBeGreaterThan(before); expect(player.velocity.x).toBeLessThan(0);
  });

  it('supports target + analog sources independently and remains invariant under render rates/camera motion', () => {
    const results = [30, 60, 144].map(fps => {
      const game = createGame(firstLevel), pointer = new FakeSource(), analog = new FakeSource();
      const inputs = new PlayerInputs([pointer, analog]);
      const camera = createCamera({ x: 0, y: 0 }), target = new WorldTarget();
      target.capture({ x: 750, y: 390 }, { left: 0, top: 0, width: 1100, height: 620 }, camera);
      pointer.intent = { ...NEUTRAL_INTENT, abilityActive: true, targetWorldPosition: target.read() };
      analog.intent = { moveX: -0.5, moveY: 0, abilityActive: true };
      const clock = new FixedClock();
      for (let i = 0; i < fps * 5; i++) {
        follow(camera, { x: i * 50, y: 700 }, { x: 100, y: 0 }, 1 / fps);
        clock.advance(1 / fps, () => stepGame(game, inputs.read()));
      }
      expect(length(sub(game.players[0].position, target.read()!))).toBeLessThan(0.01);
      expect(game.players[1].velocity.x).toBe(-130);
      expect(game.players.every(p => p.active)).toBe(true);
      return game;
    });
    expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2]);
  });
});
