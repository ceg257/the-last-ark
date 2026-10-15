import type { SceneRegistry } from '../scenes/types';
import { cooperationLevel } from '../levels/cooperation';
/** Called ONLY in Vite development mode. Values become level config, so forecasts
 * and checkpoints use exactly the same settings. No runtime physics monkey patching.
 */
export function developmentRegistry(base: SceneRegistry, search: string): SceneRegistry {
  const params = new URLSearchParams(search), result = structuredClone(base);
  if (params.get('dev') !== '1') return result;
  result.coop_test = {id:'coop_test',name:'开发合作测试',status:'available',level:structuredClone(cooperationLevel)};
  const number = (key: string, min: number, max: number): number | undefined => {
    const raw=params.get(key);if(raw===null || raw.trim()==='') return;
    const value=Number(raw);return Number.isFinite(value) && value>=min && value<=max ? value : undefined;
  };
  for(const scene of Object.values(result)) if(scene.level) {
    scene.level.stabilizationEnabled=params.get('stabilization')!=='off';
    for(const body of scene.level.bodies) if(body.stabilization) {
      body.stabilization.halfLife=number('halfLife.'+body.id,0.1,30) ?? body.stabilization.halfLife;
    }
    for(const player of scene.level.players) {
      player.speed=number('moveSpeed',30,1000) ?? player.speed;
      player.acceleration=number('moveAcceleration',10,10000) ?? player.acceleration;
      player.braking=number('moveBraking',10,10000) ?? player.braking;
    }
  }
  return result;
}
