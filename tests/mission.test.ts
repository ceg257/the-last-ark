import { describe, expect, it } from 'vitest';
import { createGame, retryGame, saveCheckpoint, stepGame, togglePause } from '../src/game/game';
import { conditionMet, evaluateMission } from '../src/game/mission';
import type { Condition, Region } from '../src/game/mission';
import { firstLevel } from '../src/levels/first';
import { NO_CONTROLS } from '../src/game/types';
import { SceneController } from '../src/scenes/controller';
import { scenes } from '../src/scenes/registry';
import { createBody } from '../src/game/entities';
import { predictTrajectory } from '../src/game/trajectory';
import { Keyboard } from '../src/input/keyboard';

function fixture() {
  const g=createGame(firstLevel);
  g.bodies=g.bodies.filter(b=>b.kind==='ship'||b.kind==='station');
  g.bodies[0].position={x:0,y:0}; g.bodies[0].velocity={x:0,y:0};
  g.level.mission={objectives:[],triggers:[],completeOnObjectives:false};
  return g;
}
const circle: Region = {shape:'circle',center:{x:0,y:0},radius:20};
describe('mission conditions and checkpoints',()=>{
  it.each(['inside_region','entity_at','speed_in_region'] as const)('evaluates %s with full containment and speed constraints',type=>{
    const g=fixture(),condition: Condition={type,entityId:'ark',region:circle,fullContainment:true,maxSpeed:48};
    expect(conditionMet(g,condition,new Map())).toBe(true);
    g.bodies[0].velocity.x=48.1;expect(conditionMet(g,condition,new Map())).toBe(false);
    g.bodies[0].velocity.x=0;g.bodies[0].position.x=13;expect(conditionMet(g,condition,new Map())).toBe(false);
  });
  it.each([
    circle,
    {shape:'rect',bounds:{minX:-10,minY:-10,maxX:10,maxY:10}} as Region,
  ])('detects swept region entry even if both endpoints are outside',region=>{
    const g=fixture();g.bodies[0].position={x:100,y:0};
    expect(conditionMet(g,{type:'enter_region',entityId:'ark',region},new Map([['ark',{x:-100,y:0}]]))).toBe(true);
    expect(conditionMet(g,{type:'enter_region',entityId:'ark',region},new Map([['ark',{x:0,y:0}]]))).toBe(false);
  });
  it('does not fit a full body inside an undersized rectangular region',()=>{
    const g=fixture();
    expect(conditionMet(g,{type:'enter_region',entityId:'ark',region:{shape:'rect',bounds:{minX:-2,maxX:2,minY:-2,maxY:2}},fullContainment:true},new Map([['ark',{x:-100,y:0}]]))).toBe(false);
  });
  it('detects crossing an orbital band but not moving inside its empty center',()=>{
    const g=fixture(); const condition: Condition={type:'cross_band',entityId:'ark',region:{shape:'band',center:{x:0,y:0},innerRadius:30,outerRadius:50}};
    g.bodies[0].position={x:100,y:0};
    expect(conditionMet(g,condition,new Map([['ark',{x:-100,y:0}]]))).toBe(true);
    g.bodies[0].position={x:2,y:0};expect(conditionMet(g,condition,new Map([['ark',{x:-2,y:0}]]))).toBe(false);
  });
  it('supports a moved-body objective, dependent stage, once-only hint and checkpoint action',()=>{
    const g=fixture();
    g.bodies.push(createBody({id:'rock',kind:'asteroid',radius:2,position:{x:100,y:100},emitsGravity:false,collision:'none'}));
    g.level.mission={completeOnObjectives:false,objectives:[
      {id:'dock',label:'next',requires:['move'],condition:{type:'inside_region',entityId:'ark',region:circle}},
      {id:'move',label:'move rock',condition:{type:'entity_at',entityId:'rock',region:circle}},
    ],triggers:[{id:'hint',requires:['move'],condition:{type:'objective_complete',objectiveId:'dock'},actions:[{type:'hint',text:'stage two'},{type:'checkpoint',id:'stage-two'}]}]};
    expect(evaluateMission(g,new Map())).toBeUndefined();expect(g.mission.completedObjectives).toEqual([]);
    g.bodies[2].position={x:0,y:0};togglePause(g);stepGame(g,NO_CONTROLS);
    expect(g.mission.completedObjectives).toEqual(['move','dock']);expect(g.mission.hint).toBe('stage two');
    expect(g.checkpoint?.id).toBe('stage-two');expect(g.checkpoint?.snapshot).not.toHaveProperty('checkpoint');
    expect(evaluateMission(g,new Map())).toBeUndefined();expect(g.mission.firedTriggers).toEqual(['hint']);
    const saved=structuredClone(g.checkpoint!.snapshot);
    g.bodies[0].position.x=999;g.mission.hint='changed';g.phase='failed';
    const restored=retryGame(g);
    expect(restored.bodies).toEqual(saved.bodies);expect(restored.elapsed).toBe(saved.elapsed);
    expect(restored.mission).toEqual(saved.mission);expect(restored.phase).toBe('ready');expect(restored.players.every(p=>!p.active)).toBe(true);
    restored.bodies[0].position.x=777;expect(g.checkpoint!.snapshot.bodies[0].position.x).toBe(0);
  });
  it('supports combined conditions, missing targets and configured completion',()=>{
    const g=fixture();
    const condition: Condition={type:'all',conditions:[{type:'inside_region',entityId:'ark',region:circle},{type:'speed_in_region',entityId:'ark',region:circle,maxSpeed:1}]};
    expect(conditionMet(g,condition,new Map())).toBe(true);
    expect(conditionMet(g,{type:'near_entity',entityId:'ark',targetId:'missing'},new Map())).toBe(false);
    g.level.mission!.triggers=[{id:'done',condition,actions:[{type:'complete'}]}];
    evaluateMission(g,new Map());expect(g.phase).toBe('completed');
  });
  it('keeps a checkpoint snapshot non-recursive across repeated saves',()=>{
    const g=fixture();for(let i=0;i<20;i++)saveCheckpoint(g,String(i));
    expect(g.checkpoint!.snapshot).not.toHaveProperty('checkpoint');expect(g.checkpoint!.id).toBe('19');
  });
  it('stops a preview at a wormhole transition without mutating live state',()=>{
    const g=fixture();g.bodies.push(createBody({id:'gate',kind:'wormhole',position:{x:20,y:0},radius:5}));
    g.bodies[0].velocity.x=60;
    g.level.mission!.triggers=[{id:'gate-enter',condition:{type:'near_entity',entityId:'ark',targetId:'gate'},actions:[{type:'transition',scene:'solar_system'}]}];
    const before=structuredClone(g), prediction=predictTrajectory(g);
    expect(prediction.outcome).toBe('transition');expect(prediction.seconds).toBeLessThan(1);expect(g).toEqual(before);
  });
});

/** Arrival is a conjunction -- fully inside the region AND under the speed limit -- and
 * before this it failed silently. The ark would sit on the station with its predicted
 * trajectory ending right there, no completion, and nothing saying why; that reads as a
 * broken win condition. These pin the explanation, and pin that it is live-only. */
describe('arrival feedback',()=>{
  const setup=(offset:number,speed:number)=>{
    const g=createGame(firstLevel);g.phase='running';
    const ark=g.bodies.find(b=>b.id==='ark')!,station=g.bodies.find(b=>b.id==='station')!;
    ark.position={x:station.position.x+offset,y:station.position.y};ark.velocity={x:speed,y:0};
    stepGame(g,NO_CONTROLS);
    return g;
  };
  it('explains a dock refused for speed rather than refusing it silently',()=>{
    const g=setup(0,65);
    expect(g.phase).toBe('running');
    expect(g.message).toContain('65.0');
    expect(g.message).toContain('48');
  });
  it('explains a dock refused because the hull is not fully inside',()=>{
    // 64 units off centre: the ark's 8-unit hull pokes past the 68-unit station radius, so
    // containment fails even though the ark is sitting visibly on top of the station.
    const g=setup(64,10);
    expect(g.phase).toBe('running');
    expect(g.message).toContain('尚未完全进入空间港');
  });
  it('adds nothing once the condition actually holds',()=>{
    const g=setup(0,10);
    expect(g.phase).toBe('completed');
    expect(g.message).toContain('安全抵达');
  });
  it('stays quiet while the ark is still crossing the map',()=>{
    const g=setup(600,65);
    expect(g.phase).toBe('running');
    expect(g.message).toBe('绕开中央天体，低速进入空间港（≤ 48）');
  });
  it('outranks a mission hint, which is set once by a trigger and never cleared',()=>{
    const g=setup(0,65);
    g.mission.hint='已保存绕行检查点 · 制动至 ≤ 48 入港；R 恢复';
    stepGame(g,NO_CONTROLS);
    expect(g.message).toContain('减速后再靠近');
  });
  it('leaves the message untouched on a forecast step',()=>{
    // The message is written after `if (forecast) return;` (game.ts), so a forecast must not
    // carry one back -- 720 of them run per prediction and none may touch live state.
    const g=setup(0,65);const message=g.message;
    stepGame(g,NO_CONTROLS,1/60,true);
    expect(g.message).toBe(message);
  });
});

describe('layered scene state machine',()=>{
  it('starts at title and keeps later levels explicitly unavailable',()=>{
    const controller=new SceneController();expect(controller.scene).toBe('title');controller.step(NO_CONTROLS);expect(controller.game).toBeUndefined();
    controller.toggle();expect(controller.scene).toBe('prototype');expect(controller.game!.phase).toBe('ready');
    const before=structuredClone(controller.game);
    for(const id of ['tutorial_part_1','tutorial_part_2','solar_system','black_hole','endless'] as const) expect(controller.enter(id)).toBe(false);
    expect(controller.game).toEqual(before);expect(controller.scene).toBe('prototype');
  });
  it('preserves identity while paused/failed/completed and fully resets on scene reentry',()=>{
    const c=new SceneController();c.enter('prototype');c.toggle();c.step(NO_CONTROLS);c.toggle();
    expect(c.scene).toBe('prototype');expect(c.game!.phase).toBe('paused');
    const initial=createGame(firstLevel); c.retry(true);expect(c.game).toEqual(initial);
    c.game!.phase='completed';c.toggle();expect(c.game!.phase).toBe('completed');
    c.enter('title');expect(c.game).toBeUndefined();c.enter('prototype');expect(c.game).toEqual(initial);
  });
  it('transitions via world-space trigger into a fresh independent configured scene',()=>{
    const registry=structuredClone(scenes), origin=fixture().level, next=structuredClone(firstLevel);
    origin.bodies=[createBody({id:'ark',kind:'ship',position:{x:0,y:0},radius:8}),createBody({id:'gate',kind:'wormhole',position:{x:0,y:0},radius:20})];
    origin.mission={objectives:[],triggers:[{id:'jump',condition:{type:'near_entity',entityId:'ark',targetId:'gate'},actions:[{type:'transition',scene:'tutorial_part_1'}]}]};
    next.id='test-only-destination';next.bodies[0].position={x:-2000,y:5000};
    registry.prototype.level=origin;registry.tutorial_part_1={id:'tutorial_part_1',name:'test fixture only',status:'available',level:next};
    const c=new SceneController(registry);c.enter('prototype');c.toggle();c.step(NO_CONTROLS);
    expect(c.scene).toBe('tutorial_part_1');expect(c.game!.phase).toBe('ready');expect(c.game!.elapsed).toBe(0);
    expect(c.game!.bodies[0].position).toEqual({x:-2000,y:5000});expect(c.game!.mission.firedTriggers).toEqual([]);
    expect(registry.tutorial_part_1.level!.bodies[0].position).toEqual({x:-2000,y:5000});
    expect(scenes.tutorial_part_1.status).toBe('planned');
  });
  it('distinguishes retry from complete restart and resets input toggles',()=>{
    const actions:string[]=[],k=new Keyboard(a=>actions.push(a));
    k.keyDown('KeyF');k.keyUp('KeyF');k.keyDown('KeyR',false,true);
    expect(actions).toEqual(['restart']);expect(k.read().players.map(p => p.abilityActive)).toEqual([false,false]);
    const c=new SceneController();c.enter('prototype');c.game!.bodies[0].position.x=-8000;saveCheckpoint(c.game!,'remote');
    c.game!.phase='failed';c.retry();expect(c.game!.bodies[0].position.x).toBe(-8000);
    c.retry(true);expect(c.game!.bodies[0].position.x).toBe(120);
  });
});
