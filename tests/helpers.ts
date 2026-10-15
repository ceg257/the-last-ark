import { stepGame } from '../src/game/game';
import type { GameState } from '../src/game/types';
import { NO_CONTROLS } from '../src/game/types';
import { createControls } from '../src/input/intent';
import type { Vec2 } from '../src/physics/vector';
export const fieldControls = (fields: [boolean, boolean]) => createControls({ abilityActive: fields[0] }, { abilityActive: fields[1] });
/** Test pilot: normal directional inputs with anticipatory braking, no teleportation. */
export function positionPlayer(game: GameState, index: 0 | 1, target: Vec2): void {
  for (const axis of ['x','y'] as const) {
    let arrived=false;
    for(let i=0;i<2000;i++) {
      const player=game.players[index], delta=target[axis]-player.position[axis], velocity=player.velocity[axis];
      if(Math.abs(delta)<=1 && Math.abs(velocity)<0.1){arrived=true;break;}
      const stoppingDistance=velocity**2/(2*player.braking);
      const direction=delta*velocity<0 || Math.abs(delta)>stoppingDistance+Math.max(Math.abs(velocity)/60,0.2) ? Math.sign(delta) : 0;
      const intent = { [axis === 'x' ? 'moveX' : 'moveY']: direction };
      const controls = index === 0 ? createControls(intent) : createControls({}, intent);
      stepGame(game,controls);
    }
    if(!arrived)throw new Error('Test pilot could not settle at target');
  }
  for(let i=0;i<40;i++)stepGame(game,NO_CONTROLS);
}
