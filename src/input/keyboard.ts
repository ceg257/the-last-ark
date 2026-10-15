import type { Controls, PlayerControlIntent, PlayerIndex } from './intent';
import type { PlayerInputSource } from './sources';
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'KeyR', 'Escape', 'Minus', 'Equal', 'Digit0']);
const CHANNEL_KEYS = [
  ['KeyD', 'KeyA', 'KeyS', 'KeyW', 'KeyF'],
  ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter'],
] as const;
type Action = 'toggle' | 'reset' | 'restart' | 'blur' | 'title' | 'zoom-in' | 'zoom-out' | 'zoom-reset';
export class Keyboard {
  readonly pressed = new Set<string>();
  private fields: [boolean, boolean] = [false, false];
  private channels: [PlayerInputSource, PlayerInputSource] = [this.channel(0), this.channel(1)];
  constructor(private onAction: (action: Action) => void) {}
  keyDown(code: string, repeat = false, shift = false): boolean {
    if (!GAME_KEYS.has(code)) return false;
    const wasPressed = this.pressed.has(code);
    this.pressed.add(code);
    if (!repeat && !wasPressed) {
      if (code === 'KeyF') this.fields[0] = !this.fields[0];
      if (code === 'Enter') this.fields[1] = !this.fields[1];
      if (code === 'Space') this.onAction('toggle');
      if (code === 'KeyR') { this.clear(); this.pressed.add(code); this.onAction(shift ? 'restart' : 'reset'); }
      if (code === 'Escape') this.onAction('title');
      if (code === 'Minus') this.onAction('zoom-out');
      if (code === 'Equal') this.onAction('zoom-in');
      if (code === 'Digit0') this.onAction('zoom-reset');
    }
    return true;
  }
  keyUp(code: string): boolean { this.pressed.delete(code); return GAME_KEYS.has(code); }
  /** Focus loss clears movement keys only; deliberate field toggles survive pause. */
  releaseKeys(): void { this.pressed.clear(); }
  clear(): void { this.releaseKeys(); this.fields = [false, false]; }
  private readPlayer(index: PlayerIndex): PlayerControlIntent {
    const axis = (positive: string, negative: string) => Number(this.pressed.has(positive)) - Number(this.pressed.has(negative));
    const [right, left, down, up] = CHANNEL_KEYS[index];
    return { moveX: axis(right, left), moveY: axis(down, up), abilityActive: this.fields[index] };
  }
  private channel(index: PlayerIndex): PlayerInputSource {
    const releaseMovement = () => CHANNEL_KEYS[index].slice(0, 4).forEach(key => this.pressed.delete(key));
    return {
      read: () => this.readPlayer(index), releaseMovement,
      reset: () => { releaseMovement(); this.pressed.delete(CHANNEL_KEYS[index][4]); this.fields[index] = false; },
    };
  }
  source(index: PlayerIndex): PlayerInputSource { return this.channels[index]; }
  read(): Controls { return { players: [this.readPlayer(0), this.readPlayer(1)] }; }
  attach(target: Window): () => void {
    const down = (event: KeyboardEvent) => { if (this.keyDown(event.code, event.repeat, event.shiftKey)) event.preventDefault(); };
    const up = (event: KeyboardEvent) => { if (this.keyUp(event.code)) event.preventDefault(); };
    const blur = () => { this.releaseKeys(); this.onAction('blur'); };
    const visibility = () => { if (target.document.hidden) blur(); };
    target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur); target.document.addEventListener('visibilitychange', visibility);
    return () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); target.document.removeEventListener('visibilitychange', visibility); this.clear(); };
  }
}
