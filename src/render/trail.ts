import type { Camera } from '../camera/camera';
import { ATTRACT_TRAIL, REPEL_TRAIL, SHIP_TRAIL } from './palette';
import type { QualitySpec } from './scene-visuals';

/** A segment longer than `spacing * TELEPORT_FACTOR` is treated as a jump, not motion --
 * a checkpoint restore lands the ship somewhere else entirely, and joining the two
 * positions would draw a line clear across the level. */
const TELEPORT_FACTOR = 8;
/** Backstop for pathological input. */
const MAX_STEPS_PER_SAMPLE = 32;
/** Player trails are shorter than the ship's; see playerTrailStyle. */
const PLAYER_TRAIL_CAPACITY = 32;

export interface Trail {
  xs: Float32Array;
  ys: Float32Array;
  /** Ring slot the next vertex goes into; once full this is also the oldest vertex. */
  head: number;
  /** Valid vertices, never above capacity. */
  count: number;
  lastX: number;
  lastY: number;
  /** Arc length travelled since the last emitted vertex. */
  carried: number;
  /** True until the first sample after a reset, so nothing is drawn from a stale origin. */
  fresh: boolean;
}

export interface TrailStyle {
  /** World units between emitted vertices. */
  spacing: number;
  capacity: number;
  /** Line width in world units, at the head and at the tail. */
  width: number;
  minWidth: number;
  /** 'lighter' for the ship's wake; 'source-over' for player nodes so P1 and P2 keep
   * their exact identity colors where their trails cross. */
  blend: GlobalCompositeOperation;
  /** Alpha buckets, newest first. Its length is the number of strokes per trail. */
  colors: readonly string[];
}

/** Sized against the ship's 240 u/s cap (physics/world.ts:11): 64 x 6 u is a 384-unit tail,
 * about 1.6 seconds at full speed. `spec.trailPoints` is 0 at fx=off, which disables it. */
export function shipTrailStyle(spec: QualitySpec): TrailStyle {
  return { spacing: 6, capacity: spec.trailPoints, width: 2.6, minWidth: 0.4, blend: 'lighter', colors: SHIP_TRAIL };
}
/** Player nodes top out at 260 u/s, so 32 x 8 u is roughly a one-second tail. Capped by
 * trailPoints rather than fixed, so fx=off leaves the frame exactly as it was. */
export function playerTrailStyle(polarity: 1 | -1, spec: QualitySpec): TrailStyle {
  return {
    spacing: 8, capacity: Math.min(PLAYER_TRAIL_CAPACITY, spec.trailPoints), width: 1.8, minWidth: 0.5,
    blend: 'source-over', colors: polarity === 1 ? ATTRACT_TRAIL : REPEL_TRAIL,
  };
}

export function createTrail(capacity: number): Trail {
  const size = Math.max(0, Math.floor(capacity));
  return { xs: new Float32Array(size), ys: new Float32Array(size), head: 0, count: 0, lastX: 0, lastY: 0, carried: 0, fresh: true };
}

export function resetTrail(trail: Trail): void {
  trail.head = 0; trail.count = 0; trail.carried = 0; trail.fresh = true;
}

function push(trail: Trail, x: number, y: number): void {
  trail.xs[trail.head] = x; trail.ys[trail.head] = y;
  trail.head = (trail.head + 1) % trail.xs.length;
  if (trail.count < trail.xs.length) trail.count++;
}

/** Ring index of the i-th newest vertex, i = 0 being the head. */
const ringIndex = (trail: Trail, i: number) => (trail.head - 1 - i + trail.xs.length * 2) % trail.xs.length;

/** Exact arc-length resampling.
 *
 * Vertices are emitted at interpolated positions on the segment, and only once the tail has
 * travelled a whole `spacing` since the last one. That makes the result depend on distance
 * travelled rather than on how often this is called: two 3-unit frames and one 6-unit frame
 * emit the same vertex, so the trail is identical at 30, 60 and 144 rendering FPS. */
export function appendTrailSample(trail: Trail, x: number, y: number, style: TrailStyle): void {
  if (trail.xs.length === 0) return;
  if (trail.fresh) { trail.lastX = x; trail.lastY = y; trail.fresh = false; return; }
  const dx = x - trail.lastX, dy = y - trail.lastY;
  const segment = Math.hypot(dx, dy);
  if (!(segment > 1e-9)) return;
  if (segment > style.spacing * TELEPORT_FACTOR) {
    resetTrail(trail); trail.lastX = x; trail.lastY = y; trail.fresh = false; return;
  }
  let since = trail.carried;
  let cursor = 0;
  let guard = 0;
  while (since + (segment - cursor) >= style.spacing && guard++ < MAX_STEPS_PER_SAMPLE) {
    cursor += style.spacing - since;
    const t = cursor / segment;
    push(trail, trail.lastX + dx * t, trail.lastY + dy * t);
    since = 0;
  }
  // Whatever is left past the last emission carries into the next call. Dropping it would
  // round every frame's motion down to a whole number of spacings and stall the tail.
  trail.carried = since + (segment - cursor);
  trail.lastX = x; trail.lastY = y;
}

/** One stroke per alpha bucket, five in all, whatever the point count. Bucket b draws the
 * vertices spanning segments [from, to), and from(b + 1) === to(b), so the buckets tile the
 * polyline without seams. */
export function drawTrail(ctx: CanvasRenderingContext2D, trail: Trail, camera: Camera, style: TrailStyle): void {
  if (trail.xs.length === 0 || trail.count < 2) return;
  const buckets = style.colors.length;
  const segments = trail.count - 1;
  ctx.save();
  ctx.globalCompositeOperation = style.blend;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * segments) / buckets);
    const to = Math.floor(((b + 1) * segments) / buckets);
    if (to <= from) continue;
    ctx.strokeStyle = style.colors[b];
    ctx.lineWidth = (style.width + (style.minWidth - style.width) * (b / (buckets - 1))) / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(trail.xs[ringIndex(trail, from)], trail.ys[ringIndex(trail, from)]);
    for (let i = from + 1; i <= to; i++) ctx.lineTo(trail.xs[ringIndex(trail, i)], trail.ys[ringIndex(trail, i)]);
    ctx.stroke();
  }
  ctx.restore();
}
