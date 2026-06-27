import RAPIER from "@dimforge/rapier2d-compat";
import type { TileBlueprint, TileObjectBlueprint } from "./tiles";
import { audio } from "./audio";

export interface PhysicsObjectData {
  id?: string;
  isOpen?: boolean;
  currentY?: number;
  targetY?: number;
  h?: number;
  targetGateId?: string;
  pressed?: boolean;
  force?: number;
  chimeId?: string;
  speed?: number;
  range?: number;
  elapsed?: number;
}

export interface PhysicsTileInstance {
  rigidBodies: RAPIER.RigidBody[];
  colliders: RAPIER.Collider[];
  joints: RAPIER.ImpulseJoint[];
  dynamicObjects: Array<{
    type: string;
    body?: RAPIER.RigidBody;
    collider?: RAPIER.Collider;
    startX?: number;
    startY?: number;
    data?: PhysicsObjectData;
  }>;
}

export class PhysicsEngine {
  public world: RAPIER.World | null = null;
  public RAPIER_MODULE = RAPIER;
  public eventQueue: RAPIER.EventQueue | null = null;

  // Active player body reference
  public playerBody: RAPIER.RigidBody | null = null;
  public playerCollider: RAPIER.Collider | null = null;

  // Map of loaded tiles
  private loadedTiles = new Map<string, PhysicsTileInstance>();

  public getLoadedTile(tileKey: string): PhysicsTileInstance | undefined {
    return this.loadedTiles.get(tileKey);
  }

  // Handlers for specific sensor events
  public onButtonPressed: (buttonId: string) => void = () => {};
  public onTrampolineTriggered: (trampolineId: string) => void = () => {};
  public onChimeCollected: (chimeId: string) => void = () => {};
  public onCollision: (intensity: number) => void = () => {};

  // Track buttons and their target gates
  // Button trigger zone handle -> gate ID or callbacks
  private sensorCallbacks = new Map<number, () => void>();

  constructor() {}

  public async init() {
    // Initialize the WebAssembly module of Rapier
    await RAPIER.init();

    // Create 2D World with gravity (g = -16.0 m/s^2)
    this.world = new RAPIER.World({ x: 0.0, y: -16.0 });
    this.eventQueue = new RAPIER.EventQueue(true);

    this.createPlayer();
  }

  // Create the player's rolling marble
  private createPlayer() {
    if (!this.world) return;

    // Ball rigid body desc
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0.0, 4.0) // Start slightly elevated on flat ground
      .setLinearDamping(0.2) // Subtle air resistance
      .setAngularDamping(0.4) // Rolling resistance
      .setCanSleep(false);

    this.playerBody = this.world.createRigidBody(bodyDesc);

    // Ball collider desc (radius = 0.8 units)
    const colliderDesc = RAPIER.ColliderDesc.ball(0.8)
      .setFriction(0.65) // Good traction to roll up ramps
      .setRestitution(0.5) // Slightly springier bounce
      .setDensity(1.0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS); // Enable collision callbacks

    this.playerCollider = this.world.createCollider(
      colliderDesc,
      this.playerBody
    );
  }

  // Step the simulation
  public step(dt: number) {
    if (!this.world || !this.eventQueue) return;

    // Step physics
    // Rapier prefers constant step size. We can step the world.
    this.world.timestep = Math.min(dt, 0.03); // Max step constraint
    this.world.step(this.eventQueue);

    // Handle collision & contact events
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;

      // Check if one of the handles is the player
      const isPlayer1 =
        this.playerCollider && handle1 === this.playerCollider.handle;
      const isPlayer2 =
        this.playerCollider && handle2 === this.playerCollider.handle;

      if (isPlayer1 || isPlayer2) {
        const otherHandle = isPlayer1 ? handle2 : handle1;

        // Check if the other collider is a sensor callback
        const callback = this.sensorCallbacks.get(otherHandle);
        if (callback) {
          callback();
        } else {
          // It's a physical contact, trigger hit SFX based on speed
          if (this.playerBody) {
            const vel = this.playerBody.linvel();
            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
            this.onCollision(speed);
          }
        }
      }
    });

    // Update kinematic elevators and sliding gates
    this.updateKinematicObjects();
  }

  // Add static and dynamic objects for a procedurally collapsed tile
  public loadTile(
    tileKey: string,
    tx: number,
    ty: number,
    tileSize: number,
    blueprint: TileBlueprint
  ) {
    if (!this.world) return;
    if (this.loadedTiles.has(tileKey)) return;

    const tileX = tx * tileSize;
    const tileY = ty * tileSize;

    const rigidBodies: RAPIER.RigidBody[] = [];
    const colliders: RAPIER.Collider[] = [];
    const joints: RAPIER.ImpulseJoint[] = [];
    const dynamicObjects: PhysicsTileInstance["dynamicObjects"] = [];

    // 1. Create static convex surfaces (terrains)
    if (blueprint.surfaces) {
      blueprint.surfaces.forEach((points: number[]) => {
        // Shift points relative to tile's origin
        const shifted = new Float32Array(points.length);
        for (let i = 0; i < points.length; i += 2) {
          const px = points[i];
          const py = points[i + 1];
          if (px !== undefined && py !== undefined) {
            shifted[i] = px + tileX;
            shifted[i + 1] = py + tileY;
          }
        }

        const bodyDesc = RAPIER.RigidBodyDesc.fixed();
        const body = this.world!.createRigidBody(bodyDesc);

        const colliderDesc = RAPIER.ColliderDesc.convexHull(shifted);
        if (colliderDesc) {
          colliderDesc.setFriction(0.7);
          colliderDesc.setRestitution(0.2);
          const collider = this.world!.createCollider(colliderDesc, body);

          rigidBodies.push(body);
          colliders.push(collider);
        }
      });
    }

    // 2. Create interactive and dynamic objects
    if (blueprint.objects) {
      blueprint.objects.forEach((obj: TileObjectBlueprint) => {
        const objX = tileX + obj.x;
        const objY = tileY + obj.y;
        const w = obj.w ?? 2.0;
        const h = obj.h ?? 2.0;
        const force = obj.force ?? 16.0;
        const length = obj.length ?? 8.0;
        const speed = obj.speed ?? 1.5;
        const range = obj.range ?? 8.0;
        const id = obj.id ?? "";
        const targetGateId = obj.targetGateId ?? "";

        if (obj.type === "crate") {
          // Physics crate (dynamic block)
          const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(objX, objY)
            .setLinearDamping(0.1)
            .setAngularDamping(0.2);
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
            .setDensity(0.4) // Lightweight wood
            .setFriction(0.6)
            .setRestitution(0.15)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

          const collider = this.world!.createCollider(colliderDesc, body);

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({ type: "crate", body, collider });
        } else if (obj.type === "gate") {
          // Sliding gate: Kinematic body
          const bodyDesc =
            RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
              objX,
              objY
            );
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.cuboid(
            w / 2,
            h / 2
          ).setFriction(0.3);
          const collider = this.world!.createCollider(colliderDesc, body);

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "gate",
            body,
            collider,
            startX: objX,
            startY: objY,
            data: { id, isOpen: false, currentY: objY, targetY: objY, h },
          });
        } else if (obj.type === "button") {
          // Sensor Button
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY
          );
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const collider = this.world!.createCollider(colliderDesc, body);

          // Register trigger event callback
          this.sensorCallbacks.set(collider.handle, () => {
            this.onButtonPressed(targetGateId);
          });

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "button",
            body,
            collider,
            data: { targetGateId, pressed: false },
          });
        } else if (obj.type === "trampoline") {
          // Sensor Trampoline (Launchpad)
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY
          );
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const collider = this.world!.createCollider(colliderDesc, body);

          this.sensorCallbacks.set(collider.handle, () => {
            if (this.playerBody) {
              // Apply vertical launch impulse
              this.playerBody.setLinvel(
                { x: this.playerBody.linvel().x, y: 0.0 },
                true
              );
              this.playerBody.applyImpulse({ x: 4.0, y: force }, true);
              this.onTrampolineTriggered(id);
            }
          });

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "trampoline",
            body,
            collider,
            data: { force },
          });
        } else if (obj.type === "seesaw") {
          // Seesaw consists of a dynamic plank and a revolute joint to a fixed anchor

          // 1. Pivot Anchor (fixed)
          const pivotDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY - 0.4
          );
          const pivotBody = this.world!.createRigidBody(pivotDesc);
          const pivotColliderDesc = RAPIER.ColliderDesc.convexHull(
            new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.0, 0.5])
          );
          if (pivotColliderDesc) {
            const pivotCollider = this.world!.createCollider(
              pivotColliderDesc,
              pivotBody
            );
            rigidBodies.push(pivotBody);
            colliders.push(pivotCollider);

            // 2. Seesaw Plank (dynamic)
            const plankDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
              objX,
              objY
            );
            const plankBody = this.world!.createRigidBody(plankDesc);
            const plankColliderDesc = RAPIER.ColliderDesc.cuboid(
              length / 2,
              0.15
            )
              .setDensity(0.8)
              .setFriction(0.6);
            const plankCollider = this.world!.createCollider(
              plankColliderDesc,
              plankBody
            );

            rigidBodies.push(plankBody);
            colliders.push(plankCollider);

            // 3. Revolute Joint
            const jointParams = RAPIER.JointData.revolute(
              { x: 0.0, y: 0.0 }, // anchor on pivot
              { x: 0.0, y: 0.0 } // anchor on plank
            );
            const joint = this.world!.createImpulseJoint(
              jointParams,
              pivotBody,
              plankBody,
              true
            );

            joints.push(joint);
            dynamicObjects.push({
              type: "seesaw",
              body: plankBody,
              collider: plankCollider,
            });
          }
        } else if (obj.type === "chime") {
          // Checkpoint / Collectible chime
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY
          );
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.ball(0.6)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const collider = this.world!.createCollider(colliderDesc, body);

          const chimeId = `${tileKey}_chime_${objX}_${objY}`;

          this.sensorCallbacks.set(collider.handle, () => {
            this.onChimeCollected(chimeId);
            // Hide sensor so it can't be triggered again
            this.sensorCallbacks.delete(collider.handle);
            this.world!.removeCollider(collider, false);
            this.world!.removeRigidBody(body);
          });

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "chime",
            body,
            collider,
            data: { chimeId },
          });
        } else if (obj.type === "elevator") {
          // Kinematic Lift
          const bodyDesc =
            RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
              objX,
              objY
            );
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, 0.2)
            .setFriction(0.8)
            .setRestitution(0.0);
          const collider = this.world!.createCollider(colliderDesc, body);

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "elevator",
            body,
            collider,
            startX: objX,
            startY: objY,
            data: { speed, range, elapsed: Math.random() * 10 },
          });
        } else if (obj.type === "wedge") {
          // Physics wedge (symmetrical double-sided dynamic ramp)
          const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(objX, objY)
            .setLinearDamping(0.2)
            .setAngularDamping(0.3);
          const body = this.world!.createRigidBody(bodyDesc);

          const triPoints = new Float32Array([
            -w / 2,
            -h / 2,
            w / 2,
            -h / 2,
            0,
            h / 2,
          ]);
          const colliderDesc = RAPIER.ColliderDesc.convexHull(triPoints);
          if (colliderDesc) {
            colliderDesc.setDensity(0.4).setFriction(0.6).setRestitution(0.15);
            const collider = this.world!.createCollider(colliderDesc, body);
            rigidBodies.push(body);
            colliders.push(collider);
            dynamicObjects.push({ type: "wedge", body, collider });
          }
        } else if (obj.type === "pendulum") {
          // Swinging hammer
          const pivotDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY
          );
          const pivotBody = this.world!.createRigidBody(pivotDesc);
          const pivotColliderDesc = RAPIER.ColliderDesc.ball(0.25);
          const pivotCollider = this.world!.createCollider(
            pivotColliderDesc,
            pivotBody
          );
          rigidBodies.push(pivotBody);
          colliders.push(pivotCollider);

          // Head (Heavy Dynamic Ball)
          const headDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(objX, objY - range) // range = length
            .setLinearDamping(0.02);
          const headBody = this.world!.createRigidBody(headDesc);

          // Give it an initial swing kick!
          headBody.setLinvel({ x: 9.0, y: 0.0 }, true);

          const headColliderDesc = RAPIER.ColliderDesc.ball(1.1)
            .setDensity(1.8)
            .setFriction(0.4)
            .setRestitution(0.8);
          const headCollider = this.world!.createCollider(
            headColliderDesc,
            headBody
          );
          rigidBodies.push(headBody);
          colliders.push(headCollider);

          // Joint connection
          const jointParams = RAPIER.JointData.revolute(
            { x: 0.0, y: 0.0 },
            { x: 0.0, y: range }
          );
          const joint = this.world!.createImpulseJoint(
            jointParams,
            pivotBody,
            headBody,
            true
          );
          joints.push(joint);

          dynamicObjects.push({
            type: "pendulum",
            body: headBody,
            collider: headCollider,
            startX: objX,
            startY: objY,
            data: { range }, // pass rod length
          });
        } else if (obj.type === "domino") {
          // Tall dynamic domino block
          const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(objX, objY)
            .setLinearDamping(0.15)
            .setAngularDamping(0.25);
          const body = this.world!.createRigidBody(bodyDesc);

          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
            .setDensity(0.55)
            .setFriction(0.6)
            .setRestitution(0.12);
          const collider = this.world!.createCollider(colliderDesc, body);

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({ type: "domino", body, collider });
        } else if (obj.type === "booster") {
          // Speed Pad Sensor
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY
          );
          const body = this.world!.createRigidBody(bodyDesc);
          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const collider = this.world!.createCollider(colliderDesc, body);

          this.sensorCallbacks.set(collider.handle, () => {
            if (this.playerBody) {
              // Apply horizontal acceleration boost
              this.playerBody.applyImpulse({ x: force, y: 0.0 }, true);
              this.onTrampolineTriggered(id); // chime trigger effects
            }
          });

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "booster",
            body,
            collider,
            data: { force },
          });
        } else if (obj.type === "gravity_pad") {
          // Gravity Inverter Sensor
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            objX,
            objY
          );
          const body = this.world!.createRigidBody(bodyDesc);
          const colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
          const collider = this.world!.createCollider(colliderDesc, body);

          this.sensorCallbacks.set(collider.handle, () => {
            // Flip gravity: if force > 0, invert (upward), else restore normal (downward)
            const gDir = force > 0 ? 1.0 : -1.0;
            if (this.world) {
              this.world.gravity = { x: 0.0, y: gDir * 16.0 };
              audio.playClickSFX();
              audio.playGateSFX(); // nice grinding whoosh
            }
          });

          rigidBodies.push(body);
          colliders.push(collider);
          dynamicObjects.push({
            type: "gravity_pad",
            body,
            collider,
            data: { force },
          });
        }
      });
    }

    this.loadedTiles.set(tileKey, {
      rigidBodies,
      colliders,
      joints,
      dynamicObjects,
    });
  }

  // Unload objects for a tile, removing them from the physics simulation
  public unloadTile(tileKey: string) {
    const tile = this.loadedTiles.get(tileKey);
    if (!tile) return;

    // Remove joints first
    tile.joints.forEach((joint) => {
      if (this.world) this.world.removeImpulseJoint(joint, false);
    });

    // Remove colliders and check for sensor callback cleanups
    tile.colliders.forEach((collider) => {
      this.sensorCallbacks.delete(collider.handle);
      if (this.world) {
        try {
          this.world.removeCollider(collider, false);
        } catch (_err) {
          // ignore
        }
      }
    });

    // Remove rigid bodies
    tile.rigidBodies.forEach((body) => {
      if (this.world) {
        try {
          this.world.removeRigidBody(body);
        } catch (_err) {
          // ignore
        }
      }
    });

    this.loadedTiles.delete(tileKey);
  }

  // Trigger unlocking a gate: starts its visual/physical slide animation
  public openGate(gateId: string) {
    this.loadedTiles.forEach((tile) => {
      tile.dynamicObjects.forEach((obj) => {
        if (obj.type === "gate" && obj.data && obj.data.id === gateId) {
          obj.data.isOpen = true;
          const h = obj.data.h ?? 5.0;
          obj.data.targetY = (obj.startY ?? 0.0) + h * 1.5; // Slide open upward
        }
      });
    });
  }

  // Reset the physics world (player respawn)
  public resetPlayer() {
    if (!this.playerBody) return;
    this.playerBody.setTranslation({ x: 0.0, y: 4.0 }, true);
    this.playerBody.setLinvel({ x: 0.0, y: 0.0 }, true);
    this.playerBody.setAngvel(0.0, true);
    if (this.world) {
      this.world.gravity = { x: 0.0, y: -16.0 };
    }
  }

  public getGravityY(): number {
    return this.world ? this.world.gravity.y : -16.0;
  }

  // Update elevator oscillation and gate sliding
  private updateKinematicObjects() {
    const timeStep = this.world?.timestep || 0.016;

    this.loadedTiles.forEach((tile) => {
      tile.dynamicObjects.forEach((obj) => {
        if (obj.type === "elevator" && obj.body && obj.data) {
          // Oscillate lift up and down
          const elapsed = (obj.data.elapsed ?? 0.0) + timeStep;
          obj.data.elapsed = elapsed;
          const speed = obj.data.speed ?? 1.5;
          const range = obj.data.range ?? 8.0;
          const offset = Math.sin(elapsed * speed) * range;
          obj.body.setNextKinematicTranslation({
            x: obj.startX!,
            y: (obj.startY ?? 0.0) + offset,
          });
        } else if (
          obj.type === "gate" &&
          obj.body &&
          obj.data &&
          obj.data.isOpen
        ) {
          // Slide gate open smoothly
          const currentY = obj.data.currentY;
          const targetY = obj.data.targetY;
          if (currentY !== undefined && targetY !== undefined) {
            if (Math.abs(currentY - targetY) > 0.05) {
              // Lerp position
              const nextY = currentY + (targetY - currentY) * 0.08;
              obj.data.currentY = nextY;
              obj.body.setNextKinematicTranslation({
                x: obj.startX!,
                y: nextY,
              });
            }
          }
        }
      });
    });
  }

  // Clean up whole simulation
  public destroy() {
    this.loadedTiles.forEach((_, key) => this.unloadTile(key));
    this.world = null;
    this.eventQueue = null;
    this.playerBody = null;
    this.playerCollider = null;
  }
}

// Export singleton instance
export const physics = new PhysicsEngine();
