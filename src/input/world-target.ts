import { screenToWorld } from '../camera/camera';
import type { Camera } from '../camera/camera';
import type { Vec2 } from '../physics/vector';

export interface CanvasBounds { left: number; top: number; width: number; height: number }

/** Future pointer adapters call capture ONLY on a deliberate pointer position event.
 * Store the world point, not the camera or client coordinates. Following/zoom/resize
 * therefore cannot turn a stationary pointer into an implicit ship-follow command.
 * This helper does not install mouse handlers or enable a mouse control mode. */
export class WorldTarget {
  private target?: Vec2;
  capture(client: Readonly<Vec2>, bounds: CanvasBounds, camera: Camera): void {
    if (![client.x, client.y, bounds.left, bounds.top, bounds.width, bounds.height,
      camera.position.x, camera.position.y, camera.width, camera.height, camera.zoom].every(Number.isFinite)
      || bounds.width <= 0 || bounds.height <= 0 || camera.width <= 0 || camera.height <= 0 || camera.zoom <= 0) {
      this.clear(); return;
    }
    // CSS client pixels -> camera viewport units. Canvas backing-store DPR is irrelevant.
    this.target = screenToWorld(camera, {
      x: (client.x - bounds.left) * camera.width / bounds.width,
      y: (client.y - bounds.top) * camera.height / bounds.height,
    });
  }
  read(): Vec2 | undefined { return this.target ? { ...this.target } : undefined; }
  clear(): void { this.target = undefined; }
}
