import {describe,it,expect} from 'vitest';
import {createGame,pause,stepGame,togglePause} from '../src/game/game';
import {cooperationLevel} from '../src/levels/cooperation';
import {NO_CONTROLS} from '../src/game/types';
import {positionPlayer} from './helpers';
import {efficiency} from '../src/game/scoring';
import {predictTrajectory} from '../src/game/trajectory';
describe('development cooperation scene',()=>{
  it('uses ordinary moving physical asteroids and fails without intervention',()=>{
    const g=createGame(cooperationLevel);
    expect(g.bodies.filter(b=>b.kind==='asteroid')).toHaveLength(3);
    togglePause(g);for(let i=0;i<1200&&g.phase==='running';i++)stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe('failed');
  });
  for(const turn of [780,800,820])for(const aim of [370,400])it('reproduces cooperation with turn '+turn+' and tangent '+aim,()=>{
    const g=createGame(cooperationLevel);
    positionPlayer(g,1,{x:450,y:290});togglePause(g);
    let stage=0, p1Steps=0,p2Steps=0;
    for(let s=0;s<2400&&g.phase==='running';s++){
      const ship=g.bodies[0];
      if(stage===0&&ship.position.x>=300)stage=1;
      if(stage===1&&ship.position.x>=turn){
        pause(g);positionPlayer(g,0,{x:turn+40,y:320});positionPlayer(g,1,{x:1180,y:420});togglePause(g);stage=2;
      }
      const projected=ship.position.y+(1100-ship.position.x)*ship.velocity.y/ship.velocity.x;
      if(stage===2&&projected>=aim) {
        stage=3;
        g.players[0].active=false;g.players[1].active=true; // toggles only, no physical state mutation
        const predicted=predictTrajectory(g);
        expect(predicted.outcome).toBe('completed');
      }
      const fields:[boolean,boolean]=[stage===0||stage===2,stage===0||stage===3];
      if(fields[0])p1Steps++;if(fields[1])p2Steps++;
      stepGame(g,{...NO_CONTROLS,fields});
    }
    expect(g.phase).toBe('completed');expect(p1Steps).toBeGreaterThan(0);expect(p2Steps).toBeGreaterThan(0);
    expect(g.bodies.find(b=>b.id==='rock-a')!.position.y).toBeGreaterThan(500);
    expect(g.elapsed).toBeLessThan(19);expect(g.distance).toBeGreaterThan(900);expect(efficiency(g)!.stars).toBe(3);
  });
});
