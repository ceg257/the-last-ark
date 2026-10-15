import type { Entity } from '../game/types';
import type { Camera } from '../camera/camera';
import { isVisible } from '../camera/camera';
/** Loaded entity broad phase only; never decides which entities are simulated. */
export function visibleEntities<T extends Entity>(camera: Camera, entities: T[]): T[] {
  return entities.filter(entity => entity.layer !== 'hidden' && isVisible(camera, entity.position, entity.radius));
}
