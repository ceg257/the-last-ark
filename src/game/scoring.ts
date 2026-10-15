import type { GameState } from './types';
export function efficiency(game: GameState): { seconds: number; distance: number; stars?: number } | undefined {
  if (game.phase !== 'completed') return;
  const thresholds = game.level.mode === 'exploration' ? undefined : game.level.scoring;
  return { seconds: game.elapsed, distance: game.distance, stars: thresholds
    ? game.elapsed <= thresholds.threeStarsSeconds ? 3 : game.elapsed <= thresholds.twoStarsSeconds ? 2 : 1 : undefined };
}
