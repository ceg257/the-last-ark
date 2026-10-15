import { createGame, retryGame, stepGame, togglePause } from '../game/game';
import type { Controls, GameState } from '../game/types';
import type { SceneId, SceneRegistry } from './types';
import { scenes } from './registry';
/** Scene identity and simulation phase are independent; planned scenes cannot run. */
export class SceneController {
  scene: SceneId = 'title';
  game?: GameState;
  revision = 0;
  notice = '';
  constructor(readonly registry: SceneRegistry = scenes) {}
  enter(id: SceneId): boolean {
    const scene = this.registry[id];
    if (!scene || scene.status !== 'available' || (id !== 'title' && !scene.level)) {
      this.notice = '该场景尚在规划中'; return false;
    }
    this.game = scene.level ? createGame(scene.level) : undefined;
    this.scene = id; this.notice = ''; this.revision++; return true;
  }
  toggle(): void { if (this.scene === 'title') this.enter('prototype'); else if (this.game) togglePause(this.game); }
  retry(fromStart = false): void {
    if (!this.game) return;
    this.game = fromStart ? createGame(this.game.level) : retryGame(this.game); this.revision++;
  }
  step(input: Controls): void {
    if (!this.game) return;
    stepGame(this.game, input);
    const next = this.game.pendingScene;
    if (next) { delete this.game.pendingScene; if (!this.enter(next)) this.game.message = this.notice; }
  }
}
