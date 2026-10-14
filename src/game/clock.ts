import { FIXED_DT } from './game';
/** Bound catch-up to 15 steps; discard time spent in a suspended browser tab. */
export class FixedClock {
  private accumulator = 0;
  advance(seconds: number, step: () => void): number {
    if (!Number.isFinite(seconds) || seconds < 0) return 0;
    this.accumulator += Math.min(seconds, 0.25);
    let count = 0;
    while (this.accumulator + 1e-10 >= FIXED_DT) {
      step(); this.accumulator -= FIXED_DT; count++;
    }
    return count;
  }
  reset(): void { this.accumulator = 0; }
}
