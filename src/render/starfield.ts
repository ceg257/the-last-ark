import type { Camera } from '../camera/camera';
import { seededRandom } from '../world/sectors';
import { STAR_BUCKETS } from './palette';
import type { QualitySpec } from './scene-visuals';

/** Per-depth-layer shape. `tileScale` is deliberately inverse to `share`: the far layer
 * carries the most stars, so it gets the largest tile and therefore the fewest repeats.
 * Every layer using one tile size would make the lattice's repetition legible while
 * flying; desynchronising them hides it. */
const LAYERS = [
  { parallax: 0.14, size: 1, share: 0.45, tileScale: 2.2 },
  { parallax: 0.34, size: 1, share: 0.33, tileScale: 1.6 },
  { parallax: 0.68, size: 2, share: 0.22, tileScale: 1.0 },
] as const;
/** Most stars are faint: brightness variation should read as depth, not as confetti. */
const BUCKET_CUTS = [0.6, 0.9] as const;

export interface StarLayer {
  parallax: number;
  tileScale: number;
  /** Star size in CSS pixels. Never scaled by zoom -- these are screen-space points. */
  size: number;
  /** Interleaved [x0,y0,x1,y1,...] normalized to [0,1): exactly one lattice tile's worth,
   * sorted by brightness bucket. */
  stars: Float32Array;
  /** Bucket `b` occupies `[bucketStart[b], bucketStart[b + 1])`. Always length 4. */
  bucketStart: Int32Array;
}

export interface Starfield { seed: number; count: number; layers: StarLayer[] }

function buildLayer(random: () => number, count: number): Pick<StarLayer, 'stars' | 'bucketStart'> {
  const stars = new Float32Array(count * 2);
  const bucketStart = new Int32Array(4);
  if (count === 0) return { stars, bucketStart };
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const bucket = new Uint8Array(count);
  const buckets = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    // mulberry32 returns a value in [0,1), so every coordinate is strictly below 1.
    xs[i] = random(); ys[i] = random();
    const roll = random();
    const b = roll < BUCKET_CUTS[0] ? 0 : roll < BUCKET_CUTS[1] ? 1 : 2;
    bucket[i] = b; buckets[b]++;
  }
  // Pre-sorting by bucket is what lets the draw loop be one straight run per bucket with
  // no per-star branch -- the thing that keeps the cost independent of star count.
  bucketStart[0] = 0; bucketStart[1] = buckets[0]; bucketStart[2] = buckets[0] + buckets[1]; bucketStart[3] = count;
  const cursor = [0, buckets[0], buckets[0] + buckets[1]];
  for (let i = 0; i < count; i++) {
    const slot = cursor[bucket[i]]++;
    stars[slot * 2] = xs[i]; stars[slot * 2 + 1] = ys[i];
  }
  return { stars, bucketStart };
}

/** Deterministic: same seed and quality always produce the same field. Purely render
 * state -- the starfield is never an entity, never simulated, never collided against. */
export function createStarfield(seed: number, spec: QualitySpec): Starfield {
  const random = seededRandom(seed);
  const layers: StarLayer[] = [];
  let count = 0;
  for (const shape of LAYERS) {
    const stars = Math.round(spec.stars * shape.share);
    count += stars;
    layers.push({ parallax: shape.parallax, tileScale: shape.tileScale, size: shape.size, ...buildLayer(random, stars) });
  }
  return { seed, count, layers };
}

/** Drawn in screen space, before the world transform. Each layer's offset is
 * `camera.position * zoom * parallax`, so parallax stays exact at every zoom level and
 * near stars surge when zooming -- correct depth behaviour, not an artefact.
 *
 * There is no wrap-around: the tile index range is derived from the viewport, so it always
 * covers it exactly. Stars therefore never pop, and the field is infinite by construction --
 * the ship can fly past `mapBounds` forever.
 *
 * Cost is one path fill per (layer, bucket) pair -- nine fills at most, whatever the star
 * count. If the frame-time check shows this path expensive, swapping `ctx.rect` for
 * `ctx.fillRect` (one style set per bucket, no path built) is a contained change here. */
export function drawStarfield(ctx: CanvasRenderingContext2D, camera: Camera, field: Starfield, drift: number): void {
  if (field.count === 0) return;
  const base = Math.max(camera.width, camera.height) / 2;
  if (!(base > 0)) return;
  for (let depth = 0; depth < field.layers.length; depth++) {
    const layer = field.layers[depth];
    if (layer.stars.length === 0) continue;
    const tile = base * layer.tileScale;
    const scale = camera.zoom * layer.parallax;
    const ox = -camera.position.x * scale + camera.width / 2 + drift * layer.parallax;
    const oy = -camera.position.y * scale + camera.height / 2;
    const firstI = Math.floor(-ox / tile), lastI = Math.floor((camera.width - ox) / tile);
    const firstJ = Math.floor(-oy / tile), lastJ = Math.floor((camera.height - oy) / tile);
    const colors = STAR_BUCKETS[depth];
    for (let b = 0; b < colors.length; b++) {
      const from = layer.bucketStart[b], to = layer.bucketStart[b + 1];
      if (from === to) continue;
      ctx.fillStyle = colors[b];
      ctx.beginPath();
      for (let i = firstI; i <= lastI; i++) {
        const bx = ox + i * tile;
        for (let j = firstJ; j <= lastJ; j++) {
          const by = oy + j * tile;
          for (let k = from; k < to; k++) {
            ctx.rect(bx + layer.stars[k * 2] * tile, by + layer.stars[k * 2 + 1] * tile, layer.size, layer.size);
          }
        }
      }
      ctx.fill();
    }
  }
}
