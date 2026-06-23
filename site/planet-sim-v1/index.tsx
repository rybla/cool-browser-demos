import * as THREE from "three";

// ==========================================
// 1. SEEDED RANDOM & PERLIN NOISE
// ==========================================

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  // Mulberry32 generator
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  choice<T>(arr: T[]): T {
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx]!;
  }
}

class ImprovedNoise {
  private p: number[] = new Array(512);
  constructor(rng: SeededRandom) {
    const permutation = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const temp = permutation[i]!;
      permutation[i] = permutation[j]!;
      permutation[j] = temp;
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255]!;
    }
  }
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }
  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  noise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.p[X]! + Y;
    const AA = this.p[A]! + Z;
    const AB = this.p[A + 1]! + Z;
    const B = this.p[X + 1]! + Y;
    const BA = this.p[B]! + Z;
    const BB = this.p[B + 1]! + Z;

    return this.lerp(
      w,
      this.lerp(
        v,
        this.lerp(
          u,
          this.grad(this.p[AA]!, x, y, z),
          this.grad(this.p[BA]!, x - 1, y, z)
        ),
        this.lerp(
          u,
          this.grad(this.p[AB]!, x, y - 1, z),
          this.grad(this.p[BB]!, x - 1, y - 1, z)
        )
      ),
      this.lerp(
        v,
        this.lerp(
          u,
          this.grad(this.p[AA + 1]!, x, y, z - 1),
          this.grad(this.p[BA + 1]!, x - 1, y, z - 1)
        ),
        this.lerp(
          u,
          this.grad(this.p[AB + 1]!, x, y - 1, z - 1),
          this.grad(this.p[BB + 1]!, x - 1, y - 1, z - 1)
        )
      )
    );
  }
}

function getOctaveNoise(
  noiseGen: ImprovedNoise,
  x: number,
  y: number,
  z: number,
  octaves: number = 4
): number {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    value +=
      amplitude * noiseGen.noise(x * frequency, y * frequency, z * frequency);
    maxVal += amplitude;
    amplitude *= 0.45;
    frequency *= 2.1;
  }
  return value / maxVal;
}

// ==========================================
// 2. SIMULATION CONSTANTS & TYPES
// ==========================================

const PLANET_RADIUS = 15;
const WATER_LEVEL_RATIO = 0.98; // water radius relative to PLANET_RADIUS
const WATER_RADIUS = PLANET_RADIUS * WATER_LEVEL_RATIO;

type BiomeType = "ocean" | "desert" | "forest" | "mountain";

interface GridNode {
  id: number;
  position: THREE.Vector3; // Direction vector, length = 1
  elevation: number; // Height displacement
  actualPosition: THREE.Vector3; // position scaled by height
  biome: BiomeType;
  temperature: number; // 0 to 1
  moisture: number; // 0 to 1
  vegetation: number; // 0 to 1 (Forest tree growth)
  algae: number; // 0 to 1 (Ocean plankton/algae)
  neighbors: number[]; // Adjacent node IDs
  occupant: Creature | null;
  tileMeshGroup: THREE.Group | null;
}

type SpeciesType = "serpent" | "sheep" | "stalker" | "scarab" | "scythe";

type CreatureState =
  | "roaming"
  | "seeking_food"
  | "fleeing"
  | "hunting"
  | "diving"
  | "climbing"
  | "roosting"
  | "burrowed";

interface Creature {
  id: number;
  type: SpeciesType;
  node: GridNode;
  targetNode: GridNode | null;
  moveProgress: number; // 0 to 1
  energy: number;
  age: number;
  state: CreatureState;
  stateTimer: number;
  model: THREE.Group;
  actionProgress: number; // custom variable for dive/climb/eat animations
  huntTarget: Creature | null;
  // Articulated components for animations
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  jaws: THREE.Object3D[];
  tail: THREE.Object3D | null;
  body: THREE.Object3D | null;
}

type WeatherType = "clear" | "rain" | "snow" | "sandstorm";

// ==========================================
// 3. SEEDED ECOSYSTEM RESTART SETUP
// ==========================================

let rng = new SeededRandom(12345);
let noiseGen = new ImprovedNoise(rng);

let nodes: GridNode[] = [];
let creatures: Creature[] = [];
let nextCreatureId = 1;

let isPaused = false;
let simulationSpeed = 1; // 1x, 2x, 4x
const tickInterval = 200; // ms per simulation tick (base 5 ticks/sec)
let lastTickTime = 0;
let simTimeTicks = 0;

let currentWeather: WeatherType = "clear";
let weatherTimer = 300; // ticks before random change
let windDirection = rng.range(0, Math.PI * 2);
let windSpeed = 3.0; // m/s

let selectedNode: GridNode | null = null;
const feedLogs: string[] = [];

// ==========================================
// 4. THREE.JS SCENE GLOBALS
// ==========================================

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;

let planetGroup: THREE.Group;
let terrainMesh: THREE.Mesh;
let oceanMesh: THREE.Mesh;
let atmosphereMesh: THREE.Mesh;
let creaturesGroup: THREE.Group;

// Weather particle groups
let rainParticles: THREE.Points;
let snowParticles: THREE.Points;
let stormParticles: THREE.Points;
let cloudGroup: THREE.Group;

// Lighting
let dirLightParent: THREE.Group; // Rotate this for day/night
let sunLight: THREE.DirectionalLight;
let moonLight: THREE.PointLight;
let ambientLight: THREE.AmbientLight;

// Camera drag rotation controls
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraRadius = 42;
let cameraTheta = 0.5; // horizontal rot
let cameraPhi = Math.PI / 2.2; // vertical rot

// Raycasting for clicking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Track clock for animations
const animationClock = new THREE.Clock();

// ==========================================
// 5. PROCEDURAL MODEL GENERATION
// ==========================================

// --- Tree Models ---
function createPineTree(treeRng: SeededRandom): THREE.Group {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 5);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.9,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.3;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const foliageColor = treeRng.choice([0x064e3b, 0x065f46, 0x14532d]);
  const leafMat = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: 0.8,
    flatShading: true,
  });

  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const scale = 1.0 - i * 0.25;
    const coneGeo = new THREE.ConeGeometry(0.4 * scale, 0.7 * scale, 5);
    const cone = new THREE.Mesh(coneGeo, leafMat);
    cone.position.y = 0.6 + i * 0.35;
    cone.castShadow = true;
    group.add(cone);
  }
  return group;
}

function createOakTree(treeRng: SeededRandom): THREE.Group {
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c2e0b,
    roughness: 0.9,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.25;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const foliageColor = treeRng.choice([0x15803d, 0x166534, 0x1e3a1e]);
  const leafMat = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: 0.8,
    flatShading: true,
  });
  const sphereGeo = new THREE.DodecahedronGeometry(0.35, 1);

  // Cluster of foliage spheres
  const positions = [
    new THREE.Vector3(0, 0.5, 0),
    new THREE.Vector3(0.18, 0.65, 0.1),
    new THREE.Vector3(-0.15, 0.6, -0.15),
    new THREE.Vector3(-0.1, 0.7, 0.15),
    new THREE.Vector3(0.15, 0.55, -0.1),
  ];

  positions.forEach((p) => {
    const mesh = new THREE.Mesh(sphereGeo, leafMat);
    mesh.position.copy(p);
    mesh.castShadow = true;
    group.add(mesh);
  });
  return group;
}

function createBirchTree(treeRng: SeededRandom): THREE.Group {
  const group = new THREE.Group();
  // Birch trunk is white with grey rings
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.8, 5);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.6,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.4;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Black stripes simulated with small thin rings
  const ringGeo = new THREE.CylinderGeometry(0.091, 0.091, 0.02, 5);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.9,
  });
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.15 + i * 0.18;
    ring.rotation.y = treeRng.range(0, Math.PI);
    group.add(ring);
  }

  const foliageColor = treeRng.choice([0x22c55e, 0x16a34a, 0x15803d]);
  const leafMat = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: 0.7,
    flatShading: true,
  });

  // Puffy foliage
  const leafGeo = new THREE.DodecahedronGeometry(0.3, 1);
  const leaf1 = new THREE.Mesh(leafGeo, leafMat);
  leaf1.position.set(0, 0.85, 0);
  leaf1.castShadow = true;
  group.add(leaf1);

  const leaf2 = new THREE.Mesh(leafGeo, leafMat);
  leaf2.position.set(0.15, 0.7, 0.1);
  leaf2.scale.set(0.8, 0.8, 0.8);
  leaf2.castShadow = true;
  group.add(leaf2);

  const leaf3 = new THREE.Mesh(leafGeo, leafMat);
  leaf3.position.set(-0.12, 0.75, -0.1);
  leaf3.scale.set(0.7, 0.7, 0.7);
  leaf3.castShadow = true;
  group.add(leaf3);

  return group;
}

// --- Mountain Spire Model ---
function createMountainSpire(height: number, mRng: SeededRandom): THREE.Group {
  const group = new THREE.Group();

  // Mountain base - rugged cone
  const sides = 6;
  const mountGeo = new THREE.ConeGeometry(1.2, height, sides, 3);
  const mountMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.9,
    flatShading: true,
  });

  // Displace mountain vertices for ruggedness
  const pos = mountGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    // Don't displace bottom vertices to keep base flat
    if (py > -height / 2 + 0.2) {
      const noiseVal = Math.sin(px * 8) * Math.cos(pz * 8) * 0.15;
      pos.setXYZ(i, px + noiseVal, py, pz + noiseVal);
    }
  }
  mountGeo.computeVertexNormals();

  const mountMesh = new THREE.Mesh(mountGeo, mountMat);
  mountMesh.position.y = height / 2;
  mountMesh.castShadow = true;
  mountMesh.receiveShadow = true;
  group.add(mountMesh);

  // Snow cap
  const capHeight = height * 0.35;
  const capGeo = new THREE.ConeGeometry(0.55, capHeight, sides, 1);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    flatShading: true,
  });
  const capMesh = new THREE.Mesh(capGeo, capMat);

  capMesh.position.y = height - capHeight / 2;
  capMesh.castShadow = true;
  group.add(capMesh);

  return group;
}

// --- Puffy Cloud Model ---
function createCloud(cRng: SeededRandom): THREE.Group {
  const group = new THREE.Group();
  const count = Math.floor(cRng.range(3, 6));
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    roughness: 0.9,
    flatShading: true,
  });

  const baseSphereGeo = new THREE.DodecahedronGeometry(1, 1);
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(baseSphereGeo, mat);
    const x = i * 0.7 - count * 0.35;
    const y = cRng.range(-0.15, 0.15);
    const z = cRng.range(-0.2, 0.2);
    const scale = cRng.range(0.7, 1.2);

    mesh.position.set(x, y, z);
    mesh.scale.set(scale, scale * 0.75, scale);
    mesh.castShadow = true;
    group.add(mesh);
  }

  return group;
}

// ==========================================
// 6. SPECIFIC LIFE FORM MODELS
// ==========================================

function buildGlowSheepModel(): {
  model: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  jaws: THREE.Object3D[];
  tail: THREE.Object3D | null;
  body: THREE.Object3D;
} {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x86efac,
    emissive: 0x22c55e,
    emissiveIntensity: 0.6,
    roughness: 0.5,
    flatShading: true,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x4ade80,
    roughness: 0.6,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0.5, 0.2, 0);
  head.castShadow = true;
  body.add(head);

  // Antennae / Ears
  const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.25);
  const antMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const antL = new THREE.Mesh(antGeo, antMat);
  antL.position.set(0.1, 0.22, 0.12);
  antL.rotation.z = -0.3;
  antL.rotation.x = 0.2;
  head.add(antL);

  const antR = antL.clone();
  antR.position.z = -0.12;
  antR.rotation.x = -0.2;
  head.add(antR);

  // Legs (quadruped)
  const legGeo = new THREE.BoxGeometry(0.12, 0.45, 0.12);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x166534,
    roughness: 0.8,
  });

  const legPositions = [
    { x: 0.25, z: 0.2 }, // Front Left
    { x: 0.25, z: -0.2 }, // Front Right
    { x: -0.25, z: 0.2 }, // Back Left
    { x: -0.25, z: -0.2 }, // Back Right
  ];

  legPositions.forEach((pos, idx) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(pos.x, -0.3, pos.z);

    const legMesh = new THREE.Mesh(legGeo, legMat);
    legMesh.position.y = -0.18; // offset so pivot rotates from thigh
    legMesh.castShadow = true;

    legPivot.add(legMesh);
    body.add(legPivot);
    legs.push(legPivot);
  });

  return { model: group, legs, wings: [], jaws: [], tail: null, body };
}

function buildSpikeStalkerModel(): {
  model: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  jaws: THREE.Object3D[];
  tail: THREE.Object3D;
  body: THREE.Object3D;
} {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const jaws: THREE.Object3D[] = [];

  // Chest Segment (Main)
  const chestGeo = new THREE.BoxGeometry(0.7, 0.45, 0.55);
  const chestMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.2,
    metalness: 0.8,
    flatShading: true,
  });
  const chest = new THREE.Mesh(chestGeo, chestMat);
  chest.position.y = 0.5;
  chest.castShadow = true;
  group.add(chest);

  // Abdomen Segment
  const abdGeo = new THREE.BoxGeometry(0.55, 0.38, 0.45);
  const abdMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.7,
    flatShading: true,
  });
  const abd = new THREE.Mesh(abdGeo, abdMat);
  abd.position.set(-0.55, -0.02, 0);
  abd.castShadow = true;
  chest.add(abd);

  // Tail Joint
  const tailGeo = new THREE.BoxGeometry(0.4, 0.3, 0.35);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.4,
    flatShading: true,
  });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(-0.4, 0.05, 0);
  tail.castShadow = true;
  abd.add(tail);

  // Stinger Spike
  const stingerGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
  const stingerMat = new THREE.MeshStandardMaterial({
    color: 0xfca5a5,
    emissive: 0xef4444,
    emissiveIntensity: 0.8,
  });
  const stinger = new THREE.Mesh(stingerGeo, stingerMat);
  stinger.position.set(-0.25, 0.2, 0);
  stinger.rotation.z = Math.PI / 3;
  stinger.castShadow = true;
  tail.add(stinger);

  // Red spikes on back
  const spikeGeo = new THREE.ConeGeometry(0.08, 0.25, 4);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
  for (let i = 0; i < 2; i++) {
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.set(-0.15 + i * 0.3, 0.28, 0);
    chest.add(spike);
  }

  // Snapping Jaws
  const jawMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.5,
  });
  const jawUGeo = new THREE.BoxGeometry(0.3, 0.12, 0.3);
  const jawLGeo = new THREE.BoxGeometry(0.3, 0.12, 0.3);

  const jawUPivot = new THREE.Group();
  jawUPivot.position.set(0.35, 0.1, 0);
  const jawU = new THREE.Mesh(jawUGeo, jawMat);
  jawU.position.set(0.15, 0, 0);
  jawUPivot.add(jawU);
  chest.add(jawUPivot);
  jaws.push(jawUPivot);

  const jawLPivot = new THREE.Group();
  jawLPivot.position.set(0.35, -0.1, 0);
  const jawL = new THREE.Mesh(jawLGeo, jawMat);
  jawL.position.set(0.15, 0, 0);
  jawLPivot.add(jawL);
  chest.add(jawLPivot);
  jaws.push(jawLPivot);

  // 6 Scuttling Legs
  const legGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.6,
  });

  const legOffsets = [
    { x: 0.2, z: 0.25, rotY: 0.3 },
    { x: 0.2, z: -0.25, rotY: -0.3 },
    { x: -0.1, z: 0.25, rotY: 0 },
    { x: -0.1, z: -0.25, rotY: 0 },
    { x: -0.4, z: 0.22, rotY: -0.3 },
    { x: -0.4, z: -0.22, rotY: 0.3 },
  ];

  legOffsets.forEach((off, idx) => {
    const pivot = new THREE.Group();
    // Front/middle attach to chest, back attach to abd
    if (idx < 4) {
      pivot.position.set(off.x, -0.2, off.z);
      chest.add(pivot);
    } else {
      pivot.position.set(off.x + 0.55, -0.18, off.z); // align to abdominal coordinates
      abd.add(pivot);
    }

    pivot.rotation.y = off.rotY;

    // Segmented insect leg - Joint 1 (Thigh)
    const thigh = new THREE.Mesh(legGeo, legMat);
    thigh.position.set(0, -0.15, 0);
    thigh.rotation.z = off.z > 0 ? -0.4 : 0.4;
    thigh.castShadow = true;
    pivot.add(thigh);

    // Joint 2 (Shin)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), legMat);
    shin.position.set(0, -0.3, 0);
    shin.rotation.z = off.z > 0 ? 0.8 : -0.8;
    shin.castShadow = true;
    thigh.add(shin);

    legs.push(pivot);
  });

  return { model: group, legs, wings: [], jaws, tail, body: chest };
}

function buildDustScarabModel(): {
  model: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  jaws: THREE.Object3D[];
  tail: null;
  body: THREE.Object3D;
} {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const jaws: THREE.Object3D[] = [];

  // Shell body - flat shield shape
  const bodyGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.25, 6);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.2,
    roughness: 0.1,
    metalness: 0.8,
    flatShading: true,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.25;
  body.rotation.y = Math.PI / 6; // align hex side forward
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Head (small snout)
  const headGeo = new THREE.BoxGeometry(0.28, 0.18, 0.28);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xb45309 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0.55, 0.02, 0);
  body.add(head);

  // Large Pincers
  const pincerMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    metalness: 0.9,
    roughness: 0.2,
  });
  const pincerGeo = new THREE.BoxGeometry(0.3, 0.08, 0.08);

  const pinLPivot = new THREE.Group();
  pinLPivot.position.set(0.12, 0, 0.1);
  const pinL = new THREE.Mesh(pincerGeo, pincerMat);
  pinL.position.x = 0.12;
  pinL.rotation.y = 0.3;
  pinLPivot.add(pinL);
  head.add(pinLPivot);
  jaws.push(pinLPivot);

  const pinRPivot = new THREE.Group();
  pinRPivot.position.set(0.12, 0, -0.1);
  const pinR = new THREE.Mesh(pincerGeo, pincerMat);
  pinR.position.x = 0.12;
  pinR.rotation.y = -0.3;
  pinRPivot.add(pinR);
  head.add(pinRPivot);
  jaws.push(pinRPivot);

  // Antennae
  const antGeo = new THREE.BoxGeometry(0.25, 0.02, 0.02);
  const antL = new THREE.Mesh(antGeo, pincerMat);
  antL.position.set(0.15, 0.08, 0.14);
  antL.rotation.y = 0.6;
  head.add(antL);

  const antR = antL.clone();
  antR.position.z = -0.14;
  antR.rotation.y = -0.6;
  head.add(antR);

  // 6 Small Crawler Legs
  const legGeo = new THREE.BoxGeometry(0.08, 0.25, 0.08);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    roughness: 0.8,
  });

  const legXOffsets = [0.25, 0.0, -0.25];
  legXOffsets.forEach((ox) => {
    [0.35, -0.35].forEach((oz) => {
      const pivot = new THREE.Group();
      pivot.position.set(ox, -0.1, oz);
      body.add(pivot);

      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(0, -0.1, 0);
      leg.rotation.z = oz > 0 ? -0.5 : 0.5;
      leg.castShadow = true;
      pivot.add(leg);

      legs.push(pivot);
    });
  });

  return { model: group, legs, wings: [], jaws, tail: null, body };
}

function buildAquaSerpentModel(): {
  model: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  jaws: THREE.Object3D[];
  tail: THREE.Object3D;
  body: THREE.Object3D;
} {
  const group = new THREE.Group();
  const wings: THREE.Object3D[] = [];

  // Sleek main body
  const bodyGeo = new THREE.CylinderGeometry(0.14, 0.1, 1.2, 8);
  bodyGeo.rotateZ(Math.PI / 2); // face X axis forward
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x0891b2,
    emissiveIntensity: 0.5,
    roughness: 0.1,
    metalness: 0.8,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  // Wings (Sweeping side wings like a manta ray)
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0891b2,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.9,
    roughness: 0.2,
    side: THREE.DoubleSide,
  });
  const wingGeo = new THREE.BoxGeometry(0.55, 0.02, 0.65);

  const wingLPivot = new THREE.Group();
  wingLPivot.position.set(0.1, 0, 0.1);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(0, 0, 0.3); // offset outwards
  wingLPivot.add(wingL);
  body.add(wingLPivot);
  wings.push(wingLPivot);

  const wingRPivot = new THREE.Group();
  wingRPivot.position.set(0.1, 0, -0.1);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0, 0, -0.3); // offset outwards
  wingRPivot.add(wingR);
  body.add(wingRPivot);
  wings.push(wingRPivot);

  // Rippling Tail chains (3 links)
  const tailSegmentGeo = new THREE.CylinderGeometry(0.08, 0.04, 0.4, 6);
  tailSegmentGeo.rotateZ(Math.PI / 2);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x0891b2,
    roughness: 0.4,
  });

  let currentSegmentParent: THREE.Object3D = body;
  let lastTailMesh: THREE.Object3D = body;

  const tailSegments = 3;
  for (let i = 0; i < tailSegments; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.6, 0, 0); // attach at rear of previous segment
    currentSegmentParent.add(pivot);

    const segment = new THREE.Mesh(tailSegmentGeo, tailMat);
    segment.position.set(-0.15, 0, 0);
    segment.castShadow = true;
    pivot.add(segment);

    currentSegmentParent = pivot;
    lastTailMesh = pivot; // store last for tail reference
  }

  // Bio-luminescent tail light tip
  const glowGeo = new THREE.SphereGeometry(0.1, 8, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const glowTip = new THREE.Mesh(glowGeo, glowMat);
  glowTip.position.set(-0.4, 0, 0);
  currentSegmentParent.add(glowTip);

  return { model: group, legs: [], wings, jaws: [], tail: body, body }; // tail animation rotates base tail pivot on body
}

function buildSkyScytheModel(): {
  model: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  jaws: THREE.Object3D[];
  tail: THREE.Object3D;
  body: THREE.Object3D;
} {
  const group = new THREE.Group();
  const wings: THREE.Object3D[] = [];

  // Aerodynamic fusiform body
  const bodyGeo = new THREE.ConeGeometry(0.18, 1.1, 5);
  bodyGeo.rotateZ(-Math.PI / 2); // point tip forward (positive X)
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x701a75,
    emissive: 0xd946ef,
    emissiveIntensity: 0.4,
    metalness: 0.6,
    roughness: 0.3,
    flatShading: true,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  // Large articulated flapping wings
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    emissive: 0xe879f9,
    emissiveIntensity: 0.2,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });

  const wingGeo = new THREE.BoxGeometry(0.4, 0.02, 1.2);

  // Left Wing Pivot (on chest)
  const wingLPivot = new THREE.Group();
  wingLPivot.position.set(0.1, 0, 0.15);
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(0, 0, 0.55); // offset outwards
  wingL.rotation.y = 0.25; // angled back
  wingLPivot.add(wingL);
  body.add(wingLPivot);
  wings.push(wingLPivot);

  // Right Wing Pivot
  const wingRPivot = new THREE.Group();
  wingRPivot.position.set(0.1, 0, -0.15);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0, 0, -0.55);
  wingR.rotation.y = -0.25;
  wingRPivot.add(wingR);
  body.add(wingRPivot);
  wings.push(wingRPivot);

  // Streamers (long feathers wiggling behind)
  const tailGeo = new THREE.BoxGeometry(0.8, 0.01, 0.05);
  const streamerMat = new THREE.MeshBasicMaterial({ color: 0xd946ef });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.55, 0, 0);
  body.add(tailPivot);

  const streamerL = new THREE.Mesh(tailGeo, streamerMat);
  streamerL.position.set(-0.4, 0, 0.08);
  streamerL.rotation.y = 0.1;
  tailPivot.add(streamerL);

  const streamerR = new THREE.Mesh(tailGeo, streamerMat);
  streamerR.position.set(-0.4, 0, -0.08);
  streamerR.rotation.y = -0.1;
  tailPivot.add(streamerR);

  return { model: group, legs: [], wings, jaws: [], tail: tailPivot, body };
}

// ==========================================
// 7. ENVIRONMENT & PLANET INITIALIZATION
// ==========================================

function initPlanet() {
  planetGroup = new THREE.Group();
  scene.add(planetGroup);

  // Generate geodesic vertices from standard Icosahedron
  const baseIcosa = new THREE.IcosahedronGeometry(PLANET_RADIUS, 3);
  const posAttr = baseIcosa.getAttribute("position") as THREE.BufferAttribute;

  // Deduplicate vertices
  const uniqueVerts: THREE.Vector3[] = [];
  const vertexMap: number[] = [];
  const seen = new Map<string, number>();
  const precision = 5;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const key = `${x.toFixed(precision)},${y.toFixed(precision)},${z.toFixed(precision)}`;

    if (!seen.has(key)) {
      const uIdx = uniqueVerts.length;
      uniqueVerts.push(new THREE.Vector3(x, y, z));
      seen.set(key, uIdx);
      vertexMap.push(uIdx);
    } else {
      vertexMap.push(seen.get(key)!);
    }
  }

  // Find neighbors by iterating over icosahedron indices
  const indices = baseIcosa.index;
  const neighborSets = Array.from(
    { length: uniqueVerts.length },
    () => new Set<number>()
  );

  if (indices) {
    for (let i = 0; i < indices.count; i += 3) {
      const a = vertexMap[indices.getX(i)]!;
      const b = vertexMap[indices.getY(i)]!;
      const c = vertexMap[indices.getZ(i)]!;

      neighborSets[a]!.add(b);
      neighborSets[a]!.add(c);
      neighborSets[b]!.add(a);
      neighborSets[b]!.add(c);
      neighborSets[c]!.add(a);
      neighborSets[c]!.add(b);
    }
  }

  // Populate GridNodes array
  nodes = uniqueVerts.map((vert, idx) => {
    const dir = vert.clone().normalize();

    // Evaluate noise values for terrain shape
    const nLow = getOctaveNoise(
      noiseGen,
      dir.x * 1.5,
      dir.y * 1.5,
      dir.z * 1.5,
      3
    ); // large landmasses
    const nHigh = getOctaveNoise(
      noiseGen,
      dir.x * 4.5,
      dir.y * 4.5,
      dir.z * 4.5,
      3
    ); // detail/dunes/hills

    let elevation = nLow * 2.8 + nHigh * 0.9;

    // Sharp mountain ranges on peaks
    if (nLow > 0.3) {
      elevation += Math.pow((nLow - 0.3) * 2.0, 1.8) * 4.5;
    }

    // Latitude temperature calculation: poles are cold (-0.2), equator is hot (0.8)
    const latFactor = 1.0 - Math.abs(dir.y); // 0 at poles, 1 at equator
    const tempNoise = getOctaveNoise(
      noiseGen,
      dir.x * 2.5 + 50,
      dir.y * 2.5 + 50,
      dir.z * 2.5 + 50,
      2
    );
    const temperature = THREE.MathUtils.clamp(
      latFactor * 0.85 + tempNoise * 0.15,
      0.0,
      1.0
    );

    // Moisture calculation: depends on ocean proximity noise + humidity bands
    const moistNoise = getOctaveNoise(
      noiseGen,
      dir.x * 2.0 + 100,
      dir.y * 2.0 + 100,
      dir.z * 2.0 + 100,
      3
    );
    const moisture = THREE.MathUtils.clamp(
      moistNoise * 0.7 + (1.0 - Math.abs(dir.y - 0.2)) * 0.3,
      0.0,
      1.0
    );

    // Determine biome classification
    let biome: BiomeType = "forest";
    if (elevation < -1.1) {
      biome = "ocean";
    } else if (elevation > 2.5) {
      biome = "mountain";
    } else if (moisture < 0.38 && temperature > 0.45) {
      biome = "desert";
    }

    // Initial resources
    const vegetation =
      biome === "forest"
        ? rng.range(0.5, 1.0)
        : biome === "desert"
          ? 0.05
          : 0.0;
    const algae = biome === "ocean" ? rng.range(0.4, 0.9) : 0.0;

    // Displaced coordinate
    // Ocean cells are set to a basin depth, visually filled by ocean water mesh
    const heightScalar = biome === "ocean" ? -1.5 : elevation;
    const actualPosition = dir.clone().setLength(PLANET_RADIUS + heightScalar);

    return {
      id: idx,
      position: dir,
      elevation: heightScalar,
      actualPosition,
      biome,
      temperature,
      moisture,
      vegetation,
      algae,
      neighbors: Array.from(neighborSets[idx]!),
      occupant: null,
      tileMeshGroup: null,
    };
  });

  // Re-verify ocean biomes if land locks exist (smooth ocean shapes)
  // Reconstruct flat-shaded landscape mesh from our grid nodes
  const landscapeGeo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];

  // Map of biome colors
  const biomeColors: Record<BiomeType, THREE.Color> = {
    ocean: new THREE.Color(0x131a26), // ocean floor
    desert: new THREE.Color(0xf1c40f), // sandy yellow
    forest: new THREE.Color(0x27ae60), // lush green
    mountain: new THREE.Color(0x7f8c8d), // stony grey
  };

  // Extract faces from icosahedron to map them to unique nodes
  if (indices) {
    for (let i = 0; i < indices.count; i += 3) {
      const idxA = vertexMap[indices.getX(i)]!;
      const idxB = vertexMap[indices.getY(i)]!;
      const idxC = vertexMap[indices.getZ(i)]!;

      const nodeA = nodes[idxA]!;
      const nodeB = nodes[idxB]!;
      const nodeC = nodes[idxC]!;

      // Add face vertices
      positions.push(
        nodeA.actualPosition.x,
        nodeA.actualPosition.y,
        nodeA.actualPosition.z
      );
      positions.push(
        nodeB.actualPosition.x,
        nodeB.actualPosition.y,
        nodeB.actualPosition.z
      );
      positions.push(
        nodeC.actualPosition.x,
        nodeC.actualPosition.y,
        nodeC.actualPosition.z
      );

      // Average color or blended face color based on biomes
      const colorA = biomeColors[nodeA.biome];
      const colorB = biomeColors[nodeB.biome];
      const colorC = biomeColors[nodeC.biome];

      colors.push(colorA.r, colorA.g, colorA.b);
      colors.push(colorB.r, colorB.g, colorB.b);
      colors.push(colorC.r, colorC.g, colorC.b);
    }
  }

  landscapeGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  landscapeGeo.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3)
  );
  landscapeGeo.computeVertexNormals();

  const landscapeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });

  terrainMesh = new THREE.Mesh(landscapeGeo, landscapeMat);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  planetGroup.add(terrainMesh);

  // --- Ocean Water Mesh ---
  const oceanGeo = new THREE.SphereGeometry(WATER_RADIUS, 48, 48);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.65,
    roughness: 0.15,
    metalness: 0.1,
    shininess: 90,
  } as any); // cast for shininess standard compat

  oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.receiveShadow = true;
  planetGroup.add(oceanMesh);

  // --- Atmospheric Glow Shell ---
  const atmosGeo = new THREE.SphereGeometry(PLANET_RADIUS * 1.15, 32, 32);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: 0x6366f1,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat);
  planetGroup.add(atmosphereMesh);

  // --- Populate Foliage and Mountains ---
  nodes.forEach((node) => {
    const tileGroup = new THREE.Group();
    // Position at node center, facing outward
    tileGroup.position.copy(node.actualPosition);

    // Align mesh up vector with the spherical normal (pointing outwards)
    const upVector = node.position;
    const tangent = new THREE.Vector3(0, 1, 0)
      .projectOnPlane(upVector)
      .normalize();
    const binormal = new THREE.Vector3()
      .crossVectors(upVector, tangent)
      .normalize();
    const rotMatrix = new THREE.Matrix4().makeBasis(
      binormal,
      upVector,
      tangent
    );
    tileGroup.quaternion.setFromRotationMatrix(rotMatrix);

    planetGroup.add(tileGroup);
    node.tileMeshGroup = tileGroup;

    if (node.biome === "forest") {
      // Spawn trees based on vegetation capacity
      const treeCount = Math.floor(rng.range(1, 3.5));
      for (let i = 0; i < treeCount; i++) {
        const treeType = rng.choice(["pine", "oak", "birch"]);
        let tree: THREE.Group;
        if (treeType === "pine") tree = createPineTree(rng);
        else if (treeType === "oak") tree = createOakTree(rng);
        else tree = createBirchTree(rng);

        // Disperse trees slightly from tile center
        const offsetRadius = rng.range(0.2, 0.45);
        const offsetAngle = rng.range(0, Math.PI * 2);
        tree.position.set(
          Math.cos(offsetAngle) * offsetRadius,
          0,
          Math.sin(offsetAngle) * offsetRadius
        );

        // Random scale & rotation
        const sc = rng.range(0.7, 1.25);
        tree.scale.set(sc, sc, sc);
        tree.rotation.y = rng.range(0, Math.PI * 2);

        tileGroup.add(tree);
      }
    } else if (node.biome === "mountain") {
      // Spawn detailed jagged mountain peak
      const mountHeight = rng.range(1.5, 3.0);
      const spire = createMountainSpire(mountHeight, rng);

      const sc = rng.range(0.8, 1.2);
      spire.scale.set(sc, sc, sc);
      spire.rotation.y = rng.range(0, Math.PI * 2);
      tileGroup.add(spire);
    }
  });

  // --- Cloud Cover Generation ---
  cloudGroup = new THREE.Group();
  planetGroup.add(cloudGroup);

  const cloudCount = 12;
  for (let i = 0; i < cloudCount; i++) {
    const cloud = createCloud(rng);
    // Orbit radius
    const alt = rng.range(PLANET_RADIUS + 4, PLANET_RADIUS + 6.5);
    const dir = new THREE.Vector3(
      rng.range(-1, 1),
      rng.range(-0.5, 0.5),
      rng.range(-1, 1)
    ).normalize();

    cloud.position.copy(dir).setLength(alt);

    // Align cloud upright relative to sphere center
    const cloudUp = dir.clone();
    const cloudTan = new THREE.Vector3(0, 1, 0)
      .projectOnPlane(cloudUp)
      .normalize();
    const cloudBin = new THREE.Vector3()
      .crossVectors(cloudUp, cloudTan)
      .normalize();
    const cRotMatrix = new THREE.Matrix4().makeBasis(
      cloudBin,
      cloudUp,
      cloudTan
    );
    cloud.quaternion.setFromRotationMatrix(cRotMatrix);

    // Save initial direction vector in userData for orbiting updates
    cloud.userData = {
      dir: dir.clone(),
      alt,
      speed: rng.range(0.015, 0.04),
    };
    cloudGroup.add(cloud);
  }
}

// ==========================================
// 8. WEATHER SYSTEM PARTICLES
// ==========================================

function initWeather() {
  // Rain Particle System
  const rainGeo = new THREE.BufferGeometry();
  const rainCount = 1500;
  const rainPos = new Float32Array(rainCount * 3);
  const rainSpeeds = new Float32Array(rainCount);

  for (let i = 0; i < rainCount; i++) {
    const dir = new THREE.Vector3(
      rng.range(-1, 1),
      rng.range(-1, 1),
      rng.range(-1, 1)
    ).normalize();
    const dist = rng.range(PLANET_RADIUS + 1, PLANET_RADIUS + 9);
    const pos = dir.clone().setLength(dist);
    rainPos[i * 3] = pos.x;
    rainPos[i * 3 + 1] = pos.y;
    rainPos[i * 3 + 2] = pos.z;
    rainSpeeds[i] = rng.range(0.25, 0.45);
  }

  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.12,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });
  rainParticles = new THREE.Points(rainGeo, rainMat);
  rainParticles.visible = false;
  scene.add(rainParticles);
  // Store custom variables for animation updating
  rainParticles.userData = { speeds: rainSpeeds };

  // Snow Particle System
  const snowGeo = new THREE.BufferGeometry();
  const snowCount = 2000;
  const snowPos = new Float32Array(snowCount * 3);
  const snowSpeeds = new Float32Array(snowCount);

  for (let i = 0; i < snowCount; i++) {
    const dir = new THREE.Vector3(
      rng.range(-1, 1),
      rng.range(-1, 1),
      rng.range(-1, 1)
    ).normalize();
    const dist = rng.range(PLANET_RADIUS + 1, PLANET_RADIUS + 9);
    const pos = dir.clone().setLength(dist);
    snowPos[i * 3] = pos.x;
    snowPos[i * 3 + 1] = pos.y;
    snowPos[i * 3 + 2] = pos.z;
    snowSpeeds[i] = rng.range(0.08, 0.18);
  }

  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
  });
  snowParticles = new THREE.Points(snowGeo, snowMat);
  snowParticles.visible = false;
  scene.add(snowParticles);
  snowParticles.userData = { speeds: snowSpeeds };

  // Sandstorm Swirl Particle System
  const stormGeo = new THREE.BufferGeometry();
  const stormCount = 1800;
  const stormPos = new Float32Array(stormCount * 3);
  const stormAngles = new Float32Array(stormCount);
  const stormHeights = new Float32Array(stormCount);
  const stormRadii = new Float32Array(stormCount);

  for (let i = 0; i < stormCount; i++) {
    const angle = rng.range(0, Math.PI * 2);
    // Sandstorms are equatorially focused (Y around -4 to 4)
    const height = rng.range(-4.5, 4.5);
    const radius = rng.range(PLANET_RADIUS + 0.2, PLANET_RADIUS + 2.5);

    stormPos[i * 3] = Math.cos(angle) * radius;
    stormPos[i * 3 + 1] = height;
    stormPos[i * 3 + 2] = Math.sin(angle) * radius;

    stormAngles[i] = angle;
    stormHeights[i] = height;
    stormRadii[i] = radius;
  }

  stormGeo.setAttribute("position", new THREE.BufferAttribute(stormPos, 3));
  const stormMat = new THREE.PointsMaterial({
    color: 0xeab308,
    size: 0.14,
    transparent: true,
    opacity: 0.45,
    blending: THREE.NormalBlending,
  });
  stormParticles = new THREE.Points(stormGeo, stormMat);
  stormParticles.visible = false;
  scene.add(stormParticles);
  stormParticles.userData = {
    angles: stormAngles,
    heights: stormHeights,
    radii: stormRadii,
    rotSpeed: rng.range(1.5, 3.0),
  };
}

// ==========================================
// 9. LIFE FORM SPAWNING
// ==========================================

function spawnCreature(type: SpeciesType, node: GridNode) {
  if (node.occupant) return;

  let details;
  if (type === "sheep") details = buildGlowSheepModel();
  else if (type === "stalker") details = buildSpikeStalkerModel();
  else if (type === "scarab") details = buildDustScarabModel();
  else if (type === "serpent") details = buildAquaSerpentModel();
  else details = buildSkyScytheModel(); // scythe

  const { model, legs, wings, jaws, tail, body } = details;

  // Set initial coordinates
  const alt = type === "scythe" ? 4 : 0;
  model.position
    .copy(node.position)
    .setLength(PLANET_RADIUS + node.elevation + alt);

  // Align orientation up normal
  const up = node.position.clone();
  const tangent = new THREE.Vector3(1, 0, 0).projectOnPlane(up).normalize();
  const binormal = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const m = new THREE.Matrix4().makeBasis(binormal, up, tangent);
  model.quaternion.setFromRotationMatrix(m);

  creaturesGroup.add(model);

  const c: Creature = {
    id: nextCreatureId++,
    type,
    node,
    targetNode: null,
    moveProgress: 0,
    energy: type === "stalker" ? 120 : type === "scythe" ? 130 : 100,
    age: 0,
    state: "roaming",
    stateTimer: 0,
    model,
    actionProgress: 0,
    huntTarget: null,
    legs,
    wings,
    jaws,
    tail,
    body,
  };

  node.occupant = c;
  creatures.push(c);
}

function spawnInitialEcosystem() {
  creaturesGroup = new THREE.Group();
  scene.add(creaturesGroup);

  // Distribute species based on biome availability
  nodes.forEach((node) => {
    if (
      node.biome === "forest" &&
      rng.next() < 0.05 &&
      creatures.filter((cr) => cr.type === "sheep").length < 18
    ) {
      spawnCreature("sheep", node);
    }
    if (
      node.biome === "ocean" &&
      rng.next() < 0.05 &&
      creatures.filter((cr) => cr.type === "serpent").length < 20
    ) {
      spawnCreature("serpent", node);
    }
    if (
      node.biome === "desert" &&
      rng.next() < 0.06 &&
      creatures.filter((cr) => cr.type === "scarab").length < 12
    ) {
      spawnCreature("scarab", node);
    }
  });

  // Spawn predators on mountains
  nodes.forEach((node) => {
    if (
      node.biome === "mountain" &&
      rng.next() < 0.12 &&
      creatures.filter((cr) => cr.type === "stalker").length < 8
    ) {
      spawnCreature("stalker", node);
    }
    if (
      node.biome === "mountain" &&
      rng.next() < 0.12 &&
      creatures.filter((cr) => cr.type === "scythe").length < 6
    ) {
      spawnCreature("scythe", node);
    }
  });

  logEvent("Ecosystem seeded: 5 unique life forms spawned.");
}

// ==========================================
// 10. SIMULATION BIOLOGICAL ENGINE (TICK EVENT)
// ==========================================

function logEvent(msg: string) {
  feedLogs.unshift(`[T+${simTimeTicks}] ${msg}`);
  if (feedLogs.length > 25) feedLogs.pop();
  const feed = document.getElementById("sim-feed");
  if (feed) {
    feed.innerHTML = feedLogs.map((l) => `<div>${l}</div>`).join("");
  }
}

function getDistance(n1: GridNode, n2: GridNode): number {
  return n1.actualPosition.distanceTo(n2.actualPosition);
}

function findNearbyPrey(hunter: Creature, range: number): Creature | null {
  let closest: Creature | null = null;
  let minDist = Infinity;

  creatures.forEach((other) => {
    if (other === hunter) return;

    let isPrey = false;
    if (hunter.type === "stalker") {
      isPrey =
        other.type === "sheep" ||
        (other.type === "scarab" && other.state !== "burrowed");
    } else if (hunter.type === "scythe") {
      isPrey = other.type === "sheep" || other.type === "serpent";
    }

    if (isPrey) {
      const d = getDistance(hunter.node, other.node);
      if (d < range && d < minDist) {
        minDist = d;
        closest = other;
      }
    }
  });

  return closest;
}

function findNearbyPredator(prey: Creature, range: number): Creature | null {
  let closest: THREE.Group | null = null;
  let minDist = Infinity;
  let predatorObj: Creature | null = null;

  creatures.forEach((other) => {
    let isPredator = false;
    if (prey.type === "sheep") {
      isPredator = other.type === "stalker" || other.type === "scythe";
    } else if (prey.type === "serpent") {
      isPredator = other.type === "scythe";
    }

    if (isPredator) {
      const d = getDistance(prey.node, other.node);
      if (d < range && d < minDist) {
        minDist = d;
        closest = other.model;
        predatorObj = other;
      }
    }
  });

  return predatorObj;
}

function executeSimulationTick() {
  simTimeTicks++;
  weatherTimer--;

  // Random weather cycle transitions
  if (weatherTimer <= 0) {
    weatherTimer = rng.range(150, 350);
    const options: WeatherType[] = ["clear", "rain", "snow", "sandstorm"];
    transitionWeatherTo(rng.choice(options));
  }

  // Weather influence: Wind vectors shift gently
  windDirection += rng.range(-0.4, 0.4);
  windSpeed = THREE.MathUtils.clamp(windSpeed + rng.range(-1, 1), 1.0, 8.0);

  // 1. Grid Nodes Resource Update (Regrowth & moisture dissipation)
  nodes.forEach((node) => {
    if (node.biome === "forest") {
      if (currentWeather === "rain") {
        node.vegetation = Math.min(1.0, node.vegetation + 0.08);
      } else if (currentWeather === "snow") {
        node.vegetation = Math.max(0.1, node.vegetation - 0.01); // snow inhibits growth
      } else {
        node.vegetation = Math.min(1.0, node.vegetation + 0.02); // normal slow regrowth
      }

      // Update visual density scaling of trees based on vegetation value
      if (node.tileMeshGroup) {
        const sc = 0.2 + node.vegetation * 0.8;
        node.tileMeshGroup.scale.set(sc, sc, sc);
      }
    } else if (node.biome === "ocean") {
      node.algae = Math.min(1.0, node.algae + 0.03); // plankton bloom
    }
  });

  // 2. Creature Behavior States Evaluation
  const deadCreatures = new Set<Creature>();

  creatures.forEach((c) => {
    if (deadCreatures.has(c)) return;

    c.age++;
    c.energy -= 1.0; // metabolic baseline cost

    // Age / Starvation check
    if (c.energy <= 0 || c.age > 450) {
      deadCreatures.add(c);
      logEvent(
        `A ${c.type} died of ${c.energy <= 0 ? "starvation" : "old age"}.`
      );
      return;
    }

    // Weather impact on species
    if (currentWeather === "rain" && c.type === "scarab") {
      // scarab hates water, must burrow if not already
      if (c.state !== "burrowed") {
        c.state = "burrowed";
        c.targetNode = null;
        c.moveProgress = 0;
      }
    } else if (c.state === "burrowed" && currentWeather !== "rain") {
      // Unburrow once storm passes
      c.state = "roaming";
    }

    // Move progression: if traversing, wait till arrival
    if (c.targetNode) {
      return;
    }

    // --- AQUA-SERPENT BEHAVIOR (Ocean) ---
    if (c.type === "serpent") {
      // Must reside in water
      if (c.node.biome !== "ocean") {
        deadCreatures.add(c);
        logEvent("An Aqua-Serpent washed ashore and perished.");
        return;
      }

      // Check for birds above
      const danger = findNearbyPredator(c, 5.0);
      if (danger) {
        c.state = "fleeing";
        // Pick neighbor furthest from danger
        const escapeNode = getFurthestNeighbor(c.node, danger.node, "ocean");
        if (escapeNode) {
          moveToNode(c, escapeNode);
          return;
        }
      }

      // Look for algae food
      if (c.node.algae > 0.4) {
        c.state = "seeking_food";
        c.node.algae = Math.max(0.0, c.node.algae - 0.3);
        c.energy = Math.min(150, c.energy + 25);
        return;
      }

      // Find nearby ocean cell with algae
      const foodNode = getNeighborWithResource(c.node, "algae", "ocean");
      if (foodNode) {
        moveToNode(c, foodNode);
        return;
      }

      // Swim randomly
      const nextOcean = getRandomNeighbor(c.node, "ocean");
      if (nextOcean) {
        moveToNode(c, nextOcean);
      }
    }

    // --- GLOW-SHEEP BEHAVIOR (Herbivore) ---
    else if (c.type === "sheep") {
      // Check for predators
      const predator = findNearbyPredator(c, 6.0);
      if (predator) {
        c.state = "fleeing";
        const escapeNode = getFurthestNeighbor(c.node, predator.node, "land");
        if (escapeNode) {
          moveToNode(c, escapeNode);
          return;
        }
      }

      // Eat if vegetation is high
      if (c.node.biome === "forest" && c.node.vegetation > 0.3) {
        c.state = "seeking_food";
        c.node.vegetation = Math.max(0.0, c.node.vegetation - 0.25);
        c.energy = Math.min(150, c.energy + 30);
        return;
      }

      // Find forest node with food
      const foodNode = getNeighborWithResource(c.node, "vegetation", "land");
      if (foodNode) {
        moveToNode(c, foodNode);
        return;
      }

      // Roam land biomes
      const nextLand = getRandomNeighbor(c.node, "land");
      if (nextLand) {
        moveToNode(c, nextLand);
      }
    }

    // --- SPIKE-STALKER BEHAVIOR (Carnivore) ---
    else if (c.type === "stalker") {
      // Blinded/slowed by sandstorms
      if (currentWeather === "sandstorm" && c.node.biome === "desert") {
        c.energy -= 0.5; // heavy storm cost
        if (rng.next() < 0.4) return; // stay still
      }

      // Search for prey
      const prey = findNearbyPrey(c, 7.5);
      if (prey) {
        c.state = "hunting";
        c.huntTarget = prey;

        // If prey on same tile, devour it!
        if (prey.node === c.node) {
          deadCreatures.add(prey);
          c.energy = Math.min(200, c.energy + 70);
          c.huntTarget = null;
          logEvent(`A Spike-Stalker hunted and devoured a ${prey.type}.`);
          return;
        }

        // Move towards prey
        const nextStep = getStepTowards(c.node, prey.node, "land");
        if (nextStep) {
          moveToNode(c, nextStep);
          return;
        }
      }

      // Roam land randomly
      c.state = "roaming";
      c.huntTarget = null;
      const nextLand = getRandomNeighbor(c.node, "land");
      if (nextLand) {
        moveToNode(c, nextLand);
      }
    }

    // --- DUST-SCARAB BEHAVIOR (Desert Dweller) ---
    else if (c.type === "scarab") {
      if (c.state === "burrowed") {
        c.energy += 0.2; // minimal cost and slow absorption
        return;
      }

      // Energy charging in sandstorms
      if (currentWeather === "sandstorm" && c.node.biome === "desert") {
        c.energy = Math.min(160, c.energy + 4);
      } else if (c.node.biome === "desert") {
        c.energy += 0.8; // absorb desert minerals
      }

      // Avoid predators
      const pred = findNearbyPredator(c, 4.0);
      if (pred) {
        c.state = "fleeing";
        const escapeNode = getFurthestNeighbor(c.node, pred.node, "land");
        if (escapeNode) {
          moveToNode(c, escapeNode);
          return;
        }
      }

      // Roam deserts
      c.state = "roaming";
      const nextDesert = getRandomNeighbor(c.node, "desert");
      if (nextDesert) {
        moveToNode(c, nextDesert);
      } else {
        // can walk on mountains or forests if no desert adjacent
        const nextLand = getRandomNeighbor(c.node, "land");
        if (nextLand) moveToNode(c, nextLand);
      }
    }

    // --- SKY-SCYTHE BEHAVIOR (Flying Predator) ---
    else if (c.type === "scythe") {
      // Flying over any biome
      if (c.state === "diving") {
        // diving sequence is handled during frame interpolation
        return;
      }

      // Search prey
      const prey = findNearbyPrey(c, 9.0);
      if (prey) {
        // Trigger dive attack
        c.state = "diving";
        c.huntTarget = prey;
        c.actionProgress = 0;

        // Target prey cell
        moveToNode(c, prey.node);
        return;
      }

      // High Mountain roosting rest when full
      if (c.energy > 150 && c.node.biome === "mountain" && rng.next() < 0.2) {
        c.state = "roosting";
        return;
      }
      if (c.state === "roosting") {
        if (c.energy < 100) {
          c.state = "roaming";
        }
        return; // stay on mountain peaks
      }

      // Fly randomly (over any node, land or ocean)
      c.state = "roaming";
      const adjacentNodes = c.node.neighbors;
      const nextTargetId = rng.choice(adjacentNodes);
      const nextTarget = nodes[nextTargetId]!;
      moveToNode(c, nextTarget);
    }
  });

  // 3. Apply deaths
  deadCreatures.forEach((c) => {
    // Remove occupant references
    if (c.node.occupant === c) c.node.occupant = null;
    if (c.targetNode && c.targetNode.occupant === c)
      c.targetNode.occupant = null;
    creaturesGroup.remove(c.model);
    creatures = creatures.filter((cr) => cr !== c);
  });

  // 4. Reproduction Cycle
  creatures.forEach((c) => {
    if (deadCreatures.has(c)) return;

    if (c.type === "sheep" && c.energy > 140) {
      const birthNode = getRandomNeighbor(c.node, "land");
      if (birthNode && !birthNode.occupant) {
        c.energy -= 65;
        spawnCreature("sheep", birthNode);
      }
    } else if (c.type === "serpent" && c.energy > 130) {
      const birthNode = getRandomNeighbor(c.node, "ocean");
      if (birthNode && !birthNode.occupant) {
        c.energy -= 60;
        spawnCreature("serpent", birthNode);
      }
    } else if (c.type === "scarab" && c.energy > 140) {
      const birthNode = getRandomNeighbor(c.node, "desert");
      if (birthNode && !birthNode.occupant) {
        c.energy -= 60;
        spawnCreature("scarab", birthNode);
      }
    } else if (c.type === "stalker" && c.energy > 180) {
      const birthNode = getRandomNeighbor(c.node, "land");
      if (birthNode && !birthNode.occupant) {
        c.energy -= 90;
        spawnCreature("stalker", birthNode);
      }
    } else if (c.type === "scythe" && c.energy > 180) {
      // sky birth
      const adjacentNodes = c.node.neighbors;
      const targetId = rng.choice(adjacentNodes);
      const birthNode = nodes[targetId]!;
      if (!birthNode.occupant) {
        c.energy -= 90;
        spawnCreature("scythe", birthNode);
      }
    }
  });
}

// Helper methods for node navigation
function moveToNode(c: Creature, target: GridNode) {
  c.targetNode = target;
  target.occupant = c;
  c.moveProgress = 0;
}

function getRandomNeighbor(
  node: GridNode,
  filter: "land" | "ocean" | "desert"
): GridNode | null {
  const matching = node.neighbors
    .map((id) => nodes[id]!)
    .filter((n) => {
      if (n.occupant) return false;
      if (filter === "land") return n.biome !== "ocean";
      if (filter === "ocean") return n.biome === "ocean";
      return n.biome === "desert"; // desert
    });
  return matching.length > 0 ? rng.choice(matching) : null;
}

function getNeighborWithResource(
  node: GridNode,
  resource: "vegetation" | "algae",
  filter: "land" | "ocean"
): GridNode | null {
  const matching = node.neighbors
    .map((id) => nodes[id]!)
    .filter((n) => {
      if (n.occupant) return false;
      if (filter === "land") return n.biome === "forest" && n.vegetation > 0.3;
      return n.biome === "ocean" && n.algae > 0.3;
    });

  if (matching.length === 0) return null;
  // Pick highest resource node
  return matching.reduce((maxNode, n) => {
    const valN = resource === "vegetation" ? n.vegetation : n.algae;
    const valMax =
      resource === "vegetation" ? maxNode.vegetation : maxNode.algae;
    return valN > valMax ? n : maxNode;
  }, matching[0]!);
}

function getFurthestNeighbor(
  start: GridNode,
  danger: GridNode,
  filter: "land" | "ocean"
): GridNode | null {
  const matching = start.neighbors
    .map((id) => nodes[id]!)
    .filter((n) => {
      if (n.occupant) return false;
      return filter === "land" ? n.biome !== "ocean" : n.biome === "ocean";
    });

  if (matching.length === 0) return null;

  // Pick node with maximum 3D distance to the danger node
  let furthest = matching[0]!;
  let maxD = getDistance(furthest, danger);

  matching.forEach((n) => {
    const d = getDistance(n, danger);
    if (d > maxD) {
      maxD = d;
      furthest = n;
    }
  });

  return furthest;
}

function getStepTowards(
  start: GridNode,
  target: GridNode,
  filter: "land" | "ocean"
): GridNode | null {
  const matching = start.neighbors
    .map((id) => nodes[id]!)
    .filter((n) => {
      if (n.occupant) return false;
      return filter === "land" ? n.biome !== "ocean" : n.biome === "ocean";
    });

  if (matching.length === 0) return null;

  // Pick node closest to target
  let closest = matching[0]!;
  let minD = getDistance(closest, target);

  matching.forEach((n) => {
    const d = getDistance(n, target);
    if (d < minD) {
      minD = d;
      closest = n;
    }
  });

  return closest;
}

// ==========================================
// 11. GRAPHICAL INTERPOLATION & FRAME LOOP
// ==========================================

function transitionWeatherTo(w: WeatherType) {
  currentWeather = w;
  rainParticles.visible = w === "rain";
  snowParticles.visible = w === "snow";
  stormParticles.visible = w === "sandstorm";

  const wEl = document.getElementById("weather-condition");
  if (wEl) {
    wEl.innerText = w.toUpperCase();
    if (w === "clear") wEl.style.color = "var(--color-success)";
    else if (w === "rain") wEl.style.color = "var(--color-info)";
    else if (w === "snow") wEl.style.color = "#fff";
    else wEl.style.color = "var(--color-warning)";
  }

  logEvent(`Weather transitioned to: ${w.toUpperCase()}`);
}

function updateHUD() {
  // Counts
  const counts = { sheep: 0, stalker: 0, scarab: 0, serpent: 0, scythe: 0 };
  creatures.forEach((c) => counts[c.type]++);

  const ids = {
    "pop-serpent": counts.serpent,
    "pop-sheep": counts.sheep,
    "pop-stalker": counts.stalker,
    "pop-scarab": counts.scarab,
    "pop-scythe": counts.scythe,
  };

  Object.entries(ids).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val.toString();
  });

  // Wind speed text update
  const windEl = document.getElementById("weather-wind");
  if (windEl) {
    windEl.innerText = `${windSpeed.toFixed(1)} m/s`;
  }

  // Selected tile inspector updating
  if (selectedNode) {
    document.getElementById("inspector-placeholder")!.style.display = "none";
    document.getElementById("inspector-content")!.style.display = "flex";

    document.getElementById("inspect-biome")!.innerText =
      selectedNode.biome.toUpperCase();
    document.getElementById("inspect-elevation")!.innerText =
      `${selectedNode.elevation.toFixed(2)}m`;
    document.getElementById("inspect-moisture")!.innerText =
      `${(selectedNode.moisture * 100).toFixed(0)}%`;
    document.getElementById("inspect-temperature")!.innerText =
      `${(selectedNode.temperature * 40 - 10).toFixed(1)}°C`;

    if (selectedNode.biome === "forest") {
      document.getElementById("inspect-vegetation")!.innerText =
        `${(selectedNode.vegetation * 100).toFixed(0)}% (Forest)`;
    } else if (selectedNode.biome === "ocean") {
      document.getElementById("inspect-vegetation")!.innerText =
        `${(selectedNode.algae * 100).toFixed(0)}% (Algae)`;
    } else {
      document.getElementById("inspect-vegetation")!.innerText = "N/A";
    }

    const occ = selectedNode.occupant;
    if (occ) {
      document.getElementById("inspect-occupant")!.innerText =
        `${occ.type.toUpperCase()} (Energy: ${occ.energy.toFixed(0)})`;
    } else {
      document.getElementById("inspect-occupant")!.innerText = "None";
    }
  } else {
    document.getElementById("inspector-placeholder")!.style.display = "block";
    document.getElementById("inspector-content")!.style.display = "none";
  }
}

function updateAnimations(c: Creature, elapsed: number) {
  const isMoving = c.targetNode !== null;
  const cycleSpeed = isMoving ? 10.0 : 2.5;
  const swing = Math.sin(elapsed * cycleSpeed);

  // --- 1. Quadruped (Glow-Sheep) leg rotation walk cycles ---
  if (c.type === "sheep") {
    if (c.legs.length === 4) {
      c.legs[0]!.rotation.z = isMoving ? swing * 0.5 : 0;
      c.legs[1]!.rotation.z = isMoving ? -swing * 0.5 : 0;
      c.legs[2]!.rotation.z = isMoving ? -swing * 0.5 : 0;
      c.legs[3]!.rotation.z = isMoving ? swing * 0.5 : 0;
    }
    // Head bobs
    if (c.body && c.body.children[0]) {
      c.body.children[0].position.y =
        0.2 +
        (isMoving ? Math.abs(swing) * 0.08 : Math.sin(elapsed * 1.5) * 0.02);
    }
  }

  // --- 2. Segmented predator (Spike-Stalker) crawl cycle ---
  else if (c.type === "stalker") {
    if (c.legs.length === 6) {
      for (let i = 0; i < 6; i++) {
        // Alternate leg ripple
        const offset = i * (Math.PI / 3);
        c.legs[i]!.rotation.z =
          Math.sin(elapsed * 15.0 + offset) * (isMoving ? 0.35 : 0.04);
      }
    }
    // Body / Spine wiggle
    if (c.body && c.body.children[0]) {
      // Abdomen
      c.body.children[0].rotation.y =
        Math.sin(elapsed * 8.0) * (isMoving ? 0.18 : 0.04);
      // Tail
      if (c.tail) {
        c.tail.rotation.y =
          Math.sin(elapsed * 8.0 - 1.0) * (isMoving ? 0.3 : 0.08);
      }
    }
    // Snap jaws
    if (c.jaws.length === 2) {
      const snap =
        c.state === "hunting"
          ? Math.abs(Math.sin(elapsed * 22.0)) * 0.35
          : Math.abs(Math.sin(elapsed * 1.5)) * 0.08;

      c.jaws[0]!.rotation.z = snap;
      c.jaws[1]!.rotation.z = -snap;
    }
  }

  // --- 3. Shuffling crab (Dust-Scarab) ---
  else if (c.type === "scarab") {
    if (c.state === "burrowed") {
      // Shrink model slightly to represent underground burrow
      c.model.scale.set(0.4, 0.4, 0.4);
      return;
    } else {
      c.model.scale.set(1, 1, 1);
    }

    if (c.legs.length === 6) {
      for (let i = 0; i < 6; i++) {
        const offset = i * (Math.PI / 2);
        c.legs[i]!.rotation.z =
          Math.sin(elapsed * 18.0 + offset) * (isMoving ? 0.25 : 0.0);
      }
    }
    // Clamp pincers
    if (c.jaws.length === 2) {
      const clamp = Math.sin(elapsed * 4.0) * 0.15 + 0.15;
      c.jaws[0]!.rotation.y = clamp;
      c.jaws[1]!.rotation.y = -clamp;
    }
    // Charge glow animation in sandstorms
    if (currentWeather === "sandstorm" && c.body) {
      const mat = (c.body as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.5 + Math.sin(elapsed * 10.0) * 0.3;
    } else if (c.body) {
      const mat = (c.body as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.2;
    }
  }

  // --- 4. Winged manta ray (Aqua-Serpent) swim cycle ---
  else if (c.type === "serpent") {
    const flap = Math.sin(elapsed * (isMoving ? 6.0 : 2.5));
    if (c.wings.length === 2) {
      c.wings[0]!.rotation.z = flap * 0.35;
      c.wings[1]!.rotation.z = -flap * 0.35;
    }
    // Body undulating
    if (c.body) {
      c.body.rotation.y =
        Math.sin(elapsed * (isMoving ? 6.0 : 2.5) - 0.5) * 0.1;
    }
  }

  // --- 5. Flying dragon (Sky-Scythe) wings flap & dive angles ---
  else if (c.type === "scythe") {
    let flapSpeed = 8.0;
    if (c.state === "diving")
      flapSpeed = 16.0; // frantic diving flap
    else if (c.state === "roosting") flapSpeed = 0.5;

    const flap = Math.sin(elapsed * flapSpeed);
    if (c.wings.length === 2) {
      c.wings[0]!.rotation.z = c.state === "roosting" ? -0.8 : flap * 0.55;
      c.wings[1]!.rotation.z = c.state === "roosting" ? 0.8 : -flap * 0.55;
    }
    // Tail stream wiggle
    if (c.tail) {
      c.tail.rotation.y = Math.sin(elapsed * 6.0) * 0.25;
      c.tail.rotation.z = Math.cos(elapsed * 3.0) * 0.1;
    }
  }
}

function animateFrame() {
  requestAnimationFrame(animateFrame);

  const delta = animationClock.getDelta();
  const elapsed = animationClock.getElapsedTime();

  // Rotate planet and its contents
  // If user isn't dragging, we apply a slow passive rotation to the planet
  if (!isDragging) {
    planetGroup.rotation.y += delta * 0.025;
  }

  // Rotate Sun/Moon Orbit (Day/Night cycle)
  dirLightParent.rotation.y += delta * 0.05;

  // Wave surface vertex displacements on ocean mesh
  if (oceanMesh) {
    const pos = oceanMesh.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);

      const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const nx = vx / len;
      const ny = vy / len;
      const nz = vz / len;

      // multi-sine wave displacement
      const wave =
        Math.sin(nx * 8 + elapsed * 1.5) *
          Math.cos(ny * 8 + elapsed * 1.5) *
          0.12 +
        Math.cos(nz * 6 - elapsed * 1.0) * 0.06;

      const r = WATER_RADIUS + wave;
      pos.setXYZ(i, nx * r, ny * r, nz * r);
    }
    pos.needsUpdate = true;
    oceanMesh.geometry.computeVertexNormals();
  }

  // Floating Cloud drift orbits
  if (cloudGroup) {
    cloudGroup.children.forEach((cloud: THREE.Object3D) => {
      const uData = cloud.userData;
      // Orbit around the planet's Y axis
      cloud.rotation.y += uData.speed * delta;
    });
  }

  // --- Animate Weather Particle Systems (radial drop or equatorial storm) ---
  if (currentWeather === "rain" && rainParticles) {
    const pos = rainParticles.geometry.attributes.position!;
    const speeds = rainParticles.userData.speeds;

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);

      const dir = new THREE.Vector3(px, py, pz);
      const dist = dir.length();
      dir.normalize();

      // Fall radially inwards towards planet center
      const nextDist = dist - speeds[i] * 20.0 * delta;

      // Determine ground boundary height
      // Find closest node to calculate terrain height
      const targetRadius = PLANET_RADIUS + 0.1; // fallback height

      if (nextDist <= targetRadius) {
        // Reset particle back to outer shell
        const resetDir = new THREE.Vector3(
          rng.range(-1, 1),
          rng.range(-1, 1),
          rng.range(-1, 1)
        ).normalize();
        const resetDist = rng.range(PLANET_RADIUS + 8, PLANET_RADIUS + 12);
        pos.setXYZ(
          i,
          resetDir.x * resetDist,
          resetDir.y * resetDist,
          resetDir.z * resetDist
        );
      } else {
        pos.setXYZ(i, dir.x * nextDist, dir.y * nextDist, dir.z * nextDist);
      }
    }
    pos.needsUpdate = true;
  } else if (currentWeather === "snow" && snowParticles) {
    const pos = snowParticles.geometry.attributes.position!;
    const speeds = snowParticles.userData.speeds;

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);

      const dir = new THREE.Vector3(px, py, pz);
      const dist = dir.length();
      dir.normalize();

      // Drift down slower with slight side wobble
      const wobbleX = Math.sin(elapsed * 2.0 + i) * 0.1;
      const wobbleZ = Math.cos(elapsed * 2.0 + i) * 0.1;

      const nextDist = dist - speeds[i] * 10.0 * delta;

      if (nextDist <= PLANET_RADIUS + 0.1) {
        const resetDir = new THREE.Vector3(
          rng.range(-1, 1),
          rng.range(-1, 1),
          rng.range(-1, 1)
        ).normalize();
        const resetDist = rng.range(PLANET_RADIUS + 8, PLANET_RADIUS + 12);
        pos.setXYZ(
          i,
          resetDir.x * resetDist,
          resetDir.y * resetDist,
          resetDir.z * resetDist
        );
      } else {
        pos.setXYZ(
          i,
          dir.x * nextDist + wobbleX * delta * 5.0,
          dir.y * nextDist,
          dir.z * nextDist + wobbleZ * delta * 5.0
        );
      }
    }
    pos.needsUpdate = true;
  } else if (currentWeather === "sandstorm" && stormParticles) {
    const pos = stormParticles.geometry.attributes.position!;
    const angles = stormParticles.userData.angles;
    const heights = stormParticles.userData.heights;
    const radii = stormParticles.userData.radii;

    for (let i = 0; i < pos.count; i++) {
      // Swirl around the Y axis
      angles[i] += stormParticles.userData.rotSpeed * delta;

      // Turbulence wobbles height & radius
      const yWobble = Math.sin(elapsed * 4.0 + i) * 0.1;

      const r = radii[i] + Math.sin(elapsed * 2.0 + i) * 0.08;
      const x = Math.cos(angles[i]) * r;
      const z = Math.sin(angles[i]) * r;
      const y = heights[i] + yWobble;

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  // --- Interpolate Creature positions & orientations ---
  // We use standard requestAnimationFrame delta to update position coordinates smoothly
  const simSpeedFactor = isPaused ? 0 : simulationSpeed;
  const moveStep = delta * (1000 / tickInterval) * simSpeedFactor;

  creatures.forEach((c) => {
    updateAnimations(c, elapsed);

    if (c.targetNode) {
      c.moveProgress += moveStep;

      if (c.moveProgress >= 1.0) {
        // Arrived at destination node
        c.node.occupant = null;
        c.node = c.targetNode;
        c.node.occupant = c;
        c.targetNode = null;
        c.moveProgress = 0;

        // Dive hunt completion checks
        if (c.type === "scythe" && c.state === "diving") {
          // snatch prey and fly back up
          if (
            c.huntTarget &&
            creatures.includes(c.huntTarget) &&
            c.huntTarget.node === c.node
          ) {
            c.energy = Math.min(220, c.energy + 80);
            c.node.occupant = c;

            // Delete prey
            if (c.huntTarget.node.occupant === c.huntTarget)
              c.huntTarget.node.occupant = null;
            creaturesGroup.remove(c.huntTarget.model);
            creatures = creatures.filter((cr) => cr !== c.huntTarget);

            logEvent(`A Sky-Scythe dived and caught a ${c.huntTarget.type}!`);
          }
          c.state = "climbing";
          c.actionProgress = 0;
        }
      } else {
        // Interpolating position coordinates
        const posA = c.node.actualPosition;
        const posB = c.targetNode.actualPosition;

        const currentDir = new THREE.Vector3()
          .lerpVectors(c.node.position, c.targetNode.position, c.moveProgress)
          .normalize();
        const currentHeight = THREE.MathUtils.lerp(
          c.node.elevation,
          c.targetNode.elevation,
          c.moveProgress
        );

        // Flying offsets
        let flyAlt = 0;
        if (c.type === "scythe") {
          c.actionProgress = Math.min(1.0, c.actionProgress + moveStep * 1.5);
          if (c.state === "diving") {
            flyAlt = THREE.MathUtils.lerp(4.0, 0.0, c.actionProgress);
          } else if (c.state === "climbing") {
            flyAlt = THREE.MathUtils.lerp(0.0, 4.0, c.actionProgress);
          } else {
            flyAlt = 4.0;
          }
        }

        const radius = PLANET_RADIUS + currentHeight + flyAlt;
        c.model.position.copy(currentDir).setLength(radius);

        // Orient model heading vector (tangent to movement arc)
        const up = currentDir.clone();
        const bPos = c.targetNode.actualPosition.clone();

        if (c.type === "scythe") {
          bPos.setLength(PLANET_RADIUS + c.targetNode.elevation + flyAlt);
        }

        const heading = new THREE.Vector3()
          .subVectors(bPos, c.model.position)
          .projectOnPlane(up)
          .normalize();

        if (heading.lengthSq() > 0.001) {
          const binormal = new THREE.Vector3()
            .crossVectors(up, heading)
            .normalize();
          const basis = new THREE.Matrix4().makeBasis(binormal, up, heading);
          c.model.quaternion.setFromRotationMatrix(basis);
        }
      }
    } else {
      // Stationary default position anchoring
      const flyAlt =
        c.type === "scythe" ? (c.state === "roosting" ? 0.0 : 4.0) : 0.0;
      c.model.position
        .copy(c.node.position)
        .setLength(PLANET_RADIUS + c.node.elevation + flyAlt);

      // Orient facing forward statically
      const up = c.node.position.clone();
      const heading = new THREE.Vector3(1, 0, 0).projectOnPlane(up).normalize();
      const binormal = new THREE.Vector3()
        .crossVectors(up, heading)
        .normalize();
      const basis = new THREE.Matrix4().makeBasis(binormal, up, heading);
      c.model.quaternion.setFromRotationMatrix(basis);
    }
  });

  // --- Clock updates for simulation ticks ---
  if (!isPaused) {
    const timeSinceLastTick = elapsed * 1000 - lastTickTime;
    const adjustedInterval = tickInterval / simulationSpeed;

    if (timeSinceLastTick >= adjustedInterval) {
      executeSimulationTick();
      updateHUD();
      lastTickTime = elapsed * 1000;
    }
  }

  // Render scene view
  renderer.render(scene, camera);
}

// ==========================================
// 12. USER CONTROLS, MOUSE ROTATION & MOUSE WHEEL ZOOM
// ==========================================

function updateCamera() {
  // Rotate camera based on theta/phi angles
  camera.position.x =
    cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
  camera.position.y = cameraRadius * Math.cos(cameraPhi);
  camera.position.z =
    cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  camera.lookAt(0, 0, 0);
}

function initEventHandlers() {
  const canvas = document.getElementById("canvas")!;

  // Mouse Drag rotation
  canvas.addEventListener("mousedown", (e: any) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener("mousemove", (e: any) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    cameraTheta -= deltaX * 0.005;
    cameraPhi -= deltaY * 0.005;

    // Keep cameraPhi clamped so we don't flip upside down
    cameraPhi = THREE.MathUtils.clamp(cameraPhi, 0.1, Math.PI - 0.1);

    previousMousePosition = { x: e.clientX, y: e.clientY };
    updateCamera();
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // Mouse Wheel Zoom
  canvas.addEventListener("wheel", (e: any) => {
    cameraRadius += e.deltaY * 0.025;
    cameraRadius = THREE.MathUtils.clamp(cameraRadius, 20.0, 70.0);
    updateCamera();
  });

  // Raycasting click selection
  canvas.addEventListener("click", (e: any) => {
    // Avoid registration during rotation drag drags
    if (isDragging) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0) {
      const intersectPoint = intersects[0]!.point;
      // Convert intersection coordinates to planet coordinate directions
      const localDir = intersectPoint.clone().normalize();

      // Find closest node ID in grid
      let closestNode: GridNode = nodes[0]!;
      let maxDot = -Infinity;

      nodes.forEach((n) => {
        const dot = n.position.dot(localDir);
        if (dot > maxDot) {
          maxDot = dot;
          closestNode = n;
        }
      });

      selectedNode = closestNode;
      updateHUD();
      logEvent(
        `Inspecting tile #${closestNode.id} - ${closestNode.biome.toUpperCase()}`
      );
    }
  });

  // Keyboard shortcut keys
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "r" || e.key === "R") {
      restartSimulation();
    }
  });

  // Button HUD mapping bindings
  document.getElementById("btn-play")!.addEventListener("click", () => {
    isPaused = false;
    document.getElementById("btn-play")!.classList.add("active");
    document.getElementById("btn-pause")!.classList.remove("active");
  });

  document.getElementById("btn-pause")!.addEventListener("click", () => {
    isPaused = true;
    document.getElementById("btn-play")!.classList.remove("active");
    document.getElementById("btn-pause")!.classList.add("active");
  });

  // Speeds
  const speedBtns = ["btn-speed-1x", "btn-speed-2x", "btn-speed-4x"];
  speedBtns.forEach((id, idx) => {
    const speedVals = [1, 2, 4];
    document.getElementById(id)!.addEventListener("click", () => {
      simulationSpeed = speedVals[idx]!;
      speedBtns.forEach((btnId) =>
        document.getElementById(btnId)!.classList.remove("active")
      );
      document.getElementById(id)!.classList.add("active");
    });
  });

  // Reset
  document.getElementById("btn-restart")!.addEventListener("click", () => {
    restartSimulation();
  });

  // Weather triggers
  document.getElementById("btn-trigger-rain")!.addEventListener("click", () => {
    transitionWeatherTo("rain");
    weatherTimer = 150; // hold weather
  });
  document.getElementById("btn-trigger-snow")!.addEventListener("click", () => {
    transitionWeatherTo("snow");
    weatherTimer = 150;
  });
  document
    .getElementById("btn-trigger-storm")!
    .addEventListener("click", () => {
      transitionWeatherTo("sandstorm");
      weatherTimer = 150;
    });
  document
    .getElementById("btn-clear-weather")!
    .addEventListener("click", () => {
      transitionWeatherTo("clear");
      weatherTimer = 150;
    });
}

function restartSimulation() {
  const newSeed = Math.floor(Math.random() * 999999);
  rng = new SeededRandom(newSeed);
  noiseGen = new ImprovedNoise(rng);

  // Wipe creatures
  if (creaturesGroup) {
    scene.remove(creaturesGroup);
  }
  creatures = [];

  // Wipe planet
  if (planetGroup) {
    scene.remove(planetGroup);
  }

  selectedNode = null;
  simTimeTicks = 0;
  currentWeather = "clear";

  initPlanet();
  spawnInitialEcosystem();
  transitionWeatherTo("clear");
  updateHUD();
  logEvent(`Ecosystem regenerated with seed: ${newSeed}`);
}

// ==========================================
// 13. MASTER INITIALIZATION FUNCTION
// ==========================================

function init() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;

  // 1. Setup Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 2. Setup Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040407);
  // Add space starfields
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 600;
  const starsPos = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount; i++) {
    const v = new THREE.Vector3(
      rng.range(-1, 1),
      rng.range(-1, 1),
      rng.range(-1, 1)
    ).normalize();
    const d = rng.range(80, 150);
    starsPos[i * 3] = v.x * d;
    starsPos[i * 3 + 1] = v.y * d;
    starsPos[i * 3 + 2] = v.z * d;
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(starsPos, 3));
  const starsMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.18,
    transparent: true,
    opacity: 0.7,
  });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  updateCamera();

  // 3. Add Advanced Lighting & Shadow Map Helpers
  ambientLight = new THREE.AmbientLight(0x0f172a, 0.6); // faint space fill
  scene.add(ambientLight);

  dirLightParent = new THREE.Group();
  scene.add(dirLightParent);

  // Sun Light (casts shadows)
  sunLight = new THREE.DirectionalLight(0xfef08a, 1.25);
  sunLight.position.set(0, 0, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 100;
  const dCam = 25;
  sunLight.shadow.camera.left = -dCam;
  sunLight.shadow.camera.right = dCam;
  sunLight.shadow.camera.top = dCam;
  sunLight.shadow.camera.bottom = -dCam;
  sunLight.shadow.bias = -0.0005;
  dirLightParent.add(sunLight);

  // Weak Moon Light on reverse side
  moonLight = new THREE.PointLight(0x93c5fd, 0.5, 100);
  moonLight.position.set(0, 0, -40);
  dirLightParent.add(moonLight);

  // 4. Initialize Objects
  initPlanet();
  initWeather();
  spawnInitialEcosystem();

  // 5. Setup Events
  initEventHandlers();

  // Resize handler
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Start frames loop
  animationClock.getDelta(); // reset clock
  animateFrame();
}

// Master Load trigger
window.addEventListener("DOMContentLoaded", () => {
  init();
});
