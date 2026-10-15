import type { GameState } from '../game/types';
import { fieldAcceleration } from '../physics/fields';
import { length } from '../physics/vector';
export function movementTelemetry(game: GameState): string {
  const ship=game.bodies.find(b=>b.kind==='ship')!;
  return game.players.map((p,i)=>{
    const force=p.active ? fieldAcceleration(ship.position,p.position,p.field) : {x:0,y:0};
    return 'P'+(i+1)+' 位置 ('+p.position.x.toFixed(1)+','+p.position.y.toFixed(1)+') 速度 ('+p.velocity.x.toFixed(1)+','+p.velocity.y.toFixed(1)+') |v|='+length(p.velocity).toFixed(1)
      +' | 力场 '+(p.active?'开':'关')+' 源强度='+p.field.strength+' 对飞船 |a|='+length(force).toFixed(3);
  }).join('\n')+'\n飞船速度='+length(ship.velocity).toFixed(2)+' 完成/运行时间='+game.elapsed.toFixed(2)+'s 航程='+game.distance.toFixed(1)
    +'\n稳定机制='+(game.level.stabilizationEnabled===false?'关闭（纯惯性对照）':'开启')+' '+game.bodies.filter(b=>b.stabilization).map(b=>b.id+': 半衰期 '+b.stabilization!.halfLife+'s 扰动速度 '+length(b.stabilizationState?.playerVelocity ?? {x:0,y:0}).toFixed(2)).join(' | ');
}
