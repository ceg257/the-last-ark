import type { Level } from '../game/types';
export type SceneId = 'title' | 'prototype' | 'tutorial_part_1' | 'tutorial_part_2' | 'solar_system' | 'black_hole' | 'endless';
export interface SceneDefinition { id: SceneId; name: string; status: 'available' | 'planned'; level?: Level }
export type SceneRegistry = Record<SceneId, SceneDefinition>;
