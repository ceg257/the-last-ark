import { copyIntent } from './intent';
import type { Controls, PlayerControlIntent, PlayerIndex } from './intent';

/** An adapter owns device state, not game entities. Hardware polling/bindings stay outside physics. */
export interface PlayerInputSource {
  read(): PlayerControlIntent;
  /** Clear movement/target on focus loss, preserving deliberate ability toggles. */
  releaseMovement(): void;
  /** Clear ALL intent on scene reset, disconnect or reassignment. */
  reset(): void;
}

export class PlayerInputs {
  private sources: [PlayerInputSource, PlayerInputSource];
  constructor(sources: [PlayerInputSource, PlayerInputSource]) {
    if (sources[0] === sources[1]) throw new Error('Each player needs an independent input channel');
    this.sources = [...sources];
  }
  setSource(player: PlayerIndex, source: PlayerInputSource): void {
    if (source === this.sources[player]) return;
    if (source === this.sources[1 - player]) throw new Error('Input channel is already assigned to the other player');
    this.sources[player].reset();
    source.reset();
    this.sources[player] = source;
  }
  read(): Controls {
    return { players: [copyIntent(this.sources[0].read()), copyIntent(this.sources[1].read())] };
  }
  releaseMovement(): void { this.sources.forEach(source => source.releaseMovement()); }
  reset(): void { this.sources.forEach(source => source.reset()); }
}
