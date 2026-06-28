import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { PerlinNoise } from "./noise.ts";

// Initialize Rapier Physics Engine
await RAPIER.init();

// --- CONSTANTS ---
const CHUNK_SIZE = 120;
const CHUNK_VERTICES = 32; // Low-poly resolution
const RENDER_RADIUS = 2; // 5x5 grid of chunks centered on player
const PHYSICS_DT = 1 / 60; // Physics simulation step size (60Hz)

// Noise and Terrain height parameters
const noise = new PerlinNoise(42139);

function getHeight(x: number, z: number): number {
  // Low-frequency mountain range mask (0 to 1+)
  const mountainMask = Math.max(
    0,
    noise.noise2D(x * 0.0006, z * 0.0006) * 1.6 + 0.4
  );

  // High-amplitude mountain terrain
  const baseMountain = noise.fbm2D(x * 0.0012, z * 0.0012, 4, 2.0, 0.45) * 75;

  // Gentle rolling hills / plains
  const flatPlains = noise.noise2D(x * 0.004, z * 0.004) * 3.5;

  // Smoothly interpolate between mountains and plains using the mask
  const baseHeight =
    baseMountain * mountainMask + flatPlains * (1 - Math.min(1, mountainMask));

  // Add high-frequency low-poly detail
  const detail = noise.noise2D(x * 0.015, z * 0.015) * 1.8;

  return baseHeight + detail;
}

// Check if a point is relatively flat (useful for safe spawn points)
function getSafeSpawnHeight(x: number, z: number): number {
  return getHeight(x, z);
}

// --- TERRAIN COLOR SYSTEM ---
const colorValley = new THREE.Color(0x070414); // Deep indigo
const colorPlain = new THREE.Color(0x130628); // Dark violet
const colorSlope = new THREE.Color(0x350847); // Neon purple
const colorPeak = new THREE.Color(0x760046); // Magenta peak
const colorTop = new THREE.Color(0xd90062); // Hot neon pink

function getTerrainColor(y: number): THREE.Color {
  const color = new THREE.Color();
  if (y < -15) {
    color.copy(colorValley);
  } else if (y < 5) {
    const t = (y + 15) / 20;
    color.lerpColors(colorValley, colorPlain, t);
  } else if (y < 25) {
    const t = (y - 5) / 20;
    color.lerpColors(colorPlain, colorSlope, t);
  } else if (y < 45) {
    const t = (y - 25) / 20;
    color.lerpColors(colorSlope, colorPeak, t);
  } else {
    const t = Math.min(1, (y - 45) / 20);
    color.lerpColors(colorPeak, colorTop, t);
  }
  return color;
}

// --- DUST & SMOKE TRAIL PARTICLE SYSTEM ---
class ParticleSystem {
  public mesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private count: number = 200;
  private positions: Float32Array;
  private velocities: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private lifetimes: Float32Array;
  private activeCount: number = 0;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.lifetimes = new Float32Array(this.count); // 0 = inactive, >0 = life remaining

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3)
    );
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3)
    );

    // Custom shader material for glowy square particles
    const material = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.Points(this.geometry, material);
    scene.add(this.mesh);
  }

  public spawn(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: THREE.Color,
    size: number,
    lifetime: number
  ) {
    let index = -1;
    for (let i = 0; i < this.count; i++) {
      if (this.lifetimes[i]! <= 0) {
        index = i;
        break;
      }
    }
    if (index === -1) return; // All particles active

    const i3 = index * 3;
    this.positions[i3] = pos.x;
    this.positions[i3 + 1] = pos.y;
    this.positions[i3 + 2] = pos.z;

    this.velocities[i3] = vel.x;
    this.velocities[i3 + 1] = vel.y;
    this.velocities[i3 + 2] = vel.z;

    this.colors[i3] = color.r;
    this.colors[i3 + 1] = color.g;
    this.colors[i3 + 2] = color.b;

    this.sizes[index] = size;
    this.lifetimes[index] = lifetime;
  }

  public update(dt: number) {
    const posAttr = this.geometry.attributes[
      "position"
    ] as THREE.BufferAttribute;

    for (let i = 0; i < this.count; i++) {
      const life = this.lifetimes[i];
      if (life !== undefined && life > 0) {
        this.lifetimes[i] = life - dt;

        const i3 = i * 3;
        const vx = this.velocities[i3] ?? 0;
        const vy = this.velocities[i3 + 1] ?? 0;
        const vz = this.velocities[i3 + 2] ?? 0;

        // Apply velocity
        this.positions[i3] = (this.positions[i3] ?? 0) + vx * dt;
        this.positions[i3 + 1] = (this.positions[i3 + 1] ?? 0) + vy * dt;
        this.positions[i3 + 2] = (this.positions[i3 + 2] ?? 0) + vz * dt;

        // Apply friction/gravity to particles
        this.velocities[i3] = vx * 0.95;
        this.velocities[i3 + 1] = vy + 0.5 * dt; // rise slightly
        this.velocities[i3 + 2] = vz * 0.95;

        // Fade colors out
        this.colors[i3] = (this.colors[i3] ?? 0) * 0.95;
        this.colors[i3 + 1] = (this.colors[i3 + 1] ?? 0) * 0.95;
        this.colors[i3 + 2] = (this.colors[i3 + 2] ?? 0) * 0.95;
      } else {
        // Reset position to far away if inactive
        const i3 = i * 3;
        this.positions[i3] = 99999;
        this.positions[i3 + 1] = 99999;
        this.positions[i3 + 2] = 99999;
      }
    }
    posAttr.needsUpdate = true;
    const colorAttr = this.geometry.attributes["color"];
    if (colorAttr) {
      colorAttr.needsUpdate = true;
    }
  }
}

// --- CHUNK CLASS ---
class Chunk {
  public key: string;
  public cx: number;
  public cz: number;
  private scene: THREE.Scene;
  private physicsWorld: RAPIER.World;

  public terrainMesh!: THREE.Mesh;
  public terrainBody!: RAPIER.RigidBody;

  public obstacleMeshes: THREE.Object3D[] = [];
  public obstacleBodies: RAPIER.RigidBody[] = [];

  constructor(
    cx: number,
    cz: number,
    scene: THREE.Scene,
    physicsWorld: RAPIER.World
  ) {
    this.key = `${cx},${cz}`;
    this.cx = cx;
    this.cz = cz;
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this.generateTerrain();
    this.generateObstacles();
  }

  private generateTerrain() {
    const geometry = new THREE.PlaneGeometry(
      CHUNK_SIZE,
      CHUNK_SIZE,
      CHUNK_VERTICES - 1,
      CHUNK_VERTICES - 1
    );

    const positionAttr = geometry.attributes[
      "position"
    ] as THREE.BufferAttribute;
    const vertexColors = new Float32Array(positionAttr.count * 3);

    const centerX = this.cx * CHUNK_SIZE;
    const centerZ = this.cz * CHUNK_SIZE;

    // Distort plane vertices based on noise height
    for (let i = 0; i < positionAttr.count; i++) {
      const px = positionAttr.getX(i);
      const py = positionAttr.getY(i);

      // Global coordinates
      const gx = centerX + px;
      const gz = centerZ - py; // Rotate plane space to X-Z coordinates

      const gy = getHeight(gx, gz);
      positionAttr.setZ(i, gy);

      // Height coloring
      const color = getTerrainColor(gy);
      const idx = i * 3;
      vertexColors[idx] = color.r;
      vertexColors[idx + 1] = color.g;
      vertexColors[idx + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));

    // Convert flat plane to lay in X-Z space
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();

    // Terrain material: matte, flat shaded, custom vertex colors
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.1,
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.position.set(centerX, 0, centerZ);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = false;
    this.scene.add(this.terrainMesh);

    // Physics trimesh generation
    // Extract transformed vertices and index arrays for physics trimesh matching
    const vertices = geometry.attributes["position"]!.array as Float32Array;
    const indices = geometry.index
      ? (geometry.index.array as Uint32Array)
      : new Uint32Array();

    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    // Translation matches chunk mesh position
    rigidBodyDesc.setTranslation(centerX, 0, centerZ);

    this.terrainBody = this.physicsWorld.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    colliderDesc.setCollisionGroups(65539);
    this.physicsWorld.createCollider(colliderDesc, this.terrainBody);

    // Tag static body for collision checks
    this.terrainBody.userData = { type: "terrain" };
  }

  private generateObstacles() {
    // Seeded random for consistency
    let seed = Math.sin(this.cx * 12.9898 + this.cz * 78.233) * 43758.5453;
    seed = seed - Math.floor(seed);
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // Scatter 3-6 obstacles per chunk
    const numObstacles = 3 + Math.floor(random() * 4);
    const centerX = this.cx * CHUNK_SIZE;
    const centerZ = this.cz * CHUNK_SIZE;

    for (let i = 0; i < numObstacles; i++) {
      // Relative offset within chunk
      const rx = random() * CHUNK_SIZE - CHUNK_SIZE / 2;
      const rz = random() * CHUNK_SIZE - CHUNK_SIZE / 2;

      // Keep spacing away from absolute chunk center (in case player spawns there at origin)
      if (this.cx === 0 && this.cz === 0 && Math.sqrt(rx * rx + rz * rz) < 15) {
        continue;
      }

      const gx = centerX + rx;
      const gz = centerZ + rz;
      const gy = getHeight(gx, gz);

      // Select randomized obstacle types
      const type = Math.floor(random() * 3);
      let mesh: THREE.Mesh;
      let colliderDesc: RAPIER.ColliderDesc;
      let height: number;

      if (type === 0) {
        // Neon Monolith / Pillar
        height = 12 + random() * 12;
        const radius = 1.8 + random() * 1.5;
        const geom = new THREE.CylinderGeometry(
          radius * 0.8,
          radius,
          height,
          5
        );
        const mat = new THREE.MeshStandardMaterial({
          color: 0x00f0ff,
          flatShading: true,
          roughness: 0.3,
          emissive: 0x005577,
        });
        mesh = new THREE.Mesh(geom, mat);
        // Cylinder collider
        colliderDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius);
      } else if (type === 1) {
        // Cyber Pyramid
        height = 8 + random() * 6;
        const radius = 3 + random() * 3;
        const geom = new THREE.ConeGeometry(radius, height, 4);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xff007f,
          flatShading: true,
          roughness: 0.4,
          emissive: 0x660033,
        });
        mesh = new THREE.Mesh(geom, mat);
        // Approximate cone with a cylinder collider for simplicity & stability
        colliderDesc = RAPIER.ColliderDesc.cylinder(height / 2, radius * 0.6);
      } else {
        // Warning Obstacle Box
        const w = 3 + random() * 3;
        const h = 3 + random() * 3;
        const d = 3 + random() * 3;
        height = h;
        const geom = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffbb00,
          flatShading: true,
          roughness: 0.5,
        });
        mesh = new THREE.Mesh(geom, mat);
        // Cuboid collider
        colliderDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2);
      }

      // Position visual mesh (Three.js center is at height/2)
      mesh.position.set(gx, gy + height / 2 - 0.2, gz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.obstacleMeshes.push(mesh);

      // Create static rigid body
      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
      bodyDesc.setTranslation(gx, gy + height / 2 - 0.2, gz);
      const body = this.physicsWorld.createRigidBody(bodyDesc);
      colliderDesc.setCollisionGroups(65539);
      this.physicsWorld.createCollider(colliderDesc, body);
      body.userData = { type: "obstacle" };

      this.obstacleBodies.push(body);
    }
  }

  public destroy() {
    // Remove terrain
    this.scene.remove(this.terrainMesh);
    this.terrainMesh.geometry.dispose();
    if (Array.isArray(this.terrainMesh.material)) {
      this.terrainMesh.material.forEach((m) => m.dispose());
    } else {
      this.terrainMesh.material.dispose();
    }
    this.physicsWorld.removeRigidBody(this.terrainBody);

    // Remove obstacles
    for (const mesh of this.obstacleMeshes) {
      this.scene.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        const m = mesh as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
        m.geometry.dispose();
        m.material.dispose();
      }
    }
    for (const body of this.obstacleBodies) {
      this.physicsWorld.removeRigidBody(body);
    }

    this.obstacleMeshes = [];
    this.obstacleBodies = [];
  }
}

// --- GAME CONTROLLER STATE ---
type GameState = "START" | "PLAYING" | "CRASHED";

class Game {
  private state: GameState = "START";
  private container: HTMLDivElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private dirLight!: THREE.DirectionalLight;
  private ambLight!: THREE.AmbientLight;

  private physicsWorld!: RAPIER.World;
  private loadedChunks = new Map<string, Chunk>();
  private particles!: ParticleSystem;

  // Input states
  private keys = {
    w: false,
    s: false,
    a: false,
    d: false,
    r: false,
    space: false,
  };

  // Vehicle data
  private carChassisMesh!: THREE.Group;
  private carBody!: RAPIER.RigidBody;
  private carCollider!: RAPIER.Collider;

  // Driving metrics
  private engineProgressTime = 0;
  private terminalSpeed = 0;
  private distanceDriven = 0;
  private maxSpeed = 0;
  private lastPosition = new THREE.Vector3();
  private prevVelocity = new THREE.Vector3();

  // Debris parts for explosion
  private debrisMeshes: THREE.Mesh[] = [];
  private debrisBodies: RAPIER.RigidBody[] = [];

  constructor() {
    this.container = document.getElementById("ui-container") as HTMLDivElement;
    this.initGraphics();
    this.initPhysics();
    this.initInput();
    this.spawnCar();
    this.updateChunks();

    // DOM UI bindings
    document
      .getElementById("start-button")!
      .addEventListener("click", () => this.startGame());
    document
      .getElementById("restart-button")!
      .addEventListener("click", () => this.restartGame());

    // Start render loop
    let lastTime = performance.now();
    const tick = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000); // Caps delta time to avoid physics explosion
      lastTime = time;

      this.update(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private initGraphics() {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0914, 0.0035);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.2,
      1000
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Dual-tone neon lighting
    this.ambLight = new THREE.AmbientLight(0x00eaff, 0.4);
    this.scene.add(this.ambLight);

    this.dirLight = new THREE.DirectionalLight(0xff007f, 1.3);
    this.dirLight.position.set(120, 160, 60);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 500;

    const d = 150;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;

    this.scene.add(this.dirLight);

    // Grid helper overlay to anchor synthwave aesthetics
    const gridHelper = new THREE.GridHelper(1000, 100, 0xff007f, 0x1d0f39);
    gridHelper.position.y = -10;
    this.scene.add(gridHelper);

    // Setup Particles
    this.particles = new ParticleSystem(this.scene);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private initPhysics() {
    // Custom gravity slightly elevated for snappy arcade controls
    this.physicsWorld = new RAPIER.World({ x: 0, y: -16, z: 0 });
  }

  private initInput() {
    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const key = e.key.toLowerCase();
      if (key === "w" || e.key === "ArrowUp") this.keys.w = isDown;
      if (key === "s" || e.key === "ArrowDown") this.keys.s = isDown;
      if (key === "a" || e.key === "ArrowLeft") this.keys.a = isDown;
      if (key === "d" || e.key === "ArrowRight") this.keys.d = isDown;
      if (key === "r") this.keys.r = isDown;
      if (e.key === " ") {
        this.keys.space = isDown;
        if (isDown && this.state === "CRASHED") {
          this.restartGame();
        }
      }
    };

    window.addEventListener("keydown", (e) => handleKey(e, true));
    window.addEventListener("keyup", (e) => handleKey(e, false));
  }

  private spawnCar() {
    this.carChassisMesh = new THREE.Group();

    // Chassis visual (the single rectangle)
    const chassisGeom = new THREE.BoxGeometry(1.7, 0.45, 3.4);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0xff007f, // Neon pink box
      flatShading: true,
      roughness: 0.15,
      metalness: 0.8,
    });
    const chassis = new THREE.Mesh(chassisGeom, chassisMat);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.carChassisMesh.add(chassis);

    this.scene.add(this.carChassisMesh);

    // --- Create Physical Rigid Body ---
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(0, 3, 0); // Start slightly above terrain
    bodyDesc.setLinearDamping(0.2); // Air resistance
    bodyDesc.setAngularDamping(0.85); // Prevent wild rotation spins

    this.carBody = this.physicsWorld.createRigidBody(bodyDesc);

    // Box collider matching the chassis dimensions
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.85, 0.225, 1.7);
    colliderDesc.setFriction(0.04); // Low friction to slide smoothly
    colliderDesc.setRestitution(0.15);
    colliderDesc.setCollisionGroups(131073);

    this.carCollider = this.physicsWorld.createCollider(
      colliderDesc,
      this.carBody
    );

    this.carBody.setAdditionalMass(900, true);

    this.lastPosition.copy(this.carChassisMesh.position);
  }

  private startGame() {
    this.state = "PLAYING";
    document.getElementById("start-screen")!.classList.remove("active");
    document.getElementById("hud")!.classList.add("active");
    this.resetCar(0, 0);
  }

  private restartGame() {
    this.state = "PLAYING";
    document.getElementById("crash-screen")!.classList.remove("active");
    document.getElementById("hud")!.classList.add("active");

    // Clear wreckage
    this.clearDebris();

    // Spawn near the crash site, but safe and elevated
    const spawnX = this.carChassisMesh.position.x;
    const spawnZ = this.carChassisMesh.position.z;
    this.resetCar(spawnX, spawnZ);
  }

  private resetCar(x: number, z: number) {
    const h = getSafeSpawnHeight(x, z);

    // Reset velocities and transform
    this.carBody.setTranslation({ x, y: h + 3.0, z }, true);
    this.carBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.carBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.carBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.carChassisMesh.position.set(x, h + 3.0, z);
    this.carChassisMesh.rotation.set(0, 0, 0);
    this.carChassisMesh.visible = true;

    // Reset speeds
    this.engineProgressTime = 0;
    this.lastPosition.copy(this.carChassisMesh.position);
    this.prevVelocity.set(0, 0, 0);

    // Wake up body
    this.carBody.wakeUp();
  }

  private triggerCrash() {
    if (this.state !== "PLAYING") return;
    this.state = "CRASHED";

    // Setup terminal info
    const linvel = this.carBody.linvel();
    const speedMS = Math.sqrt(
      linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z
    );
    const speedKMH = Math.floor(speedMS * 3.6);
    this.terminalSpeed = speedKMH;

    // Update terminal HUD panel
    document.getElementById("hud")!.classList.remove("active");
    document.getElementById("crash-screen")!.classList.add("active");
    document.getElementById("crash-speed")!.innerText = `${speedKMH} km/h`;
    document.getElementById("crash-distance")!.innerText =
      `${(this.distanceDriven / 1000).toFixed(2)} km`;

    const carPos = this.carChassisMesh.position;
    const carRot = this.carChassisMesh.quaternion;

    // Hide main car mesh
    this.carChassisMesh.visible = false;

    // Lock dynamic motion of active body
    this.carBody.setLinvel({ x: 0, y: 0, z: 0 }, false);
    this.carBody.setAngvel({ x: 0, y: 0, z: 0 }, false);

    // Create 4 pieces of physical debris
    const debrisSpecs = [
      {
        geom: new THREE.BoxGeometry(0.85, 0.22, 1.7),
        color: 0xff007f,
        offset: new THREE.Vector3(-0.425, 0, 0.85),
      },
      {
        geom: new THREE.BoxGeometry(0.85, 0.22, 1.7),
        color: 0xff007f,
        offset: new THREE.Vector3(0.425, 0, 0.85),
      },
      {
        geom: new THREE.BoxGeometry(0.85, 0.22, 1.7),
        color: 0xff007f,
        offset: new THREE.Vector3(-0.425, 0, -0.85),
      },
      {
        geom: new THREE.BoxGeometry(0.85, 0.22, 1.7),
        color: 0xff007f,
        offset: new THREE.Vector3(0.425, 0, -0.85),
      },
    ];

    debrisSpecs.forEach((spec) => {
      // Calculate world offset
      const partOffsetWorld = new THREE.Vector3()
        .copy(spec.offset)
        .applyQuaternion(carRot);
      const partPosWorld = new THREE.Vector3()
        .copy(carPos)
        .add(partOffsetWorld);

      // Create mesh
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(spec.geom, mat);
      mesh.position.copy(partPosWorld);
      mesh.quaternion.copy(carRot);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.debrisMeshes.push(mesh);

      // Physics Rigid Body
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic();
      bodyDesc.setTranslation(partPosWorld.x, partPosWorld.y, partPosWorld.z);
      bodyDesc.setRotation(carRot);

      const body = this.physicsWorld.createRigidBody(bodyDesc);

      // Select appropriate collider
      const p = spec.geom.parameters;
      const colDesc = RAPIER.ColliderDesc.cuboid(
        p.width / 2,
        p.height / 2,
        p.depth / 2
      );
      colDesc.setCollisionGroups(131073);

      this.physicsWorld.createCollider(colDesc, body);

      // Inherit velocity and add explosion radial burst
      const impulseDirection = new THREE.Vector3()
        .copy(partOffsetWorld)
        .normalize();
      if (impulseDirection.lengthSq() === 0) {
        impulseDirection
          .set(Math.random() - 0.5, 0.5, Math.random() - 0.5)
          .normalize();
      }

      const burstSpeed = 8 + Math.random() * 12;
      const initialVel = {
        x: linvel.x + impulseDirection.x * burstSpeed,
        y: Math.max(5, linvel.y + impulseDirection.y * burstSpeed + 4), // pop upwards
        z: linvel.z + impulseDirection.z * burstSpeed,
      };

      body.setLinvel(initialVel, true);
      body.setAngvel(
        {
          x: (Math.random() - 0.5) * 12,
          y: (Math.random() - 0.5) * 12,
          z: (Math.random() - 0.5) * 12,
        },
        true
      );

      this.debrisBodies.push(body);
    });

    // Spawn massive burst of fire & spark particles
    const particleColors = [
      new THREE.Color(0xff0055), // Hot pink
      new THREE.Color(0xff7700), // Fire orange
      new THREE.Color(0xffdd00), // Fire yellow
      new THREE.Color(0x00f0ff), // Cyber flame spark
    ];

    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.3) * Math.PI * 0.5;
      const speed = 10 + Math.random() * 25;

      const particleVel = new THREE.Vector3(
        Math.cos(angle) * Math.cos(pitch) * speed,
        Math.sin(pitch) * speed + 5,
        Math.sin(angle) * Math.cos(pitch) * speed
      );

      // Spawn near centers
      const randOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );

      const startPos = new THREE.Vector3().copy(carPos).add(randOffset);
      const color =
        particleColors[Math.floor(Math.random() * particleColors.length)]!;

      this.particles.spawn(
        startPos,
        particleVel,
        color,
        1.2 + Math.random(),
        1.0 + Math.random() * 0.8
      );
    }
  }

  private clearDebris() {
    this.debrisMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    this.debrisBodies.forEach((body) => {
      this.physicsWorld.removeRigidBody(body);
    });
    this.debrisMeshes = [];
    this.debrisBodies = [];
  }

  private updateChunks() {
    const carPos = this.carChassisMesh.position;

    // Find current chunk center
    const cx = Math.round(carPos.x / CHUNK_SIZE);
    const cz = Math.round(carPos.z / CHUNK_SIZE);

    const activeKeys = new Set<string>();

    // Load nearby chunks
    for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
      for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
        const kx = cx + dx;
        const kz = cz + dz;
        const key = `${kx},${kz}`;
        activeKeys.add(key);

        if (!this.loadedChunks.has(key)) {
          const chunk = new Chunk(kx, kz, this.scene, this.physicsWorld);
          this.loadedChunks.set(key, chunk);
        }
      }
    }

    // Unload chunks outside boundary
    for (const [key, chunk] of this.loadedChunks.entries()) {
      if (!activeKeys.has(key)) {
        chunk.destroy();
        this.loadedChunks.delete(key);
      }
    }
  }

  private updatePhysics(dt: number) {
    if (this.state !== "PLAYING") return;

    const carPos = this.carBody.translation();
    const carRot = this.carBody.rotation();
    const linvel = this.carBody.linvel();

    const threePos = new THREE.Vector3(carPos.x, carPos.y, carPos.z);
    const threeRot = new THREE.Quaternion(
      carRot.x,
      carRot.y,
      carRot.z,
      carRot.w
    );

    const currentVelocityVec = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    const currentSpeed = currentVelocityVec.length();

    // Car Direction Vectors
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(threeRot);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(threeRot);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(threeRot);

    // Quick reset fallback key check
    if (this.keys.r) {
      this.resetCar(threePos.x, threePos.z);
      return;
    }

    // Slowly increase engine force multiplier when W is held consistently
    if (this.keys.w) {
      this.engineProgressTime += dt;
    } else {
      this.engineProgressTime = Math.max(0, this.engineProgressTime - dt * 2);
    }

    // Progression multiplier: builds up to 3.5x engine power over 8 seconds
    const accelerationMultiplier =
      1.0 + Math.min(2.5, this.engineProgressTime * 0.3);

    // Apply engine force (slides forward or backward)
    const inputFwd = this.keys.w ? 1 : this.keys.s ? -0.5 : 0;
    const ENGINE_FORCE = 3500;
    const forceMag = inputFwd * ENGINE_FORCE * accelerationMultiplier;
    this.carBody.addForce(
      {
        x: forward.x * forceMag,
        y: forward.y * forceMag,
        z: forward.z * forceMag,
      },
      true
    );

    // Apply steering (rotate around local Y axis directly)
    let turnSpeed = 0;
    if (this.keys.a) turnSpeed = 2.2;
    else if (this.keys.d) turnSpeed = -2.2;

    const currentAngvel = this.carBody.angvel();
    // Directly set angular velocity scaled by local up normal
    this.carBody.setAngvel(
      {
        x: currentAngvel.x * 0.9 + up.x * turnSpeed * 0.1,
        y: up.y * turnSpeed,
        z: currentAngvel.z * 0.9 + up.z * turnSpeed * 0.1,
      },
      true
    );

    // Project linear velocity to sliding frame
    const fwdSpeed = currentVelocityVec.dot(forward);
    const lateralSpeed = currentVelocityVec.dot(right);

    // Lateral grip friction to prevent slipping sideways
    const LATERAL_DAMPING = 6.0;
    const latDampForce = -lateralSpeed * LATERAL_DAMPING * 900;
    this.carBody.addForce(
      {
        x: right.x * latDampForce,
        y: right.y * latDampForce,
        z: right.z * latDampForce,
      },
      true
    );

    // Apply brake forces / rolling resistance
    const ROLLING_RESISTANCE = 180;
    const BRAKE_FORCE = 5000;
    const sign = Math.sign(fwdSpeed);
    const rollResistanceMag = -sign * ROLLING_RESISTANCE;

    // Hard braking if input opposes velocity direction
    const braking =
      (this.keys.s && fwdSpeed > 0.1) || (this.keys.w && fwdSpeed < -0.1);
    const brakeForceMag = braking ? -sign * BRAKE_FORCE : 0;

    const dragMag = rollResistanceMag + brakeForceMag;
    this.carBody.addForce(
      {
        x: forward.x * dragMag,
        y: forward.y * dragMag,
        z: forward.z * dragMag,
      },
      true
    );

    // Spawn trail dust particles behind the sliding box
    if (currentSpeed > 3) {
      const backOffset = new THREE.Vector3(0, -0.2, -1.6).applyQuaternion(
        threeRot
      );
      const backPosWorld = new THREE.Vector3().copy(threePos).add(backOffset);
      const particleVel = new THREE.Vector3()
        .copy(forward)
        .multiplyScalar(-currentSpeed * 0.3)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            Math.random() * 2 + 0.5,
            (Math.random() - 0.5) * 1.5
          )
        );

      const dustColor = new THREE.Color()
        .copy(colorSlope)
        .lerp(new THREE.Color(0x350847), Math.random() * 0.4);
      this.particles.spawn(
        backPosWorld,
        particleVel,
        dustColor,
        0.7,
        0.5 + Math.random() * 0.4
      );
    }

    // Keep car upright (stabilize high pitch and roll tipping slightly)
    const carUpY = up.y; // 1 = upright, -1 = upside down

    // Self-righting torque if tipped excessively
    if (carUpY < 0.65) {
      const targetUp = new THREE.Vector3(0, 1, 0);
      const tiltAxis = new THREE.Vector3()
        .crossVectors(up, targetUp)
        .normalize();
      const tiltAngle = Math.acos(Math.max(-1, Math.min(1, up.dot(targetUp))));

      if (tiltAngle > 0.15) {
        // Apply restorative torque proportional to tilt
        const torqueStrength = tiltAngle * 3500;
        this.carBody.addTorque(
          {
            x: tiltAxis.x * torqueStrength,
            y: tiltAxis.y * torqueStrength,
            z: tiltAxis.z * torqueStrength,
          },
          true
        );
      }
    }

    // CRASH DETECTION SOLVER
    // 1. Deceleration Check (hitting static obstacle/terrain head-on)

    // Deceleration = delta velocity / dt
    const velocityDiff = new THREE.Vector3()
      .copy(currentVelocityVec)
      .sub(this.prevVelocity);
    const deceleration = velocityDiff.length() / dt;
    this.prevVelocity.copy(currentVelocityVec);

    // If deceleration is very high, trigger crash
    if (deceleration > 480 && currentSpeed > 10) {
      this.triggerCrash();
      return;
    }

    // 2. Direct Obstacle Contact Manifolds Check
    // Iterate over contact pairs to see if chassis is clipping/touching an obstacle
    this.physicsWorld.contactPairsWith(
      this.carCollider,
      (otherCollider: RAPIER.Collider) => {
        const otherBody = otherCollider.parent();
        if (otherBody) {
          const tag = otherBody.userData as
            | { type?: string }
            | null
            | undefined;
          if (tag && tag.type === "obstacle") {
            // Collision with an obstacle: if speed is moderate/high, explode!
            if (currentSpeed > 11.5) {
              this.triggerCrash();
            }
          }
        }
      }
    );
  }

  private update(dt: number) {
    // Accumulate fixed physical timesteps
    let accumulator = 0;
    accumulator += dt;

    // Cap step execution to avoid infinite frame locking
    const maxSteps = 4;
    let steps = 0;
    while (accumulator >= PHYSICS_DT && steps < maxSteps) {
      this.updatePhysics(PHYSICS_DT);
      this.physicsWorld.step();
      accumulator -= PHYSICS_DT;
      steps++;
    }

    // Sync three.js mesh with rigid body transform
    if (this.state === "PLAYING") {
      const carPos = this.carBody.translation();
      const carRot = this.carBody.rotation();
      this.carChassisMesh.position.set(carPos.x, carPos.y, carPos.z);
      this.carChassisMesh.quaternion.set(
        carRot.x,
        carRot.y,
        carRot.z,
        carRot.w
      );

      // Track distance driven
      const distStep = this.carChassisMesh.position.distanceTo(
        this.lastPosition
      );
      this.distanceDriven += distStep;
      this.lastPosition.copy(this.carChassisMesh.position);

      this.updateChunks();
    } else if (this.state === "CRASHED") {
      // Wreckage parts tracking
      for (let i = 0; i < this.debrisBodies.length; i++) {
        const body = this.debrisBodies[i]!;
        const mesh = this.debrisMeshes[i]!;
        const p = body.translation();
        const r = body.rotation();
        mesh.position.set(p.x, p.y, p.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    }

    // Update particles
    this.particles.update(dt);

    // --- CAMERA ENGINE (Smoothed third person follow + dynamic shake) ---
    this.updateCamera(dt);

    // --- HUD UPDATER ---
    this.updateHUD();
  }

  private updateCamera(dt: number) {
    const target =
      this.state === "CRASHED" && this.debrisMeshes[0]
        ? this.debrisMeshes[0].position
        : this.carChassisMesh.position;

    // Linear speed metric
    const linvel = this.carBody.linvel();
    const speedMS = Math.sqrt(
      linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z
    );

    // Dynamic FOV based on speed
    const baseFOV = 60;
    const speedFOVFactor = Math.min(22, speedMS * 0.45);
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      baseFOV + speedFOVFactor,
      dt * 5
    );
    this.camera.updateProjectionMatrix();

    // Camera offset vector (follows from behind)
    const carRot =
      this.state === "CRASHED" && this.debrisMeshes[0]
        ? this.debrisMeshes[0].quaternion
        : this.carChassisMesh.quaternion;

    const backVec = new THREE.Vector3(0, 0, -1).applyQuaternion(carRot);
    // Project backVec to X-Z plane to avoid vertical rotation loop
    backVec.y = 0;
    backVec.normalize();

    // Base height offset + horizontal offset distance
    const lookDist = 9.5 + Math.min(4, speedMS * 0.08);
    const lookHeight = 3.2 + Math.min(2, speedMS * 0.04);

    const targetCamPos = new THREE.Vector3()
      .copy(target)
      .addScaledVector(backVec, -lookDist)
      .add(new THREE.Vector3(0, lookHeight, 0));

    // Smoothly lerp camera position
    this.camera.position.lerp(targetCamPos, dt * 6.5);

    // Point camera at the car
    const lookTarget = new THREE.Vector3()
      .copy(target)
      .add(new THREE.Vector3(0, 0.5, 0));
    this.camera.lookAt(lookTarget);

    // Speed shake effect
    if (speedMS > 18 && this.state === "PLAYING") {
      const shakeStrength = (speedMS - 18) * 0.0015;
      this.camera.position.x += (Math.random() - 0.5) * shakeStrength;
      this.camera.position.y += (Math.random() - 0.5) * shakeStrength;
      this.camera.position.z += (Math.random() - 0.5) * shakeStrength;
    }

    // Extreme crash shake
    if (this.state === "CRASHED") {
      const elapsed = Math.max(0, 1.5 - (performance.now() % 1500) / 1000); // fade out shake
      const shakeStrength = elapsed * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * shakeStrength;
      this.camera.position.y += (Math.random() - 0.5) * shakeStrength;
      this.camera.position.z += (Math.random() - 0.5) * shakeStrength;
    }

    // Position sun light to follow player for endless shadow map coverage
    this.dirLight.position.set(target.x + 120, target.y + 160, target.z + 60);
    this.dirLight.target = this.carChassisMesh;
  }

  private updateHUD() {
    if (this.state !== "PLAYING") return;

    const linvel = this.carBody.linvel();
    const speedMS = Math.sqrt(
      linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z
    );
    const speedKMH = Math.floor(speedMS * 3.6);

    if (speedKMH > this.maxSpeed) {
      this.maxSpeed = speedKMH;
    }

    // Set numeric text
    const displaySpeedStr = String(speedKMH).padStart(3, "0");
    document.getElementById("speed-number")!.innerText = displaySpeedStr;

    // Fill SVG gauge circle (circumference = 2 * PI * r = 2 * 3.1416 * 50 = 314.16)
    const maxGaugeSpeed = 160; // scale gauge up to 160 KM/H
    const fillPercent = Math.min(1, speedKMH / maxGaugeSpeed);
    const dashOffset = 314.16 * (1 - fillPercent);
    const speedRing = document.getElementById(
      "speed-ring-fill"
    ) as SVGElement | null;
    if (speedRing) {
      speedRing.style.strokeDashoffset = String(dashOffset);
    }

    // Top bars update
    document.getElementById("stat-distance")!.innerText =
      `${(this.distanceDriven / 1000).toFixed(2)} km`;
    document.getElementById("stat-altitude")!.innerText =
      `${Math.round(this.carChassisMesh.position.y)} m`;
    document.getElementById("stat-max-speed")!.innerText =
      `${this.maxSpeed} km/h`;

    // Glow bar based on acceleration progression
    const speedGlow = document.getElementById("speed-indicator-glow")!;
    if (speedGlow) {
      // Glow intensity maps progression
      const opacity = Math.min(0.9, this.engineProgressTime * 0.1);
      speedGlow.style.opacity = String(opacity);
      speedGlow.style.boxShadow = `0 0 ${10 + opacity * 30}px #00f0ff`;
    }
  }

  // Render loop calls renderer
  public render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// Start simulation on load
const game = new Game();

// Hook renderer to animation frame loop (binds inside Game constructor)
function loop() {
  game.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
