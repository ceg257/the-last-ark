import { fieldControls } from './helpers';
import {describe,it,expect} from 'vitest';
import {movePlayer} from '../src/physics/player';
import {firstLevel} from '../src/levels/first';
import {length,sub} from '../src/physics/vector';
import {createGame,stepGame,togglePause,pause,retryGame,saveCheckpoint} from '../src/game/game';
import {NO_CONTROLS} from '../src/game/types';
import {Keyboard} from '../src/input/keyboard';
import {createControls} from '../src/input/intent';
import {FixedClock} from '../src/game/clock';
import {efficiency} from '../src/game/scoring';
import {telemetry} from '../src/render/canvas';
import {movementTelemetry} from '../src/debug/telemetry';
import {predictTrajectory} from '../src/game/trajectory';
describe('independent control-node dynamics',()=>{
  it('ramps to 260 in 0.4 seconds, brakes in 0.6 seconds and reverses without jumps',()=>{
    const p=structuredClone(firstLevel.players[0]);
    for(let i=0;i<24;i++){const before={...p.velocity};movePlayer(p,{x:1,y:0},1/60);expect(length(sub(p.velocity,before))).toBeLessThanOrEqual(p.acceleration/60+1e-9);}
    expect(p.velocity.x).toBeCloseTo(260);
    movePlayer(p,{x:-1,y:0},1/60);expect(p.velocity.x).toBeGreaterThan(240);
    for(let i=0;i<47;i++)movePlayer(p,{x:-1,y:0},1/60);expect(p.velocity.x).toBeCloseTo(-260);
    for(let i=0;i<36;i++){const before=p.velocity.x;movePlayer(p,{x:0,y:0},1/60);expect(Math.abs(p.velocity.x-before)).toBeLessThanOrEqual(p.braking/60+1e-9);}
    expect(length(p.velocity)).toBeLessThan(1e-8);
  });
  it('normalizes diagonal input and keeps both skills working during simultaneous movement',()=>{
    const g=createGame(firstLevel),k=new Keyboard(()=>{});g.bodies=g.bodies.filter(b=>b.kind==='ship');
    g.bodies[0].position={x:450,y:300};g.bodies[0].velocity={x:0,y:0};
    const inactive=structuredClone(g);togglePause(g);togglePause(inactive);
    for(const key of ['KeyD','KeyS','ArrowLeft','ArrowUp','KeyF','Enter'])k.keyDown(key);
    for(let i=0;i<24;i++){const input=k.read();stepGame(g,input);stepGame(inactive,createControls({...input.players[0],abilityActive:false},{...input.players[1],abilityActive:false}));}
    expect(length(g.players[0].velocity)).toBeCloseTo(260);expect(length(g.players[1].velocity)).toBeCloseTo(260);
    expect(g.players.map(p=>p.position)).toEqual(inactive.players.map(p=>p.position));
    expect(g.players.every(p=>p.active)).toBe(true);expect(g.bodies[0].velocity).not.toEqual(inactive.bodies[0].velocity);
    k.keyDown('KeyF',true);k.keyDown('Enter',true);expect(k.read().players.map(p => p.abilityActive)).toEqual([true,true]);
  });
  it('accelerates/brakes identically at different render rates',()=>{
    const results=[30,60,144].map(fps=>{
      const g=createGame(firstLevel),clock=new FixedClock();
      for(let second=0;second<4;second++)for(let i=0;i<fps;i++)clock.advance(1/fps,()=>stepGame(g,second<2?createControls({moveX:1,moveY:1},{moveX:-1}):NO_CONTROLS));
      return g;
    });
    expect(results[0]).toEqual(results[1]);expect(results[1]).toEqual(results[2]);
  });
  it('predicts existing node inertia and braking with exactly the live rules',()=>{
    const g=createGame(firstLevel);g.players[0].active=true;g.players[0].velocity={x:80,y:30};
    const prediction=predictTrajectory(g,3);togglePause(g);
    for(let i=0;i<180;i++){stepGame(g,fieldControls([true,false]));if((i+1)%6===0)expect(g.bodies[0].position).toEqual(prediction.points[(i+1)/6]);}
    expect(length(g.players[0].velocity)).toBe(0);
  });
  it('shows positions, velocities, actual field acceleration and elapsed time only as telemetry',()=>{
    const g=createGame(firstLevel),before=structuredClone(g);const text=movementTelemetry(g);
    expect(text).toContain('P1 位置');expect(text).toContain('P2 位置');expect(text).toContain('速度');expect(text).toContain('对飞船 |a|');expect(text).toContain('时间=0.00');
    expect(g).toEqual(before);
  });
});
describe('optional level efficiency',()=>{
  it('accumulates actual curved path length, excludes planning and restores checkpoint progress',()=>{
    const g=createGame(firstLevel);g.bodies=g.bodies.filter(b=>b.kind==='ship');togglePause(g);
    let sum=0;
    for(let i=0;i<180;i++){const before={...g.bodies[0].position};stepGame(g,fieldControls([true,false]));sum+=length(sub(g.bodies[0].position,before));}
    expect(g.distance).toBe(sum);expect(sum).toBeGreaterThan(length(sub(g.bodies[0].position,firstLevel.bodies[0].position)));
    pause(g);const distance=g.distance,time=g.elapsed;for(let i=0;i<60;i++)stepGame(g,NO_CONTROLS);
    expect(g.distance).toBe(distance);expect(g.elapsed).toBe(time);saveCheckpoint(g,'score');
    g.distance+=100;g.elapsed+=10;const restored=retryGame(g);expect(restored.distance).toBe(distance);expect(restored.elapsed).toBe(time);
  });
  it.each([[18,3],[18.01,2],[30,2],[30.01,1],[9999,1]])('rates completion time %s without ever imposing a deadline',(time,stars)=>{
    const g=createGame(firstLevel);g.elapsed=time;g.distance=1234.5;
    expect(efficiency(g)).toBeUndefined();g.phase='completed';
    expect(efficiency(g)).toEqual({seconds:time,distance:1234.5,stars});expect(telemetry(g)).toContain('航程 1234.5');
    const slow=createGame(firstLevel);slow.elapsed=9999;slow.bodies=slow.bodies.filter(b=>b.kind==='ship');togglePause(slow);stepGame(slow,NO_CONTROLS);expect(slow.phase).toBe('running');
  });
  it('does not give timed stars for exploration or levels without score configuration',()=>{
    const g=createGame(firstLevel);g.phase='completed';g.level.mode='exploration';expect(efficiency(g)!.stars).toBeUndefined();
    delete g.level.mode;delete g.level.scoring;expect(efficiency(g)!.stars).toBeUndefined();
  });
});
