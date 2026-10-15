import type { GameState } from '../game/types';
import type { Camera } from '../camera/camera';
import { fieldAccelerationInto } from '../physics/fields';
import { bodyGravityInto, emptyField } from '../physics/gravity';
import { capabilitiesInto, emptyCapabilities } from '../game/entities';
import type { Body } from '../game/types';
import type { QualitySpec } from './scene-visuals';
import {
  ATTRACT_EDGE, ATTRACT_PENDING, ATTRACT_RINGS,
  CELESTIAL_EDGE, CELESTIAL_RINGS, LEGACY_ATTRACT_EDGE, LEGACY_ATTRACT_FILL, LEGACY_REPEL_EDGE,
  LEGACY_REPEL_FILL, NET_FORCE, REPEL_EDGE, REPEL_PENDING, REPEL_RINGS,
} from './palette';

/** Visual filter, not a physics one. Physics sums every source with `caps.gravity` and
 * `strength > 0` (world.ts:86,130); that includes asteroids (strength 2335) and the ship
 * itself (205), whose rings would be faint circles the width of the screen. 5e4 admits
 * planets (110 000), stars (220 000) and black holes (~4.4e6) and excludes everything else.
 * This threshold governs what is DRAWN only -- drawNetForceArrow deliberately does not use
 * it, because that arrow claims to be the true net force. */
const CELESTIAL_FIELD_THRESHOLD = 5e4;

/** Taper contour radii as a fraction of field.radius, outermost first.
 *
 * Solved from the field's own law (fields.ts:9): `taper = (1 - (d/R)^2)^2`, so `d/R =
 * sqrt(1 - sqrt(t))` for a remaining strength `t`. These are t = 6% / 35% / 75%. The uneven
 * spacing is the point -- it is what the decay actually looks like, and evenly spaced rings
 * would say the field falls off linearly when it does not.
 *
 * Paired index-for-index with the palette's ring alphas, which rise inward, so the innermost
 * ring -- the strongest region -- is the most solid. */
const RING_FRACTIONS = [0.87, 0.64, 0.37] as const;

/** Phases in which an inactive player field still shows its reach as a dashed ring.
 *
 * These are exactly the phases where the player is positioning rather than flying, and so
 * is asking "how far does this reach if I switch it on?". While running the answer must be
 * nothing at all: the simulation applies nothing for an inactive field, and a ring drawn
 * there would claim a force that does not exist. */
const PENDING_PHASES: readonly GameState['phase'][] = ['ready', 'paused'];

/** Net-force arrow. A perceptual scale, not a physical one: sqrt keeps the small steady
 * accelerations of a distant planet visible while still letting a strong field saturate. */
const ARROW_MIN_PX = 16, ARROW_MAX_PX = 64, ARROW_REFERENCE = 40;
/** Below this the arrow would be noise. Roughly the acceleration of a field edge. */
const ARROW_EPSILON = 1e-3;

/** One drawn field. Scalars rather than a live Vec2 reference: the source objects are mutated
 * by the simulation every step, and copying here means a FieldSource can never quietly start
 * pointing at different coordinates than the ones it was collected for. */
export interface FieldSource {
  id: string;
  x: number;
  y: number;
  radius: number;
  polarity: 1 | -1;
  /** False for celestial gravity. Those stay neutral grey so the two fields the player can
   * actually steer are never mistaken for ones they cannot. */
  controllable: boolean;
  /** Player fields switch off; celestial ones are always live. */
  active: boolean;
}

const capsScratch = emptyCapabilities();
/** Reused across bodies, so this is one Field object for the whole pass rather than one per
 * body. `bodyGravityInto` itself resolves `capabilities` a second time internally
 * (gravity.ts:8, acknowledged at world.ts:179); that is the accepted cost, and at one pass
 * per frame -- not 720 per forecast -- it is not worth duplicating the physics constants in
 * the renderer to avoid. */
const gravityScratch = emptyField();
/** Target/source/result scratch for the arrow, so the per-frame sum allocates nothing. */
const arrowTarget = { x: 0, y: 0 }, arrowSource = { x: 0, y: 0 }, accScratch = { x: 0, y: 0 };

function put(out: FieldSource[], index: number, id: string, x: number, y: number, radius: number,
  polarity: 1 | -1, controllable: boolean, active: boolean): void {
  const slot = out[index];
  if (slot) {
    slot.id = id; slot.x = x; slot.y = y; slot.radius = radius; slot.polarity = polarity;
    slot.controllable = controllable; slot.active = active;
  } else {
    out[index] = { id, x, y, radius, polarity, controllable, active };
  }
}

/** Fills `out` with this frame's drawable fields and returns THE SAME ARRAY INSTANCE, so a
 * caller can hold one buffer for the life of the process and never allocate. The only
 * objects created are the slot structs on the first frame, plus whatever `bodyGravityInto`
 * allocates internally. tests/render-visuals.test.ts pins the identity.
 *
 * Order is players first, then celestial bodies: the player's own fields are what they came
 * to look at, and drawing them last would let a planet's grey ring sit on top of them. */
export function collectFields(game: GameState, out: FieldSource[]): FieldSource[] {
  let n = 0;
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    put(out, n++, player.id, player.position.x, player.position.y, player.field.radius,
      player.field.polarity, true, player.active);
  }
  for (let i = 0; i < game.bodies.length; i++) {
    const body = game.bodies[i];
    if (body.layer === 'background') continue;
    capabilitiesInto(capsScratch, body);
    if (!capsScratch.gravity) continue;
    bodyGravityInto(gravityScratch, body);
    if (gravityScratch.strength < CELESTIAL_FIELD_THRESHOLD) continue;
    put(out, n++, body.id, body.position.x, body.position.y, gravityScratch.radius, 1, false, true);
  }
  out.length = n;
  return out;
}

function ringPath(ctx: CanvasRenderingContext2D, f: FieldSource, radius: number): void {
  ctx.beginPath(); ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
}

function drawRing(ctx: CanvasRenderingContext2D, f: FieldSource, fraction: number, color: string, zoom: number): void {
  ringPath(ctx, f, f.radius * fraction);
  ctx.strokeStyle = color; ctx.lineWidth = 1 / zoom; ctx.stroke();
}

/** Draws one field. Called for every collected source; world space.
 *
 * Contours only: three taper rings plus the boundary. There is no fill and no polar tick
 * ring. Both were tried and both were cut. The fill painted one flat pale disc over the
 * field's whole radius, which is the single largest shape on screen whenever a field is
 * on, and it says less than the rings do. The tick ring was ten chevrons at 0.72R, which
 * the eye joins into a polygon floating inside the boundary ring rather than reads as
 * radial marks -- and it carried no information anyway: a player field's polarity is
 * already its colour (GAME_DESIGN.md:147), and every celestial field is a gravity source,
 * so its polarity is always the same. */
function drawField(ctx: CanvasRenderingContext2D, f: FieldSource, spec: QualitySpec, zoom: number): void {
  const rings = f.controllable ? (f.polarity === 1 ? ATTRACT_RINGS : REPEL_RINGS) : CELESTIAL_RINGS;
  const edge = f.controllable ? (f.polarity === 1 ? ATTRACT_EDGE : REPEL_EDGE) : CELESTIAL_EDGE;
  for (let i = 0; i < spec.fieldRings && i < RING_FRACTIONS.length; i++) {
    drawRing(ctx, f, RING_FRACTIONS[i], rings[i], zoom);
  }
  // Always, at every quality above off: the ring sits exactly on field.radius, which is
  // where fieldAcceleration stops returning zero (fields.ts:8). Nothing outside it is
  // drawn, because nothing acts there -- that boundary is the one thing this pass must
  // never misplace, so it is not gated on the ring count.
  drawRing(ctx, f, 1, edge, zoom);
}

/** A player field that is switched off, during the phases where the player is positioning.
 *
 * While running, an inactive field is invisible -- that matches the simulation, which applies
 * exactly nothing. But 'ready' and 'paused' is when the player is choosing where to stand,
 * and a dashed ring there answers "how far does this reach if I switch it on", reusing the
 * trajectory's dashed vocabulary to say "this is not currently real". */
function drawPending(ctx: CanvasRenderingContext2D, f: FieldSource, zoom: number): void {
  ctx.save();
  ctx.setLineDash([6 / zoom, 6 / zoom]);
  ringPath(ctx, f, f.radius);
  ctx.strokeStyle = f.polarity === 1 ? ATTRACT_PENDING : REPEL_PENDING;
  ctx.lineWidth = 1 / zoom; ctx.stroke();
  ctx.restore();
}

/** The two circles this project drew per active player field before the effects pass.
 * Preserved verbatim for fx=off. */
function drawLegacyField(ctx: CanvasRenderingContext2D, f: FieldSource, zoom: number): void {
  const fill = f.polarity === 1 ? LEGACY_ATTRACT_FILL : LEGACY_REPEL_FILL;
  const edge = f.polarity === 1 ? LEGACY_ATTRACT_EDGE : LEGACY_REPEL_EDGE;
  ringPath(ctx, f, f.radius);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 1 / zoom; ctx.stroke();
}

/** All visible fields, world space.
 *
 * At `spec.fieldRings === 0` (fx=off) this draws the legacy player circles instead of the
 * new rings -- not an approximation of them, the same two fills and same two alphas. That is
 * what lets fx=off serve as the baseline the whole pass is measured against. */
export function drawFields(ctx: CanvasRenderingContext2D, fields: FieldSource[], camera: Camera, spec: QualitySpec, phase: GameState['phase']): void {
  // Scoped so lineWidth cannot escape: every ring sets its own, and an uncontained leak
  // would land on the map panel's border, which is drawn later with whatever width happens
  // to be current. The pre-existing station/wormhole leak in celestial.ts is a separate,
  // documented case. Invisible at fx=off, where the legacy path sets 1/zoom -- the same
  // value canvas.ts sets before calling.
  const pending = PENDING_PHASES.includes(phase);
  ctx.save();
  for (const field of fields) {
    if (spec.fieldRings === 0) {
      if (field.controllable && field.active) drawLegacyField(ctx, field, camera.zoom);
      continue;
    }
    if (field.active) drawField(ctx, field, spec, camera.zoom);
    else if (field.controllable && pending) drawPending(ctx, field, camera.zoom);
  }
  ctx.restore();
}

function findShip(game: GameState): Body | undefined {
  for (let i = 0; i < game.bodies.length; i++) if (game.bodies[i].kind === 'ship') return game.bodies[i];
  return undefined;
}

/** The net acceleration acting on the ship, as a screen-space arrow.
 *
 * Screen space so its length means the same thing at every zoom. The sum deliberately mirrors
 * `accelerations()` exactly -- active player fields (world.ts:99), then every gravity source
 * that is not the ship itself (world.ts:114,130) -- rather than reusing the drawn fields,
 * because the dev telemetry panel shows that same true sum and the two must not disagree.
 *
 * Sums through the in-place `fieldAccelerationInto` so ten sources a frame cost no objects. */
export function drawNetForceArrow(ctx: CanvasRenderingContext2D, game: GameState, camera: Camera, spec: QualitySpec): void {
  if (spec.fieldRings === 0) return;
  const ship = findShip(game);
  if (!ship) return;
  arrowTarget.x = ship.position.x; arrowTarget.y = ship.position.y;
  let ax = 0, ay = 0;
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (!player.active) continue;
    arrowSource.x = player.position.x; arrowSource.y = player.position.y;
    fieldAccelerationInto(accScratch, arrowTarget, arrowSource, player.field);
    ax += accScratch.x; ay += accScratch.y;
  }
  for (let i = 0; i < game.bodies.length; i++) {
    const body = game.bodies[i];
    if (body === ship) continue;
    capabilitiesInto(capsScratch, body);
    if (!capsScratch.gravity) continue;
    bodyGravityInto(gravityScratch, body);
    if (gravityScratch.strength <= 0) continue;
    arrowSource.x = body.position.x; arrowSource.y = body.position.y;
    fieldAccelerationInto(accScratch, arrowTarget, arrowSource, gravityScratch);
    ax += accScratch.x; ay += accScratch.y;
  }
  const magnitude = Math.hypot(ax, ay);
  if (!(magnitude > ARROW_EPSILON)) return;
  const t = Math.min(1, Math.sqrt(magnitude / ARROW_REFERENCE));
  const length = ARROW_MIN_PX + (ARROW_MAX_PX - ARROW_MIN_PX) * t;
  const originX = camera.width / 2 + (ship.position.x - camera.position.x) * camera.zoom;
  const originY = camera.height / 2 + (ship.position.y - camera.position.y) * camera.zoom;
  const angle = Math.atan2(ay, ax);
  const tipX = originX + Math.cos(angle) * length, tipY = originY + Math.sin(angle) * length;
  const head = 9;
  ctx.save();
  ctx.strokeStyle = NET_FORCE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(originX, originY); ctx.lineTo(tipX, tipY);
  ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - Math.cos(angle - 0.42) * head, tipY - Math.sin(angle - 0.42) * head);
  ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - Math.cos(angle + 0.42) * head, tipY - Math.sin(angle + 0.42) * head);
  ctx.stroke();
  ctx.restore();
}
