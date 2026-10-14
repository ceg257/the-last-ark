import type { Controls } from '../game/types';
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'KeyR']);
export class Keyboard {
  readonly pressed = new Set<string>();
  constructor(private onAction: (action: 'toggle' | 'reset' | 'blur') => void) {}
  keyDown(code: string, repeat = false): boolean {
    if (!GAME_KEYS.has(code)) return false;
    const wasPressed = this.pressed.has(code);
    this.pressed.add(code);
    if (!repeat && !wasPressed) {
      if (code === 'Space') this.onAction('toggle');
      if (code === 'KeyR') this.onAction('reset');
    }
    return true;
  }
  keyUp(code: string): boolean { this.pressed.delete(code); return GAME_KEYS.has(code); }
  clear(): void { this.pressed.clear(); }
  read(): Controls {
    const axis = (positive: string, negative: string) => Number(this.pressed.has(positive)) - Number(this.pressed.has(negative));
    return { movement: [{ x: axis('KeyD', 'KeyA'), y: axis('KeyS', 'KeyW') }, { x: axis('ArrowRight', 'ArrowLeft'), y: axis('ArrowDown', 'ArrowUp') }], fields: [this.pressed.has('KeyF'), this.pressed.has('Enter')] };
  }
  attach(target: Window): () => void {
    const down = (event: KeyboardEvent) => { if (this.keyDown(event.code, event.repeat)) event.preventDefault(); };
    const up = (event: KeyboardEvent) => { if (this.keyUp(event.code)) event.preventDefault(); };
    const blur = () => { this.clear(); this.onAction('blur'); };
    const visibility = () => { if (target.document.hidden) blur(); };
    target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur); target.document.addEventListener('visibilitychange', visibility);
    return () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); target.document.removeEventListener('visibilitychange', visibility); this.clear(); };
  }
}
