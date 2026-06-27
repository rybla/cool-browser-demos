// Wave Function Collapse procedural generation level manager
import { physics } from "./physics";
import { graphics } from "./graphics";
import { TILES, TILE_SIZE } from "./tiles";
import type { TileBlueprint } from "./tiles";

// Tile weights to balance generation frequency
const TILE_WEIGHTS: Record<number, number> = {
  0: 0.05, // Empty Space
  1: 1.2, // Flat Low
  2: 1.0, // Flat Mid
  3: 1.0, // Flat High
  4: 0.7, // Slope Up Low-Mid
  5: 0.7, // Slope Down Mid-Low
  6: 0.7, // Slope Up Mid-High
  7: 0.7, // Slope Down High-Mid
  8: 0.45, // The Gap Low
  9: 0.6, // Launcher Step
  10: 0.55, // Gate & Button
  11: 0.4, // Speed Loop
  12: 0.45, // Elevator Shaft
  13: 0.45, // Seesaw Bridge
  14: 0.45, // Drop Chute
  15: 0.65, // S-Curve Slide
};

export class LevelManager {
  // Map of coordinate string "tx,ty" -> tile ID (collapsed state)
  public collapsedGrid = new Map<string, number>();

  // Map of coordinate string "tx,ty" -> boolean (is loaded in physics/graphics)
  private loadedGrid = new Map<string, boolean>();

  // Tracks active game elements inside loaded tiles
  private loadedDynamicObjects = new Map<
    string,
    Array<{
      type: string;
      id: number;
      bodyHandle?: number;
      hasMesh: boolean;
    }>
  >();

  // Incremental ID generator for dynamic objects
  private uniqueIdCounter = 1000;

  constructor() {}

  public init() {
    this.collapsedGrid.clear();
    this.loadedGrid.clear();
    this.loadedDynamicObjects.clear();
    this.uniqueIdCounter = 1000;

    // Pre-collapse starting locations to ensure player spawns on a solid low floor
    this.collapsedGrid.set("0,0", 1); // Spawns on Flat Low
    this.collapsedGrid.set("-1,0", 1); // Flat Low to the left
    this.collapsedGrid.set("-2,0", 1); // Flat Low buffer
    this.collapsedGrid.set("1,0", 1); // Flat Low to the right

    // Pre-collapse vertical columns near start to empty
    for (let ty = 1; ty <= 3; ty++) {
      this.collapsedGrid.set(`0,${ty}`, 0);
      this.collapsedGrid.set(`-1,${ty}`, 0);
      this.collapsedGrid.set(`1,${ty}`, 0);
    }
  }

  // Update dynamic grid loading based on player position
  public update(playerX: number, playerY: number) {
    // Current tile coordinate
    const cx = Math.floor(playerX / TILE_SIZE);
    const cy = Math.floor(playerY / TILE_SIZE);

    const activeRadius = 2; // 5x5 active loading window around player
    const unloadRadius = 3; // 7x7 buffer boundaries for unloading

    // 1. Generate & Load tiles in active window
    for (let tx = cx - activeRadius; tx <= cx + activeRadius; tx++) {
      for (let ty = cy - activeRadius; ty <= cy + activeRadius; ty++) {
        // Limit generation on Y to reasonable heights (e.g. -2 to +4 tiles high)
        if (ty < -1 || ty > 3) {
          // Force empty air outside reasonable vertical bounds
          this.collapsedGrid.set(`${tx},${ty}`, 0);
          continue;
        }

        const key = `${tx},${ty}`;

        // Collapse cell if not decided
        if (!this.collapsedGrid.has(key)) {
          this.collapseCell(tx, ty);
        }

        // Load collapsed tile if not active
        if (!this.loadedGrid.has(key)) {
          this.loadTile(tx, ty);
        }
      }
    }

    // 2. Unload tiles outside buffer window
    this.loadedGrid.forEach((_, key) => {
      const parts = key.split(",").map(Number);
      const tx = parts[0];
      const ty = parts[1];
      if (tx === undefined || ty === undefined) return;
      if (
        Math.abs(tx - cx) > unloadRadius ||
        Math.abs(ty - cy) > unloadRadius
      ) {
        this.unloadTile(tx, ty);
      }
    });

    // 3. Sync positions of dynamic physics bodies with Three.js meshes
    this.syncDynamicObjects();
  }

  // WAVE FUNCTION COLLAPSE COLLAPSE STEP
  private collapseCell(tx: number, ty: number) {
    const key = `${tx},${ty}`;

    // Get socket requirements from neighbors
    const leftNeighbor = this.collapsedGrid.get(`${tx - 1},${ty}`);
    const rightNeighbor = this.collapsedGrid.get(`${tx + 1},${ty}`);
    const bottomNeighbor = this.collapsedGrid.get(`${tx},${ty - 1}`);
    const topNeighbor = this.collapsedGrid.get(`${tx},${ty + 1}`);

    // Filter compatible tile candidates
    const candidates = TILES.filter((tile) => {
      // Don't randomly pick Empty Space (Tile 0) if a road is expected
      if (tile.id === 0) return false;

      // Match left boundary
      if (leftNeighbor !== undefined) {
        const leftTile = TILES[leftNeighbor];
        if (!leftTile || tile.left_socket !== leftTile.right_socket)
          return false;
      }

      // Match right boundary
      if (rightNeighbor !== undefined) {
        const rightTile = TILES[rightNeighbor];
        if (!rightTile || tile.right_socket !== rightTile.left_socket)
          return false;
      }

      // Match bottom boundary
      if (bottomNeighbor !== undefined) {
        const bottomTile = TILES[bottomNeighbor];
        if (!bottomTile || tile.bottom_socket !== bottomTile.top_socket)
          return false;
      }

      // Match top boundary
      if (topNeighbor !== undefined) {
        const topTile = TILES[topNeighbor];
        if (!topTile || tile.top_socket !== topTile.bottom_socket) return false;
      }

      return true;
    });

    let selectedTileId: number;

    if (candidates.length > 0) {
      // Pick a candidate weighted by its generation frequency
      selectedTileId = this.pickWeightedCandidate(candidates);
    } else {
      // CONTRADICTION! Fallback to a tile that matches the left neighbor to avoid cutting off roads
      if (leftNeighbor !== undefined) {
        const leftTile = TILES[leftNeighbor];
        if (leftTile) {
          const leftMatches = TILES.filter(
            (t) => t.left_socket === leftTile.right_socket && t.id !== 0
          );
          if (leftMatches.length > 0) {
            selectedTileId = this.pickWeightedCandidate(leftMatches);
          } else {
            selectedTileId = 0; // fallback to empty
          }
        } else {
          selectedTileId = 1;
        }
      } else {
        selectedTileId = 1; // standard flat floor
      }
    }

    this.collapsedGrid.set(key, selectedTileId);
  }

  // Choose a random candidate based on weights
  private pickWeightedCandidate(candidates: TileBlueprint[]): number {
    let totalWeight = 0;
    candidates.forEach((c) => {
      totalWeight += TILE_WEIGHTS[c.id] || 0.5;
    });

    let rand = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!candidate) continue;
      const weight = TILE_WEIGHTS[candidate.id] || 0.5;
      if (rand < weight) {
        return candidate.id;
      }
      rand -= weight;
    }

    const lastCandidate = candidates[candidates.length - 1];
    return lastCandidate ? lastCandidate.id : 1;
  }

  // Load physical colliders & WebGL meshes for a collapsed coordinate
  private loadTile(tx: number, ty: number) {
    const key = `${tx},${ty}`;
    const tileId = this.collapsedGrid.get(key);
    if (tileId === undefined) return;

    const blueprint = TILES[tileId];
    if (!blueprint) return;

    // 1. Instanciate colliders in Rapier2D physics
    physics.loadTile(key, tx, ty, TILE_SIZE, blueprint);

    // 2. Instanciate static terrain meshes in Three.js
    const tileX = tx * TILE_SIZE;
    const tileY = ty * TILE_SIZE;

    // Create graphical representations for static surfaces
    if (blueprint.surfaces) {
      blueprint.surfaces.forEach((points) => {
        const uniqueId = ++this.uniqueIdCounter;

        // Shift geometry coordinates relative to world origin
        const shiftedPoints = points.map((val, i) => {
          return val + (i % 2 === 0 ? tileX : tileY);
        });

        graphics.createStaticSurfaceMesh(uniqueId, shiftedPoints);

        // Keep track to unload later
        if (!this.loadedDynamicObjects.has(key)) {
          this.loadedDynamicObjects.set(key, []);
        }
        this.loadedDynamicObjects.get(key)!.push({
          type: "static_surface",
          id: uniqueId,
          hasMesh: true,
        });
      });
    }

    // 3. Create WebGL representations for dynamic/sensor objects
    // Query objects created in physics
    const physTileInstance = physics.getLoadedTile(key);
    if (physTileInstance && physTileInstance.dynamicObjects) {
      physTileInstance.dynamicObjects.forEach((physObj, idx) => {
        const blueprintObj = blueprint.objects[idx];
        if (!blueprintObj) return;

        const uniqueId = ++this.uniqueIdCounter;

        // Pass details to graphics engine
        graphics.createObjectMesh(blueprintObj.type, uniqueId, {
          w: blueprintObj.w || 2,
          h: blueprintObj.h || 2,
          length: blueprintObj.length || 8,
          id: blueprintObj.id,
          targetGateId: blueprintObj.targetGateId,
          force: blueprintObj.force,
        });

        // Mirror initial position
        const startX = tileX + blueprintObj.x;
        const startY = tileY + blueprintObj.y;
        graphics.updateObjectPosition(uniqueId, { x: startX, y: startY });

        // Add to tracking
        if (!this.loadedDynamicObjects.has(key)) {
          this.loadedDynamicObjects.set(key, []);
        }
        this.loadedDynamicObjects.get(key)!.push({
          type: blueprintObj.type,
          id: uniqueId,
          bodyHandle: physObj.body ? physObj.body.handle : undefined,
          hasMesh: true,
        });
      });
    }

    this.loadedGrid.set(key, true);
  }

  // Unload graphical and physical models
  private unloadTile(tx: number, ty: number) {
    const key = `${tx},${ty}`;
    if (!this.loadedGrid.has(key)) return;

    // 1. Remove physics structures
    physics.unloadTile(key);

    // 2. Remove graphics structures
    const objects = this.loadedDynamicObjects.get(key);
    if (objects) {
      objects.forEach((obj) => {
        if (obj.hasMesh) {
          graphics.removeObjectMesh(obj.id);
        }
      });
      this.loadedDynamicObjects.delete(key);
    }

    this.loadedGrid.delete(key);
  }

  // Update Three.js meshes to follow physical bodies
  private syncDynamicObjects() {
    if (!physics.world) return;

    this.loadedDynamicObjects.forEach((objects) => {
      objects.forEach((obj) => {
        if (obj.bodyHandle !== undefined) {
          const body = physics.world!.getRigidBody(obj.bodyHandle);
          if (body) {
            const pos = body.translation();
            const rot = body.rotation();
            graphics.updateObjectPosition(obj.id, pos, rot);
          }
        }
      });
    });
  }

  // Cleanup level
  public destroy() {
    this.loadedGrid.forEach((_, key) => {
      const parts = key.split(",").map(Number);
      const tx = parts[0];
      const ty = parts[1];
      if (tx !== undefined && ty !== undefined) {
        this.unloadTile(tx, ty);
      }
    });
    this.collapsedGrid.clear();
    this.loadedGrid.clear();
    this.loadedDynamicObjects.clear();
  }
}

// Export singleton instance
export const levelManager = new LevelManager();
