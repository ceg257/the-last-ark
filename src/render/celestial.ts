import type { Body } from '../game/types';
import type { Camera } from '../camera/camera';
import { seededRandom } from '../world/sectors';
import {
  HOLE_HALO, HOLE_HALO_OUT, PHOTON_RING, PLANET_ATMOSPHERE, PLANET_ATMOSPHERE_OUT, PLANET_BASE,
  PLANET_DARK, PLANET_LIT, ROCK_BASE, ROCK_CRATER, ROCK_CRATER_EDGE, ROCK_RIM, SHIP_EDGE,
  SHIP_HULL, STATION, STATION_FILL, STATION_SOFT, STAR_CORE, STAR_FADE, STAR_GLOW, STAR_MID, VOID,
  WORMHOLE_INNER,
} from './palette';

/** Vertices on an asteroid outline. Odd and small so the shape reads as chunky rock rather
 * than a circle, without costing a per-vertex sine. */
const ROCK_VERTICES = 11;
/** Outline radius in units of body.radius. The upper bound is a hard contract, not a taste
 * call -- see buildRock. */
const ROCK_MIN = 0.86, ROCK_MAX = 1.0;
const ROCK_CRATERS = 3;
/** Radial-gradient coordinates resolve against the user space at paint time, so a gradient
 * built at the origin can be reused for any body by translating first. Bucketing the radius
 * to 0.25 units keeps the map small while keeping the visuals identical at the precision the
 * screen can actually show. */
const RADIUS_STEP = 4;

const gradientCache = new Map<string, CanvasGradient>();
let cacheCtx: CanvasRenderingContext2D | undefined;

function gradient(ctx: CanvasRenderingContext2D, key: string, build: () => CanvasGradient): CanvasGradient {
  if (cacheCtx !== ctx) { gradientCache.clear(); cacheCtx = ctx; }
  let value = gradientCache.get(key);
  if (!value) { value = build(); gradientCache.set(key, value); }
  return value;
}

/** All three helpers draw around the origin: the caller has already translated. */
function disc(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function ring(ctx: CanvasRenderingContext2D, r: number, color: string, widthPx: number, zoom: number): void {
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = widthPx / zoom; ctx.stroke();
}
/** FNV-1a. `seededRandom` (world/sectors.ts:21) takes a number and `sectorSeed` wants a
 * SectorKey, so entity ids need their own hash to reach the same PRNG. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { hash ^= id.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

export interface RockShape {
  /** Per-vertex radius factor, all within [ROCK_MIN, ROCK_MAX]. */
  outline: Float32Array;
  /** [x, y, r] per crater, in units of body.radius. */
  craters: Float32Array;
}

const rockCache = new Map<string, RockShape>();

/** Deterministic from the body id alone.
 *
 * The outline factors are capped at ROCK_MAX = 1.0 so the drawn edge never crosses
 * body.radius. Collision uses the exact radius (game.ts sweptOverlap), so an outline drawn
 * beyond it would show a hit that looks like it happened inside the rock -- punishing the
 * player for a rendering choice. The cap is asserted in tests/render-visuals.test.ts.
 *
 * Stored as unit factors rather than absolute radii, so the same entry stays valid if a
 * level ever resizes the body.
 *
 * Exported so the radius cap can be asserted directly, rather than inferred from pixels. */
export function rockShape(id: string): RockShape {
  const cached = rockCache.get(id);
  if (cached) return cached;
  const random = seededRandom(hashId(id));
  const outline = new Float32Array(ROCK_VERTICES);
  for (let i = 0; i < ROCK_VERTICES; i++) outline[i] = ROCK_MIN + (ROCK_MAX - ROCK_MIN) * random();
  // Crater centres stay inside 0.55r and craters are at most 0.20r wide, so the deepest cave
  // reaches 0.75r -- comfortably inside the 0.86r minimum outline.
  const craters = new Float32Array(ROCK_CRATERS * 3);
  for (let i = 0; i < ROCK_CRATERS; i++) {
    const angle = random() * Math.PI * 2;
    const distance = 0.55 * Math.sqrt(random());
    craters[i * 3] = Math.cos(angle) * distance;
    craters[i * 3 + 1] = Math.sin(angle) * distance;
    craters[i * 3 + 2] = 0.10 + 0.10 * random();
  }
  const built = { outline, craters };
  rockCache.set(id, built);
  return built;
}

function planet(ctx: CanvasRenderingContext2D, r: number): void {
  const key = Math.round(r * RADIUS_STEP);
  const surface = gradient(ctx, `planet:${key}`, () => {
    // Light is pinned to the world's upper-left, so every planet in a scene is lit alike.
    const g = ctx.createRadialGradient(-0.34 * r, -0.44 * r, 0.06 * r, 0, 0, 1.02 * r);
    g.addColorStop(0, PLANET_LIT); g.addColorStop(0.45, PLANET_BASE); g.addColorStop(1, PLANET_DARK);
    return g;
  });
  const airglow = gradient(ctx, `atmo:${key}`, () => {
    const g = ctx.createRadialGradient(0, 0, r, 0, 0, 1.14 * r);
    g.addColorStop(0, PLANET_ATMOSPHERE); g.addColorStop(1, PLANET_ATMOSPHERE_OUT);
    return g;
  });
  // Airglow first at 1.14r, disc over it at r: the atmosphere therefore only ever shows
  // outside the silhouette. The disc is left unstroked so the collision edge stays sharp.
  ctx.beginPath(); ctx.arc(0, 0, 1.14 * r, 0, Math.PI * 2);
  ctx.fillStyle = airglow; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = surface; ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, r: number): void {
  const glow = gradient(ctx, `star:${Math.round(r * RADIUS_STEP)}`, () => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.4 * r);
    g.addColorStop(0, STAR_CORE); g.addColorStop(0.35, STAR_MID);
    g.addColorStop(0.55, STAR_FADE); g.addColorStop(1, STAR_GLOW);
    return g;
  });
  ctx.beginPath(); ctx.arc(0, 0, 2.4 * r, 0, Math.PI * 2);
  ctx.fillStyle = glow; ctx.fill();
}

function asteroid(ctx: CanvasRenderingContext2D, body: Body, zoom: number): void {
  const r = body.radius;
  const shape = rockShape(body.id);
  ctx.beginPath();
  for (let i = 0; i < ROCK_VERTICES; i++) {
    const angle = (i / ROCK_VERTICES) * Math.PI * 2;
    const radius = shape.outline[i] * r;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = ROCK_BASE; ctx.fill();
  ctx.strokeStyle = ROCK_RIM; ctx.lineWidth = 1.2 / zoom; ctx.stroke();
  for (let i = 0; i < ROCK_CRATERS; i++) {
    ctx.beginPath();
    ctx.arc(shape.craters[i * 3] * r, shape.craters[i * 3 + 1] * r, shape.craters[i * 3 + 2] * r, 0, Math.PI * 2);
    ctx.fillStyle = ROCK_CRATER; ctx.fill();
    ctx.strokeStyle = ROCK_CRATER_EDGE; ctx.lineWidth = 0.8 / zoom; ctx.stroke();
  }
}

function blackHole(ctx: CanvasRenderingContext2D, body: Body, zoom: number): void {
  const r = body.radius;
  const halo = gradient(ctx, `halo:${Math.round(r * RADIUS_STEP)}`, () => {
    const g = ctx.createRadialGradient(0, 0, r, 0, 0, 1.35 * r);
    g.addColorStop(0, HOLE_HALO); g.addColorStop(0.5, HOLE_HALO); g.addColorStop(1, HOLE_HALO_OUT);
    return g;
  });
  ctx.beginPath(); ctx.arc(0, 0, 1.35 * r, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
  // The capture disc is the hazard, so it is painted exactly as before: same radius, same
  // flat VOID, nothing overlapping it. Only the rings outside it were added.
  disc(ctx, body.captureRadius ?? r, VOID);
  ring(ctx, 1.06 * r, PHOTON_RING, 1.4, zoom);
}

function station(ctx: CanvasRenderingContext2D, body: Body, zoom: number): void {
  disc(ctx, body.radius, STATION_FILL);
  ring(ctx, body.radius, STATION, 3, zoom);
  ctx.fillStyle = STATION_SOFT; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('空间港 · 低速抵达', 0, body.radius + 26);
}

function wormhole(ctx: CanvasRenderingContext2D, body: Body, zoom: number): void {
  ring(ctx, body.radius, STATION, 3, zoom);
  ring(ctx, 0.62 * body.radius, WORMHOLE_INNER, 1.5, zoom);
  ctx.fillStyle = STATION_SOFT; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('虫洞', 0, body.radius + 26);
}

function ship(ctx: CanvasRenderingContext2D, body: Body, zoom: number): void {
  ctx.rotate(Math.atan2(body.velocity.y, body.velocity.x));
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath();
  ctx.fillStyle = SHIP_HULL; ctx.fill();
  ctx.strokeStyle = SHIP_EDGE; ctx.lineWidth = 1 / zoom; ctx.stroke();
}

/** One celestial body, in world space.
 *
 * Draws around the origin so the cached gradients stay position independent. `zoom` divides
 * the line widths exactly as canvas.ts did before the body branch moved here -- including
 * the fact that the station and wormhole branches leave a 3/zoom lineWidth behind for
 * whatever draws next. That leak is pre-existing and preserved deliberately: tightening it
 * here would silently move the map panel's border width, which is a change the baseline
 * comparison is meant to catch, not smuggle in. */
export function drawBody(ctx: CanvasRenderingContext2D, body: Body, camera: Camera): void {
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  switch (body.kind) {
    case 'ship': ship(ctx, body, camera.zoom); break;
    case 'station': station(ctx, body, camera.zoom); break;
    case 'wormhole': wormhole(ctx, body, camera.zoom); break;
    case 'planet': planet(ctx, body.radius); break;
    case 'star': star(ctx, body.radius); break;
    case 'asteroid': asteroid(ctx, body, camera.zoom); break;
    case 'black_hole': blackHole(ctx, body, camera.zoom); break;
  }
  ctx.restore();
}
