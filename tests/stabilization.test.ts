import { describe,expect,it } from 'vitest';
import { createBody } from '../src/game/entities';
import { integrate } from '../src/physics/world';
import { stabilize } from '../src/physics/stabilization';
import { bodyGravity } from '../src/physics/gravity';
import { fieldAcceleration } from '../src/physics/fields';
import { length,sub } from '../src/physics/vector';
import { firstLevel } from '../src/levels/first';
import { createGame,stepGame,togglePause,retryGame,saveCheckpoint } from '../src/game/game';
import { NO_CONTROLS } from '../src/game/types';
import { predictTrajectory } from '../src/game/trajectory';
import { developmentRegistry } from '../src/debug/config';
import { scenes } from '../src/scenes/registry';

const rock=()=>createBody({id:'rock',kind:'asteroid',radius:18,position:{x:100,y:0},stabilization:{halfLife:1,rampSeconds:0,sleepSpeed:0}});
describe('selective celestial stabilization',()=>{
  it('integrates exponential onset consistently across physics substeps',()=>{
    const run=(dt:number)=>{const b=rock();b.stabilization={halfLife:1.2,rampSeconds:0.25,sleepSpeed:0};b.velocity={x:107,y:3};b.stabilizationState={playerVelocity:{x:100,y:0},idleTime:0};
      for(let i=0;i<3/dt;i++)stabilize(b,false,dt,true);return b.velocity;};
    expect(run(1/60).x).toBeCloseTo(run(1/120).x,9);expect(run(1/30).x).toBeCloseTo(run(1/60).x,9);expect(run(1/60).y).toBe(3);
  });
  it('allows the blue field to do positive or negative work on the ship',()=>{
    const players=structuredClone(firstLevel.players);players[0].position={x:0,y:0};players[0].active=true;
    const approaching=createBody({id:'ship',kind:'ship',radius:8,position:{x:100,y:0},velocity:{x:-40,y:0}});
    const departing={...structuredClone(approaching),velocity:{x:40,y:0}};
    for(let i=0;i<6;i++){integrate([approaching],players,1/60);integrate([departing],players,1/60);}
    expect(length(approaching.velocity)).toBeGreaterThan(40);expect(length(departing.velocity)).toBeLessThan(40);
  });
  it.each([0.8,1,1.2,1.5])('halves only the player disturbance after %s seconds',halfLife=>{
    const body=rock();body.stabilization!.halfLife=halfLife;body.velocity={x:110,y:20};
    body.stabilizationState={playerVelocity:{x:100,y:0},idleTime:0};
    for(let i=0;i<halfLife*60;i++)stabilize(body,false,1/60,true);
    expect(body.velocity.x).toBeCloseTo(60,9);expect(body.velocity.y).toBe(20);
  });
  it('ramps damping on smoothly, never resets position and eventually sleeps only the disturbance',()=>{
    const body=rock();body.stabilization={halfLife:1,rampSeconds:0.25,sleepSpeed:0.03};
    body.velocity={x:100,y:0};body.stabilizationState={playerVelocity:{x:100,y:0},idleTime:0};
    integrate([body],[],1/60);const firstDelta=100-body.velocity.x;
    expect(firstDelta).toBeGreaterThan(0);expect(firstDelta).toBeLessThan(0.1);
    for(let i=0;i<1200;i++)integrate([body],[],1/60);
    expect(body.velocity.x).toBe(0);expect(body.position.x).toBeGreaterThan(200);expect(body.position.x).toBeLessThan(300);
    const position={...body.position};integrate([body],[],1/60);expect(body.position).toEqual(position);
  });
  it('does not damp while either field effectively acts, including two cancelling fields',()=>{
    const body=rock(),pure=structuredClone(body),players=structuredClone(firstLevel.players);
    players[0].position={x:0,y:0};players[1].position={x:0,y:0};players.forEach(p=>p.active=true);
    players[1].field={...players[0].field,polarity:-1};
    body.velocity={x:30,y:0};pure.velocity={x:30,y:0};
    body.stabilizationState={playerVelocity:{x:30,y:0},idleTime:10};pure.stabilizationState=structuredClone(body.stabilizationState);
    integrate([body],players,1/60,true);integrate([pure],players,1/60,false);
    expect(body.velocity).toEqual(pure.velocity);expect(body.stabilizationState!.idleTime).toBe(0);
  });
  it('an active but out-of-range field does not suppress stabilization and reentry immediately accelerates',()=>{
    const body=rock(),players=structuredClone(firstLevel.players);players[1].active=true;players[1].position={x:-10000,y:0};
    body.velocity={x:20,y:0};body.stabilizationState={playerVelocity:{x:20,y:0},idleTime:2};
    integrate([body],players,1/60);expect(body.velocity.x).toBeLessThan(20);
    players[1].position={x:body.position.x-50,y:0};const before=body.velocity.x;integrate([body],players,1/60);
    expect(body.velocity.x).toBeGreaterThan(before);expect(body.stabilizationState!.idleTime).toBe(0);
  });
  it.each(['asteroid','planet'] as const)('bounds residual drift of a pushed %s compared with pure inertia',kind=>{
    const body=createBody({id:'test',kind,radius:18,position:{x:100,y:0},stabilization:{halfLife:kind==='planet'?1.2:1}});
    const players=structuredClone(firstLevel.players);players[1].active=true;players[1].position={x:0,y:0};
    for(let i=0;i<120;i++)integrate([body],players,1/60);
    const start=body.position.x,initial=body.velocity.x,pure=structuredClone(body);players[1].active=false;
    for(let i=0;i<1200;i++){integrate([body],players,1/60);integrate([pure],players,1/60,false);}
    expect(body.velocity.x).toBeLessThan(0.03);expect(pure.velocity.x).toBeCloseTo(initial,9);
    expect(body.position.x-start).toBeLessThan(initial*2.1+1);expect(pure.position.x-body.position.x).toBeGreaterThan(initial*15);
  });
  it('preserves environmental gravity and orbital base motion instead of zeroing total velocity',()=>{
    const source=createBody({id:'sun',kind:'star',radius:65,position:{x:0,y:0},motion:'static'});
    const force=length(fieldAcceleration({x:150,y:0},source.position,bodyGravity(source))),speed=Math.sqrt(force*150);
    const orbit=createBody({id:'orbiter',kind:'planet',radius:4,position:{x:150,y:0},velocity:{x:0,y:speed},response:1,stabilization:{halfLife:0.8}});
    const a=[structuredClone(source),orbit],b=structuredClone(a);delete b[1].stabilization;
    for(let i=0;i<4800;i++){integrate(a,[],1/60);integrate(b,[],1/60);}
    expect(orbit.position).toEqual(b[1].position);expect(orbit.velocity).toEqual(b[1].velocity);
    expect(length(orbit.velocity)).toBeGreaterThan(speed*0.95);expect(length(orbit.position)).toBeCloseTo(150,1);
    orbit.velocity.x+=10;orbit.stabilizationState!.playerVelocity.x+=10;
    for(let i=0;i<600;i++)integrate(a,[],1/60);
    expect(length(orbit.stabilizationState!.playerVelocity)).toBeLessThan(0.03);
    expect(length(orbit.velocity)).toBeGreaterThan(speed*0.5);
  });
  it('never damps a ship, and allows a bound orbit around the blue field',()=>{
    const players=structuredClone(firstLevel.players);players[0].position={x:0,y:0};players[0].active=true;
    const speed=Math.sqrt(length(fieldAcceleration({x:100,y:0},{x:0,y:0},players[0].field))*100);
    const ship=createBody({id:'ship',kind:'ship',radius:8,position:{x:100,y:0},velocity:{x:0,y:speed},stabilization:{halfLife:0.1}});
    const pure=structuredClone(ship);
    for(let i=0;i<2400;i++){integrate([ship],players,1/60);integrate([pure],players,1/60,false);}
    expect(ship.velocity).toEqual(pure.velocity);expect(ship.position).toEqual(pure.position);expect(ship.stabilizationState).toBeUndefined();
    expect(length(ship.position)).toBeGreaterThan(99);expect(length(ship.position)).toBeLessThan(101);
    players[0].active=false;const speedBefore=length(ship.velocity);
    for(let i=0;i<600;i++)integrate([ship],players,1/60);
    expect(length(ship.velocity)).toBe(speedBefore);
  });
  it('retains black-hole immobility despite player forces and stabilization config',()=>{
    const hole=createBody({id:'hole',kind:'black_hole',radius:50,position:{x:100,y:0},stabilization:{halfLife:1},affectedByFields:true,response:1});
    const players=structuredClone(firstLevel.players);players[0].position={x:0,y:0};players[0].active=true;
    for(let i=0;i<600;i++)integrate([hole],players,1/60);expect(hole.position).toEqual({x:100,y:0});
  });
  it('has no velocity discontinuity when crossing a field edge',()=>{
    const body=rock(),players=structuredClone(firstLevel.players);players[0].position={x:0,y:0};players[0].active=true;
    body.position.x=279.9;body.velocity={x:20,y:0};body.stabilization={halfLife:0.8};
    body.stabilizationState={playerVelocity:{x:20,y:0},idleTime:0};
    for(let i=0;i<60;i++){const v={...body.velocity};integrate([body],players,1/60);expect(length(sub(body.velocity,v))).toBeLessThan(0.3);}
  });
  it('combines with fixed steps, pause, checkpoint and prediction without state leakage',()=>{
    const g=createGame(firstLevel);g.players[0].active=true;togglePause(g);
    for(let i=0;i<200;i++)stepGame(g,{...NO_CONTROLS,fields:[true,false]});
    saveCheckpoint(g,'forced');const snapshot=structuredClone(g);g.phase='paused';
    for(let i=0;i<100;i++)stepGame(g,NO_CONTROLS);expect(g.bodies).toEqual(snapshot.bodies);
    const restored=retryGame(g);expect(restored.bodies).toEqual(snapshot.bodies);
    const prediction=predictTrajectory(restored,2);togglePause(restored);
    for(let i=0;i<120;i++){stepGame(restored,NO_CONTROLS);if((i+1)%6===0)expect(restored.bodies[0].position).toEqual(prediction.points[(i+1)/6]);}
  });
  it('validates independent debug half-lives, pure-inertia mode and development-only access',()=>{
    const config=developmentRegistry(scenes,'?dev=1&stabilization=off&halfLife.planet=0.8&halfLife.asteroid=1.5');
    expect(config.prototype.level!.stabilizationEnabled).toBe(false);
    expect(config.prototype.level!.bodies[1].stabilization!.halfLife).toBe(0.8);expect(config.prototype.level!.bodies[2].stabilization!.halfLife).toBe(1.5);
    expect(scenes.prototype.level!.bodies[1].stabilization!.halfLife).toBe(1.2);
    expect(developmentRegistry(scenes,'?dev=1&halfLife.planet=NaN').prototype.level!.bodies[1].stabilization!.halfLife).toBe(1.2);
    expect(developmentRegistry(scenes,'?scene=coop_test').coop_test.status).toBe('planned');
  });
});
