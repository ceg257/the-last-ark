/** Every string that reaches fillStyle/strokeStyle lives here as a module constant.
 *
 * Draw paths never build `rgba(...)` templates or concatenate hex digits: interpolating a
 * color string per frame allocates, and the render pass runs 60 times a second. Alpha is
 * carried in the 8-digit hex form the renderer already used before this pass.
 *
 * Nothing here touches the DOM -- this module is imported by node tests. */
export const BG = '#0c1220';

// Player node identity. docs/GAME_DESIGN.md:147 fixes blue = attractor, gold = repulsor.
export const ATTRACT = '#409eff';
export const REPEL = '#e9bd48';

export const PLANET_LIT = '#a583cc';
export const PLANET_BASE = '#8f69b9';
export const PLANET_DARK = '#3b2b52';
export const ROCK_BASE = '#8993a3';
export const ROCK_CRATER = '#6f7885';
export const ROCK_RIM = '#aab3c0';
export const STATION = '#64d98b';
export const STATION_SOFT = '#9de3b3';
export const STAR_CORE = '#fff6d8';
export const STAR_MID = '#f0cf7a';
export const VOID = '#110a22';
export const SHIP_HULL = '#ffffff';
export const TEXT = '#e5eaf4';
export const TEXT_DIM = '#92a0b3';

/** Pre-existing UI colors, gathered so canvas.ts stops carrying literals. */
export const TRAJECTORY_OK = '#b5c8e0';
export const TRAJECTORY_FAILED = '#ed9b9b';
export const TRAJECTORY_DONE = '#64d98b';
export const HUD_WARN = '#ff9a9a';
export const HUD_TEXT = '#c4cede';
export const PANEL_FILL = '#060b14e6';
export const PANEL_EDGE = '#48566b';
export const PANEL_VIEW = '#8e9bab';

/** Field visuals. Alpha rises inward: the rings get denser toward the rim, and the
 * opacity gradient follows so the innermost reads as the strongest.
 *
 * There is deliberately no full-radius fill here. A flat disc at the field's whole radius
 * reads as one large pale circle rather than as a field, and it was the single biggest
 * shape on screen whenever a player field was on. The rings carry the same information
 * about extent at a fraction of the ink. */
export const ATTRACT_RINGS = ['#409eff1f', '#409eff33', '#409eff47'] as const;
export const ATTRACT_EDGE = '#409eff61';
export const ATTRACT_PENDING = '#409eff1a';
export const REPEL_RINGS = ['#e9bd481f', '#e9bd4833', '#e9bd4847'] as const;
export const REPEL_EDGE = '#e9bd4861';
export const REPEL_PENDING = '#e9bd481a';
/** The pre-effects field circles, retained only for fx=off so that setting stays
 * pixel-identical to the build before this pass -- it is the A/B baseline and the bisect
 * tool, and that only works if nothing about it moves. Deliberately different alphas from
 * ATTRACT_FILL/EDGE above. */
export const LEGACY_ATTRACT_FILL = '#409eff12';
export const LEGACY_ATTRACT_EDGE = '#409eff70';
export const LEGACY_REPEL_FILL = '#e9bd4812';
export const LEGACY_REPEL_EDGE = '#e9bd4870';

/** Celestial fields are not controllable, so they stay neutral AND a step dimmer than the
 * player's own two, which must be distinguishable at a glance from the ones they cannot
 * steer. They carry the same three taper rings, though -- a single bare ring the width of
 * the viewport reads as an unexplained circle rather than as a gravity well. */
export const CELESTIAL_RINGS = ['#92a0b314', '#92a0b321', '#92a0b32e'] as const;
export const CELESTIAL_EDGE = '#92a0b352';
/** Net-force arrow on the ship, drawn in screen space. Neutral so it reads against both the
 * blue and the gold field it is usually over. */
export const NET_FORCE = '#e5eaf480';

/** Celestial gradients. These are stops inside a cached CanvasGradient, so they are written
 * once per (kind, radius) bucket rather than once per body per frame. */
export const PLANET_ATMOSPHERE = '#8f69b933';
export const PLANET_ATMOSPHERE_OUT = '#8f69b900';
export const STAR_FADE = '#f0cf7a3d';
export const STAR_GLOW = '#f0cf7a00';
export const PHOTON_RING = '#b79ae04d';
export const HOLE_HALO = '#3c285a2e';
export const HOLE_HALO_OUT = '#3c285a00';
export const STATION_FILL = '#64d98b0d';
export const WORMHOLE_INNER = '#64d98b66';
export const SHIP_EDGE = '#ffffff80';
export const ROCK_CRATER_EDGE = '#5d6572';

/** Motion trails, newest first. Five buckets so a tapered stroke costs five `stroke()`
 * calls regardless of how many points the trail holds. */
export const SHIP_TRAIL = ['#cfe2ff4d', '#cfe2ff3d', '#cfe2ff2e', '#cfe2ff1f', '#cfe2ff0f'] as const;
export const ATTRACT_TRAIL = ['#409eff8c', '#409eff70', '#409eff54', '#409eff38', '#409eff1c'] as const;
export const REPEL_TRAIL = ['#e9bd488c', '#e9bd4870', '#e9bd4854', '#e9bd4838', '#e9bd481c'] as const;

/** Star colors by depth layer, then brightness bucket. Far layers are dimmer overall so
 * depth reads as distance rather than as a brightness lottery. */
export const STAR_BUCKETS: readonly (readonly [string, string, string])[] = [
  ['#3a4761', '#55668a', '#7c8fb5'],
  ['#4a5a78', '#6f83a6', '#a3b6d4'],
  ['#66799a', '#9db0cc', '#e6eefb'],
];
