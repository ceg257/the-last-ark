import { describe, expect, it } from 'vitest';
import { capabilities, createBody, ENTITY_DEFAULTS } from '../src/game/entities';
import { createGame, stepGame, togglePause } from '../src/game/game';
import { firstLevel } from '../src/levels/first';
import { NO_CONTROLS } from '../src/game/types';
import { integrate } from '../src/physics/world';
import { SpatialIndex } from '../src/world/spatial-index';
import { circleBounds } from '../src/world/geometry';
import { sectorAt, sectorSeed, seededRandom, planSectors } from '../src/world/sectors';
import { FixedClock } from '../src/game/clock';

describe('entity capabilities and local world simulation',()=>{
  it('defines all eight entity types with configurable independent capabilities',()=>{
    expect(Object.keys(ENTITY_DEFAULTS).sort()).toEqual(['ship','player','asteroid','planet','star','black_hole','station','wormhole'].sort());
    const source=createBody({id:'custom',kind:'asteroid',radius:20,position:{x:0,y:0},motion:'static',emitsGravity:true,collision:'none'});
    expect(capabilities(source)).toMatchObject({motion:'static',gravity:true,collision:'none'});
  });
  it('pushes a star weakly but keeps the black hole fixed even with a preset velocity',()=>{
    const star=createBody({id:'sun',kind:'star',radius:65,position:{x:550,y:340}});
    const hole=createBody({id:'hole',kind:'black_hole',radius:65,position:{x:550,y:340},velocity:{x:20,y:0},affectedByFields:true,response:1});
    const players=structuredClone(firstLevel.players); players[0].position={x:450,y:340}; players[0].active=true;
    for(let i=0;i<120;i++){integrate([star],players,1/60);integrate([hole],players,1/60);}
    expect(star.position.x).toBeLessThan(548); expect(star.position.x).toBeGreaterThan(530);
    expect(hole.position).toEqual({x:550,y:340});
  });
  it('background and trigger entities never attract, move or cause a fatal collision',()=>{
    const g=createGame(firstLevel); g.bodies=g.bodies.filter(b=>b.kind==='ship');
    const ship=g.bodies[0]; const initial={...ship.velocity};
    g.bodies.push(createBody({id:'background',kind:'star',radius:1000,position:{...ship.position},layer:'background',velocity:{x:100,y:0}}));
    for(const kind of ['station','wormhole'] as const) g.bodies.push(createBody({id:kind,kind,radius:60,position:{...ship.position}}));
    togglePause(g); stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe('running'); expect(ship.velocity).toEqual(initial);
    expect(g.bodies[1].position).toEqual(firstLevel.bodies[0].position);
  });
  it('keeps offscreen rocks and ships alive, and still applies offscreen gravity',()=>{
    const g=createGame(firstLevel); g.bodies=g.bodies.filter(b=>b.kind==='ship'||b.kind==='planet');
    g.bodies[0].position={x:10000,y:-10000};g.bodies[0].velocity={x:0,y:0};g.bodies[1].position={x:10100,y:-10000};
    g.bodies.push(createBody({id:'far-rock',kind:'asteroid',radius:18,position:{x:-10000,y:10000}}));
    togglePause(g);stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe('running');expect(g.bodies[0].velocity.x).toBeGreaterThan(0);expect(g.bodies).toHaveLength(3);
  });
  it('queries sparse local gravity rather than all celestial pairs',()=>{
    const bodies=Array.from({length:1000},(_,i)=>createBody({id:String(i),kind:'asteroid',radius:10,position:{x:i*1000,y:0}}));
    expect(integrate(bodies,[],1/60).candidatePairs).toBe(0);
    bodies[1].position.x=50;expect(integrate(bodies,[],1/60).candidatePairs).toBe(4);
  });
  it('spatial queries handle negative coordinates, huge fields, stable order and invalid input',()=>{
    const index=new SpatialIndex<string>();
    index.insert('big',circleBounds({x:0,y:0},1000000));index.insert('small',circleBounds({x:-500,y:-500},20));
    expect(index.query(circleBounds({x:-500,y:-500},0))).toEqual(['big','small']);
    expect(index.query(circleBounds({x:0,y:0},1e12))).toEqual(['big','small']);
    index.insert('bad',circleBounds({x:Infinity,y:0},10));
    expect(index.query(circleBounds({x:NaN,y:0},0))).toEqual([]);
  });
  it('permits resetting the fixed clock from a scene transition callback',()=>{
    const clock=new FixedClock();expect(clock.advance(0.25,()=>clock.reset())).toBe(1);
    expect(clock.advance(1/60,()=>{})).toBe(1);
  });
});
describe('deterministic sector extension points',()=>{
  it('assigns negative world positions to floor-based sectors',()=>{
    expect(sectorAt({x:-1,y:2048})).toEqual({x:-1,y:1});
  });
  it('repeats random sequences by sector seed independently of load order',()=>{
    const seed=sectorSeed(2401,{x:-5,y:12}), a=seededRandom(seed),b=seededRandom(seed);
    sectorSeed(2401,{x:500,y:1});
    expect(Array.from({length:100},a)).toEqual(Array.from({length:100},b));
    expect(seed).not.toBe(sectorSeed(2401,{x:12,y:-5}));expect(seed).not.toBe(sectorSeed(2402,{x:-5,y:12}));
  });
  it('bounds demand around ship and separated players without using any viewport',()=>{
    const foci=[{x:0,y:0},{x:50000,y:0},{x:0,y:-50000}], keys=planSectors(foci);
    expect(keys).toHaveLength(27);for(const p of foci) expect(keys).toContainEqual(sectorAt(p));
    expect(planSectors(foci,3)).toHaveLength(3);expect(planSectors(foci,0)).toEqual([]);
    expect(planSectors([{x:0,y:0},{x:10,y:10}])).toHaveLength(9);
  });
});
