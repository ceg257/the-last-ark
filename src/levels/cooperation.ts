import type { Level } from '../game/types';
import { firstLevel } from './first';
import { createBody } from '../game/entities';
/** Development-only geometric cooperation probe, not a story chapter. */
export const cooperationLevel: Level = {
  id: 'cooperation-probe', name: '开发测试 / 移动陨石走廊', width: 1400, height: 800,
  seed: 2402, mapBounds: {minX:-300,minY:-300,maxX:1600,maxY:1000},
  scoring: {threeStarsSeconds:18,twoStarsSeconds:30},
  players: structuredClone(firstLevel.players),
  bodies: [
    createBody({id:'ark',kind:'ship',radius:8,position:{x:120,y:340},velocity:{x:65,y:0}}),
    createBody({id:'rock-a',kind:'asteroid',radius:23,position:{x:450,y:340},velocity:{x:0,y:2},stabilization:{halfLife:1}}),
    createBody({id:'rock-b',kind:'asteroid',radius:26,position:{x:620,y:330},velocity:{x:-2,y:3},stabilization:{halfLife:1.1}}),
    createBody({id:'rock-c',kind:'asteroid',radius:21,position:{x:780,y:350},velocity:{x:1,y:-2},stabilization:{halfLife:0.9}}),
    createBody({id:'station',kind:'station',radius:70,position:{x:1100,y:340}}),
  ],
  mission: {objectives:[{id:'dock',label:'清理移动陨石，低速进入空间港（≤ 48）',target:{entityId:'station'},
    condition:{type:'near_entity',entityId:'ark',targetId:'station',fullContainment:true,maxSpeed:48}}],triggers:[]},
};
