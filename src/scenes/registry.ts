import { firstLevel } from '../levels/first';
import type { SceneRegistry } from './types';
export const scenes: SceneRegistry = {
  title: { id: 'title', name: 'THE LAST ARK', status: 'available' },
  prototype: { id: 'prototype', name: '原试玩 / 绕行与制动', status: 'available', level: firstLevel },
  tutorial_part_1: { id: 'tutorial_part_1', name: 'Level 0 · 引力与斥力', status: 'planned' },
  tutorial_part_2: { id: 'tutorial_part_2', name: 'Level 0 · 可移动天体', status: 'planned' },
  solar_system: { id: 'solar_system', name: 'Level 1 · Solar Exodus', status: 'planned' },
  black_hole: { id: 'black_hole', name: 'Level 2 · Beyond the Horizon', status: 'planned' },
  endless: { id: 'endless', name: 'Endless Mode', status: 'planned' },
};
