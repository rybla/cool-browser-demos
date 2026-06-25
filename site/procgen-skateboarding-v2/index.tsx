import * as THREE from "three";
import RAPIER from "@dimforge/rapier2d-compat";

// Initialize Rapier Physics
await RAPIER.init();

// --- CONSTANTS ---
const CHUNK_WIDTH = 60; // width of each terrain chunk in meters
const CHUNK_SUBDIVISIONS = 60; // subdivisions per chunk (1 meter resolution)
const RENDER_WIDTH = window.innerWidth;
const RENDER_HEIGHT = window.innerHeight;
const GRAVITY = -16.0;

const world = new RAPIER.World(new RAPIER.Vector2(0, GRAVITY));

// Skateboard Dimensions
const DECK_WIDTH = 1.7;
const DECK_HEIGHT = 0.08;
const WHEEL_RADIUS = 0.18;
const WHEEL_OFFSET_X = 0.6;
const WHEEL_OFFSET_Y = -0.15;

// Player Dimensions
const PLAYER_RADIUS = 0.24;
const PLAYER_HEIGHT = 1.1; // total height

// Gameplay constants
const MAX_SPEED = 22.0; // m/s
const PUSH_FORCE = 120.0;
const OLLIE_IMPULSE = 3.25;
const TILT_TORQUE = 4.0;
const RESET_TIME = 2500; // ms

// --- GAME STATE ---
let score = 0;
let multiplier = 1;
let currentSpeed = 0;
let isCrashed = false;
let crashTime = 0;
let wasInAir = false;
let airTime = 0;
let accumulatedRotation = 0;
let prevFrameRotation = 0;
let isGrinding = false;
let grindTime = 0;
let lastLandedTrickTime = 0;

// Keyboard input state
const keys: Record<string, boolean> = {};

// Reference to current active physics objects
let deckBody: RAPIER.RigidBody;
let frontWheelBody: RAPIER.RigidBody;
let backWheelBody: RAPIER.RigidBody;
let playerBody: RAPIER.RigidBody;
let playerJoint: RAPIER.ImpulseJoint | null = null;

// Visual objects
let deckMesh: THREE.Mesh;
let frontWheelMesh: THREE.Mesh;
let backWheelMesh: THREE.Mesh;
let playerGroup: THREE.Group;
let playerTorso: THREE.Mesh;

// Camera effects
let cameraShake = 0;

// Particle System
interface GameParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number; // 0 to 1
  decay: number;
  colorType: "spark" | "dust";
}
const particles: GameParticle[] = [];

// Cache of generated chunks
interface LoadedChunk {
  index: number;
  physicsBody: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  glowLines: THREE.LineSegments;
  decorations: THREE.Object3D[];
}
const loadedChunks = new Map<number, LoadedChunk>();
let playerChunkIndex = 0;

// DOM Elements
const scoreVal = document.getElementById("score-val")!;
const multVal = document.getElementById("mult-val")!;
const speedVal = document.getElementById("speed-val")!;
const trickDisplay = document.getElementById("trick-display")!;
const wipeoutBanner = document.getElementById("wipeout-banner")!;

// --- HELPER FUNCTIONS ---

// Type-safe material disposal
function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m) => m.dispose());
  } else {
    material.dispose();
  }
}

// Simple Seeded Random Generator (Mulberry32)
function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Global deterministic height function
function getTerrainHeight(x: number): number {
  const chunkIdx = Math.floor(x / CHUNK_WIDTH);
  const t = (x - chunkIdx * CHUNK_WIDTH) / CHUNK_WIDTH; // 0 to 1

  const hStart = getBorderHeight(chunkIdx);
  const hEnd = getBorderHeight(chunkIdx + 1);

  // Linear interpolation base slope
  const baseHeight = hStart * (1 - t) + hEnd * t;

  // Add chunk specific feature
  const featureHeight = getFeatureHeight(chunkIdx, t);

  return baseHeight + featureHeight;
}

// Approximate slope at X
function getTerrainSlope(x: number): number {
  const epsilon = 0.1;
  const h1 = getTerrainHeight(x - epsilon);
  const h2 = getTerrainHeight(x + epsilon);
  return (h2 - h1) / (2 * epsilon);
}

// Continuous border height based on index
function getBorderHeight(chunkIdx: number): number {
  // Use multi-frequency sine wave for continuous random-access heights
  return (
    Math.sin(chunkIdx * 0.72) * 5.0 +
    Math.cos(chunkIdx * 1.63) * 2.0 +
    Math.sin(chunkIdx * 0.19) * 8.0
  );
}

// Local feature of a chunk, must evaluate to 0 at t=0 and t=1
function getFeatureHeight(chunkIdx: number, t: number): number {
  // Seed hash based on chunk index
  const seed = Math.abs(chunkIdx) * 1234 + (chunkIdx < 0 ? 99 : 0);
  const rand = mulberry32(seed);

  const rVal = rand();

  if (chunkIdx === 0) {
    // Starting chunk is smooth and flat
    return Math.sin(t * Math.PI) * 1.0;
  }

  if (rVal < 0.25) {
    // Rolling hills
    const frequency = Math.floor(rand() * 2) + 1; // 1 or 2 waves
    const amplitude = rand() * 2.5 + 1.0;
    return Math.sin(t * Math.PI * 2 * frequency) * amplitude;
  } else if (rVal < 0.5) {
    // Deep Halfpipe / Skate Bowl
    const depth = rand() * 4.5 + 3.5; // 3.5m to 8m deep
    return -depth * Math.sin(t * Math.PI);
  } else if (rVal < 0.7) {
    // Launch Kicker Ramp
    const height = rand() * 3.5 + 2.5;
    if (t < 0.45) {
      // Curved run-up
      const nt = t / 0.45;
      return Math.sin(nt * Math.PI * 0.5) * height;
    } else if (t < 0.6) {
      // The Drop
      const nt = (t - 0.45) / 0.15;
      const blend = (1 + Math.cos(nt * Math.PI)) / 2; // 1 to 0
      return blend * height - (1 - blend) * height * 0.5;
    } else {
      // Landing ramp blend back to border
      const nt = (t - 0.6) / 0.4;
      const blend = (1 + Math.cos(nt * Math.PI)) / 2; // 1 to 0
      return -blend * height * 0.5;
    }
  } else if (rVal < 0.85) {
    // The Big Valley / Gap
    const depth = rand() * 6.0 + 5.0;
    if (t < 0.25 || t > 0.75) {
      return 0;
    } else if (t < 0.35) {
      const nt = (t - 0.25) / 0.1;
      const blend = (1 + Math.cos(nt * Math.PI)) / 2;
      return -(1 - blend) * depth;
    } else if (t < 0.65) {
      return -depth;
    } else {
      const nt = (t - 0.65) / 0.1;
      const blend = (1 + Math.cos(nt * Math.PI)) / 2;
      return -blend * depth;
    }
  } else {
    // Flat chunk (for rails & ledges placed visually/physically on top)
    return 0;
  }
}

// --- THREE.JS SCENE SETUP ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a071d, 0.015);

// Camera Setup
const camera = new THREE.PerspectiveCamera(
  50,
  RENDER_WIDTH / RENDER_HEIGHT,
  0.1,
  1000
);
camera.position.set(0, 4, 14);

// WebGL Renderer Setup
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canvas")!,
  antialias: true,
});
renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Bright Sunset Lightings
const ambientLight = new THREE.AmbientLight(0x5c428a, 3.2); // much brighter and more colorful purple
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffa500, 4.0); // very bright golden orange directional sun
sunLight.position.set(15, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 50;
const dRange = 18;
sunLight.shadow.camera.left = -dRange;
sunLight.shadow.camera.right = dRange;
sunLight.shadow.camera.top = dRange;
sunLight.shadow.camera.bottom = -dRange;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// Neon Fill Light from the front-below to pop elements in high-contrast
const neonFillLight = new THREE.DirectionalLight(0x00ffff, 2.2); // strong cyan fill
neonFillLight.position.set(-10, -5, 5);
scene.add(neonFillLight);

// Neon Backlight
const neonBacklight = new THREE.DirectionalLight(0xff00ff, 1.8); // strong pink backlight
neonBacklight.position.set(-15, 5, -5);
scene.add(neonBacklight);

// --- BEAUTIFUL SUNSET SYNTHWAVE BACKGROUND ---
// Dynamic gradient backdrop plane
const bgCanvas = document.createElement("canvas");
bgCanvas.width = 256;
bgCanvas.height = 256;
const bgCtx = bgCanvas.getContext("2d")!;
const gradient = bgCtx.createLinearGradient(0, 0, 0, 256);
gradient.addColorStop(0, "#120a2e"); // brighter sky top
gradient.addColorStop(0.3, "#3d1266"); // brighter purple
gradient.addColorStop(0.6, "#c7007d"); // brighter hot pink
gradient.addColorStop(0.85, "#ff5500"); // bright orange
gradient.addColorStop(1.0, "#ffcc00"); // neon yellow horizon
bgCtx.fillStyle = gradient;
bgCtx.fillRect(0, 0, 256, 256);

const bgTexture = new THREE.CanvasTexture(bgCanvas);
const bgMaterial = new THREE.MeshBasicMaterial({
  map: bgTexture,
  side: THREE.BackSide,
  depthWrite: false,
});
const bgGeometry = new THREE.SphereGeometry(150, 32, 15);
const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
scene.add(bgMesh);

// Glowing Retro Sun
const sunGeometry = new THREE.CircleGeometry(22, 32);
const sunMaterial = new THREE.MeshBasicMaterial({
  color: 0xff5500, // brighter orange
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
});
const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
sunMesh.position.set(25, 10, -50);
scene.add(sunMesh);

// Low-poly background hills (Parallax)
const bgHills: THREE.Mesh[] = [];
const hillMaterial = new THREE.MeshPhongMaterial({
  color: 0x180f3c, // brighter background silhouette
  flatShading: true,
  shininess: 0,
});
const hillCount = 10;
const hillWidth = 35;
for (let i = 0; i < hillCount; i++) {
  const height = 15 + Math.random() * 15;
  const geom = new THREE.ConeGeometry(hillWidth, height, 4);
  const mesh = new THREE.Mesh(geom, hillMaterial);
  mesh.position.set(
    (i - hillCount / 2) * hillWidth * 0.7,
    height / 2 - 12,
    -35
  );
  mesh.rotation.y = Math.random() * Math.PI;
  scene.add(mesh);
  bgHills.push(mesh);
}

// --- PARTICLE CREATION TOOL ---
function spawnSparks(x: number, y: number, count: number): void {
  const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
  });

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.position.set(x, y, (Math.random() - 0.5) * 0.6);
    scene.add(mesh);

    const angle = Math.random() * Math.PI * 2;
    const speedVal = 2.0 + Math.random() * 5.0;
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speedVal - 3.0, // blow slightly backward
      Math.sin(angle) * speedVal + 1.0,
      (Math.random() - 0.5) * 2.0
    );

    particles.push({
      mesh,
      velocity,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.04,
      colorType: "spark",
    });
  }
}

function spawnWheelDust(x: number, y: number, count: number): void {
  const dustGeo = new THREE.SphereGeometry(0.12, 4, 4);
  const dustMat = new THREE.MeshBasicMaterial({
    color: 0x8800ff,
    transparent: true,
    opacity: 0.4,
  });

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(dustGeo, dustMat.clone());
    mesh.position.set(x, y, (Math.random() - 0.5) * 0.4);
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      -1.5 - Math.random() * 2.0, // drift backwards
      0.2 + Math.random() * 0.8,
      (Math.random() - 0.5) * 0.5
    );

    particles.push({
      mesh,
      velocity,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.03,
      colorType: "dust",
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p) continue;

    p.mesh.position.addScaledVector(p.velocity, dt);

    // Apply gravity to sparks
    if (p.colorType === "spark") {
      p.velocity.y += GRAVITY * dt * 0.3;
    }

    p.life -= p.decay;

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      disposeMaterial(p.mesh.material);
      particles.splice(i, 1);
    } else {
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = p.life;
      if (p.colorType === "spark") {
        // Sparks change color: white -> yellow -> magenta -> fade
        if (p.life > 0.7) {
          mat.color.setHex(0xffffff);
        } else if (p.life > 0.4) {
          mat.color.setHex(0xffaa00);
        } else {
          mat.color.setHex(0xff0088);
        }
        p.mesh.scale.setScalar(p.life);
      } else {
        // Dust expands and fades
        p.mesh.scale.setScalar((2.0 - p.life) * 1.5);
      }
    }
  }
}

// --- RAPIER PHYSICS SETUP & PHYSICS SPAWNER ---

// Spawn Skateboard and Player
function spawnPlayerSkateboard(startX: number, startY: number): void {
  // --- 1. SKATEBOARD DECK ---
  const deckBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(startX, startY)
    .setAngularDamping(1.5)
    .setLinearDamping(0.1);
  deckBody = world.createRigidBody(deckBodyDesc);

  const deckColliderDesc = RAPIER.ColliderDesc.cuboid(
    DECK_WIDTH / 2,
    DECK_HEIGHT / 2
  )
    .setFriction(0.4)
    .setRestitution(0.0)
    .setCollisionGroups(0x00020001); // Board group
  world.createCollider(deckColliderDesc, deckBody);

  // Deck visual representation
  const deckGeo = new THREE.BoxGeometry(DECK_WIDTH, DECK_HEIGHT, 0.45);
  const deckMat = new THREE.MeshPhongMaterial({
    color: 0x3d1566, // brighter purple deck
    shininess: 50,
    specular: 0xff00ff,
  });
  deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  scene.add(deckMesh);

  // Underglow neon visual mesh
  const glowGeo = new THREE.BoxGeometry(DECK_WIDTH - 0.4, 0.02, 0.35);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff00aa,
    toneMapped: false,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.y = -DECK_HEIGHT / 2 - 0.01;
  deckMesh.add(glowMesh);

  // --- 2. WHEELS ---
  const wheelMaterial = new THREE.MeshPhongMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff, // bright cyan emissive!
    emissiveIntensity: 0.5,
    shininess: 60,
  });
  const wheelGeo = new THREE.CylinderGeometry(
    WHEEL_RADIUS,
    WHEEL_RADIUS,
    0.15,
    12
  );
  wheelGeo.rotateX(Math.PI / 2); // align cylinders with axle direction (Z axis)

  // Front Wheel Physics
  const frontWheelDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
    startX + WHEEL_OFFSET_X,
    startY + WHEEL_OFFSET_Y
  );
  frontWheelBody = world.createRigidBody(frontWheelDesc);
  const frontCollider = RAPIER.ColliderDesc.ball(WHEEL_RADIUS)
    .setFriction(1.4)
    .setRestitution(0.0)
    .setCollisionGroups(0x00020001); // Board group
  world.createCollider(frontCollider, frontWheelBody);

  frontWheelMesh = new THREE.Mesh(wheelGeo, wheelMaterial);
  frontWheelMesh.castShadow = true;
  scene.add(frontWheelMesh);

  // Back Wheel Physics
  const backWheelDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
    startX - WHEEL_OFFSET_X,
    startY + WHEEL_OFFSET_Y
  );
  backWheelBody = world.createRigidBody(backWheelDesc);
  const backCollider = RAPIER.ColliderDesc.ball(WHEEL_RADIUS)
    .setFriction(1.4)
    .setRestitution(0.0)
    .setCollisionGroups(0x00020001); // Board group
  world.createCollider(backCollider, backWheelBody);

  backWheelMesh = new THREE.Mesh(wheelGeo, wheelMaterial);
  backWheelMesh.castShadow = true;
  scene.add(backWheelMesh);

  // --- 3. REVOLUTE JOINTS FOR WHEELS ---
  const jointFrontData = RAPIER.JointData.revolute(
    new RAPIER.Vector2(WHEEL_OFFSET_X, WHEEL_OFFSET_Y),
    new RAPIER.Vector2(0, 0)
  );
  world.createImpulseJoint(jointFrontData, deckBody, frontWheelBody, true);

  const jointBackData = RAPIER.JointData.revolute(
    new RAPIER.Vector2(-WHEEL_OFFSET_X, WHEEL_OFFSET_Y),
    new RAPIER.Vector2(0, 0)
  );
  world.createImpulseJoint(jointBackData, deckBody, backWheelBody, true);

  // --- 4. PLAYER RAGDOLL / CAPSULE ---
  const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(startX, startY + 0.7)
    .setLinearDamping(0.05)
    .setAngularDamping(0.8);
  playerBody = world.createRigidBody(playerBodyDesc);

  // Physics Capsule Collider
  const halfCapsuleHeight = (PLAYER_HEIGHT - PLAYER_RADIUS * 2) / 2;
  const playerColliderDesc = RAPIER.ColliderDesc.capsule(
    halfCapsuleHeight,
    PLAYER_RADIUS
  )
    .setFriction(0.2)
    .setRestitution(0.0)
    .setCollisionGroups(0x00040001); // Player group
  world.createCollider(playerColliderDesc, playerBody);

  // Player Visual Group
  playerGroup = new THREE.Group();
  scene.add(playerGroup);

  // Torso capsule mesh
  const playerGeo = new THREE.CapsuleGeometry(
    PLAYER_RADIUS,
    PLAYER_HEIGHT - PLAYER_RADIUS * 2,
    8,
    16
  );
  const playerMat = new THREE.MeshPhongMaterial({
    color: 0x332a63, // brighter body
    shininess: 60,
    specular: 0x00ffff,
  });
  playerTorso = new THREE.Mesh(playerGeo, playerMat);
  playerTorso.castShadow = true;
  playerGroup.add(playerTorso);

  // Glowing Cyber Visor
  const visorGeo = new THREE.BoxGeometry(0.35, 0.09, 0.45);
  const visorMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    toneMapped: false,
  });
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0.12, 0.25, 0); // front-facing (X is forward)
  playerTorso.add(visorMesh);

  // Glowing neon chest core
  const coreGeo = new THREE.SphereGeometry(0.1, 8, 8);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xff00aa,
    toneMapped: false,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.set(0.15, -0.05, 0);
  playerTorso.add(coreMesh);

  // --- 5. CONNECTING JOINT (PLAYER BASE -> DECK TOP) ---
  const localAnchorPlayer = new RAPIER.Vector2(0, -PLAYER_HEIGHT / 2);
  const localAnchorDeck = new RAPIER.Vector2(0, DECK_HEIGHT / 2);

  const jointPlayerData = RAPIER.JointData.revolute(
    localAnchorPlayer,
    localAnchorDeck
  );
  playerJoint = world.createImpulseJoint(
    jointPlayerData,
    playerBody,
    deckBody,
    true
  );
}

// Initialize player
spawnPlayerSkateboard(0, 3.5);

// --- CHUNK-BASED INF-TERRAIN MANAGER ---

function getChunkMesh(chunkIdx: number): {
  mesh: THREE.Mesh;
  glowLines: THREE.LineSegments;
  decorations: THREE.Object3D[];
} {
  // Vertices generator
  const xStart = chunkIdx * CHUNK_WIDTH;
  const numSteps = CHUNK_SUBDIVISIONS;
  const stepSize = CHUNK_WIDTH / numSteps;

  const vertices: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  const depth = 2.0; // depth in Z axis

  // We want to construct vertices:
  // For each step s from 0 to numSteps:
  // top_front:  (x, y, depth)
  // top_back:   (x, y, -depth)
  // bottom_front: (x, -16.0, depth)
  // bottom_back:  (x, -16.0, -depth)

  for (let s = 0; s <= numSteps; s++) {
    const x = xStart + s * stepSize;
    const y = getTerrainHeight(x);
    const bottomY = -16.0;

    // Vertices coordinates
    // 0: top front
    vertices.push(x, y, depth);
    // 1: top back
    vertices.push(x, y, -depth);
    // 2: bottom front
    vertices.push(x, bottomY, depth);
    // 3: bottom back
    vertices.push(x, bottomY, -depth);

    // Apply color gradient to create depth
    // Top surface color (neon indigo)
    const topColor = new THREE.Color(0x352375); // much brighter purple
    // Bottom color (deep dark purple/black)
    const botColor = new THREE.Color(0x0a0522); // brighter base

    colors.push(topColor.r, topColor.g, topColor.b); // top front
    colors.push(topColor.r, topColor.g, topColor.b); // top back
    colors.push(botColor.r, botColor.g, botColor.b); // bottom front
    colors.push(botColor.r, botColor.g, botColor.b); // bottom back
  }

  // Triangles generation
  for (let s = 0; s < numSteps; s++) {
    const baseIdx = s * 4;

    // Top surface faces (between front/back top)
    // baseIdx (tf), baseIdx+1 (tb), baseIdx+4 (next tf), baseIdx+5 (next tb)
    indices.push(baseIdx, baseIdx + 4, baseIdx + 1);
    indices.push(baseIdx + 1, baseIdx + 4, baseIdx + 5);

    // Front skirt faces
    // baseIdx (tf), baseIdx+2 (bf), baseIdx+4 (next tf), baseIdx+6 (next bf)
    indices.push(baseIdx, baseIdx + 2, baseIdx + 4);
    indices.push(baseIdx + 2, baseIdx + 6, baseIdx + 4);

    // Back skirt faces
    // baseIdx+1 (tb), baseIdx+5 (next tb), baseIdx+3 (bb), baseIdx+7 (next bb)
    indices.push(baseIdx + 1, baseIdx + 5, baseIdx + 3);
    indices.push(baseIdx + 3, baseIdx + 5, baseIdx + 7);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const terrainMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 25,
    specular: 0x8800ff,
  });

  const mesh = new THREE.Mesh(geom, terrainMat);
  mesh.receiveShadow = true;

  // Neon glowing track outlines along edges
  const lineVertices: number[] = [];
  for (let s = 0; s < numSteps; s++) {
    const x0 = xStart + s * stepSize;
    const y0 = getTerrainHeight(x0);
    const x1 = xStart + (s + 1) * stepSize;
    const y1 = getTerrainHeight(x1);

    // Front edge outline
    lineVertices.push(x0, y0, depth + 0.01);
    lineVertices.push(x1, y1, depth + 0.01);

    // Back edge outline
    lineVertices.push(x0, y0, -depth - 0.01);
    lineVertices.push(x1, y1, -depth - 0.01);
  }

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(lineVertices, 3)
  );
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xff00cc,
  });
  const glowLines = new THREE.LineSegments(lineGeom, lineMat);

  // Spawn decorations (e.g. glowing street lamps or grind rails)
  const decorations: THREE.Object3D[] = [];
  const seed = Math.abs(chunkIdx) * 1234 + (chunkIdx < 0 ? 99 : 0);
  const rand = mulberry32(seed);

  // Add grind rails in flat regions
  const rVal = rand();
  if (rVal >= 0.85 && chunkIdx !== 0) {
    // Spawn a neon grind rail!
    const railXStart = xStart + 15;
    const railXEnd = xStart + 45;
    const railSteps = 10;
    const railYOffset = 0.9; // height of rail above ground

    const railVertices: THREE.Vector3[] = [];
    for (let j = 0; j <= railSteps; j++) {
      const rx = railXStart + (j / railSteps) * (railXEnd - railXStart);
      const ry = getTerrainHeight(rx) + railYOffset;
      railVertices.push(new THREE.Vector3(rx, ry, 0));
    }

    // Main horizontal rail tube
    const tubeGeom = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(railVertices),
      20,
      0.08,
      8,
      false
    );
    const railMat = new THREE.MeshPhongMaterial({
      color: 0x00ffff,
      emissive: 0x003333,
      shininess: 80,
    });
    const railMesh = new THREE.Mesh(tubeGeom, railMat);
    railMesh.castShadow = true;
    decorations.push(railMesh);

    // Support vertical posts
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
    postGeo.translate(0, -0.6, 0); // anchor at top
    for (let k = 1; k < railSteps; k++) {
      const postPos = railVertices[k];
      if (postPos) {
        const post = new THREE.Mesh(postGeo, railMat);
        post.position.copy(postPos);
        post.castShadow = true;
        decorations.push(post);
      }
    }
  }

  return { mesh, glowLines, decorations };
}

function loadChunk(chunkIdx: number): void {
  if (loadedChunks.has(chunkIdx)) return;

  // --- 1. PHYSICS POLYLINE ---
  const bodyDesc = RAPIER.RigidBodyDesc.fixed();
  const physicsBody = world.createRigidBody(bodyDesc);

  const xStart = chunkIdx * CHUNK_WIDTH;
  const numSteps = CHUNK_SUBDIVISIONS;
  const stepSize = CHUNK_WIDTH / numSteps;

  // Generate vertices for the polyline terrain
  const vertices = new Float32Array((numSteps + 1) * 2);
  for (let s = 0; s <= numSteps; s++) {
    const x = xStart + s * stepSize;
    const y = getTerrainHeight(x);
    vertices[s * 2] = x;
    vertices[s * 2 + 1] = y;
  }

  const colliderDesc = RAPIER.ColliderDesc.polyline(vertices, null)
    .setFriction(0.6)
    .setRestitution(0.0)
    .setCollisionGroups(0x00010007); // Ground group
  world.createCollider(colliderDesc, physicsBody);

  // Add grind rail physics if a rail exists in this chunk
  // We recreate the rail as a physical polyline collider slightly above the ground
  const seed = Math.abs(chunkIdx) * 1234 + (chunkIdx < 0 ? 99 : 0);
  const rand = mulberry32(seed);
  const rVal = rand();
  if (rVal >= 0.85 && chunkIdx !== 0) {
    const railXStart = xStart + 15;
    const railXEnd = xStart + 45;
    const railSteps = 20; // 20 segments for the rail
    const railVertices = new Float32Array((railSteps + 1) * 2);
    for (let j = 0; j <= railSteps; j++) {
      const rx = railXStart + (j / railSteps) * (railXEnd - railXStart);
      const ry = getTerrainHeight(rx) + 0.9;
      railVertices[j * 2] = rx;
      railVertices[j * 2 + 1] = ry;
    }
    const railColliderDesc = RAPIER.ColliderDesc.polyline(railVertices, null)
      .setFriction(0.05) // rails are super slippery!
      .setRestitution(0.0)
      .setCollisionGroups(0x00010007); // Ground group
    world.createCollider(railColliderDesc, physicsBody);
  }

  // --- 2. THREE.JS VISUALS ---
  const visual = getChunkMesh(chunkIdx);
  scene.add(visual.mesh);
  scene.add(visual.glowLines);
  visual.decorations.forEach((d) => scene.add(d));

  // Save reference
  loadedChunks.set(chunkIdx, {
    index: chunkIdx,
    physicsBody,
    mesh: visual.mesh,
    glowLines: visual.glowLines,
    decorations: visual.decorations,
  });
}

function unloadChunk(chunkIdx: number): void {
  const chunk = loadedChunks.get(chunkIdx);
  if (!chunk) return;

  // Remove physics
  world.removeRigidBody(chunk.physicsBody);

  // Remove visuals
  scene.remove(chunk.mesh);
  chunk.mesh.geometry.dispose();
  disposeMaterial(chunk.mesh.material);

  scene.remove(chunk.glowLines);
  chunk.glowLines.geometry.dispose();
  disposeMaterial(chunk.glowLines.material);

  chunk.decorations.forEach((d) => {
    scene.remove(d);
    d.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mesh = child as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.Material | THREE.Material[]
        >;
        mesh.geometry.dispose();
        disposeMaterial(mesh.material);
      }
    });
  });

  loadedChunks.delete(chunkIdx);
}

function updateChunks(playerX: number): void {
  const currentChunk = Math.floor(playerX / CHUNK_WIDTH);

  if (currentChunk !== playerChunkIndex) {
    playerChunkIndex = currentChunk;

    // Load active adjacent chunks
    const requiredIndices = [
      playerChunkIndex - 1,
      playerChunkIndex,
      playerChunkIndex + 1,
    ];

    // Load missing
    requiredIndices.forEach((idx) => loadChunk(idx));

    // Unload distant chunks
    for (const loadedIdx of loadedChunks.keys()) {
      if (!requiredIndices.includes(loadedIdx)) {
        unloadChunk(loadedIdx);
      }
    }
  }
}

// Initial Chunk Loading
loadChunk(-1);
loadChunk(0);
loadChunk(1);

// --- INPUT LISTENERS ---
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyR") {
    triggerReset();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// --- HELPER GAME FUNCTIONS ---

function getIsOnGround(): {
  ground: boolean;
  distToGround: number;
  slope: number;
} {
  const pX = deckBody.translation().x;

  const leftWheelX = pX - WHEEL_OFFSET_X;
  const leftWheelY = backWheelBody.translation().y;
  const rightWheelX = pX + WHEEL_OFFSET_X;
  const rightWheelY = frontWheelBody.translation().y;

  const leftFloorHeight = getTerrainHeight(leftWheelX);
  const rightFloorHeight = getTerrainHeight(rightWheelX);

  const distLeft = leftWheelY - leftFloorHeight;
  const distRight = rightWheelY - rightFloorHeight;

  const lowestDist = Math.min(distLeft, distRight);

  // Wheel radius is WHEEL_RADIUS. If distance is slightly larger than radius, it means we are touching
  const onGround = lowestDist < WHEEL_RADIUS + 0.08;
  const currentSlope = getTerrainSlope(pX);

  return { ground: onGround, distToGround: lowestDist, slope: currentSlope };
}

function checkGrinding(): boolean {
  const pX = deckBody.translation().x;
  const pY = deckBody.translation().y;
  const terrainY = getTerrainHeight(pX);

  const leftFloor = getTerrainHeight(pX - WHEEL_OFFSET_X);
  const rightFloor = getTerrainHeight(pX + WHEEL_OFFSET_X);

  const leftDist = backWheelBody.translation().y - leftFloor;
  const rightDist = frontWheelBody.translation().y - rightFloor;

  // If wheels are airborne (dist > radius + tolerance)
  // BUT the deck center is very close to ground (where rail resides), we are grinding
  const wheelsAirborne =
    leftDist > WHEEL_RADIUS + 0.09 && rightDist > WHEEL_RADIUS + 0.09;
  const deckClose = pY - terrainY < 0.65; // Deck center height relative to ground

  // Check if we are on a grind rail chunk
  const chunkIdx = Math.floor(pX / CHUNK_WIDTH);
  const seed = Math.abs(chunkIdx) * 1234 + (chunkIdx < 0 ? 99 : 0);
  const rand = mulberry32(seed);
  const rVal = rand();

  // Rail bounds are from chunk_start + 15 to chunk_start + 45
  const localX = pX - chunkIdx * CHUNK_WIDTH;
  const nearRail = rVal >= 0.85 && localX > 14 && localX < 46;

  return wheelsAirborne && deckClose && nearRail;
}

function triggerReset(): void {
  // Clean physics bodies
  world.removeRigidBody(deckBody);
  world.removeRigidBody(frontWheelBody);
  world.removeRigidBody(backWheelBody);
  world.removeRigidBody(playerBody);
  playerJoint = null;

  // Clean visual meshes
  scene.remove(deckMesh);
  deckMesh.geometry.dispose();
  disposeMaterial(deckMesh.material);

  scene.remove(frontWheelMesh);
  frontWheelMesh.geometry.dispose();
  disposeMaterial(frontWheelMesh.material);

  scene.remove(backWheelMesh);
  backWheelMesh.geometry.dispose();
  disposeMaterial(backWheelMesh.material);

  scene.remove(playerGroup);
  playerTorso.geometry.dispose();
  disposeMaterial(playerTorso.material);

  // Respawn at latest safe X, above ground
  const currentX = camera.position.x - 3;
  const spawnX = Math.max(0, currentX);
  const spawnY = getTerrainHeight(spawnX) + 3.0;

  spawnPlayerSkateboard(spawnX, spawnY);

  isCrashed = false;
  wipeoutBanner.classList.add("hidden");
  multiplier = 1;
}

// Float floating trick text on screen
let trickTimeout: Timer;
function showTrickText(text: string): void {
  trickDisplay.innerText = text;
  trickDisplay.classList.remove("hidden");

  clearTimeout(trickTimeout);
  trickTimeout = setTimeout(() => {
    trickDisplay.classList.add("hidden");
  }, 2200);
}

// --- GAME LOOP ---
const clock = new THREE.Clock();
let accumulator = 0;
const physicsTimeStep = 1 / 60;

function tick(): void {
  requestAnimationFrame(tick);

  const dt = Math.min(clock.getDelta(), 0.1); // cap dt at 100ms to avoid crazy spikes
  accumulator += dt;

  const { ground: isOnGround, distToGround, slope } = getIsOnGround();
  const deckVel = deckBody.linvel();
  currentSpeed = deckVel.x * 3.6; // convert m/s to km/h

  // Update speed HUD
  speedVal.innerText = `${Math.max(0, currentSpeed).toFixed(1)} km/h`;

  // --- PHYSICS UPDATES (FIXED TIMESTEPS) ---
  while (accumulator >= physicsTimeStep) {
    // 1. Keyboard Pushing Control
    if (!isCrashed) {
      if (keys["ArrowRight"] || keys["KeyD"]) {
        if (isOnGround && deckVel.x < MAX_SPEED) {
          // Push forwards
          deckBody.applyImpulse(
            new RAPIER.Vector2(PUSH_FORCE * physicsTimeStep, 0),
            true
          );
          // Kick dust
          if (Math.random() < 0.3) {
            spawnWheelDust(
              backWheelBody.translation().x,
              backWheelBody.translation().y - WHEEL_RADIUS,
              2
            );
          }
        }
      }
      if (keys["ArrowLeft"] || keys["KeyA"]) {
        if (isOnGround) {
          // Push backwards
          deckBody.applyImpulse(
            new RAPIER.Vector2(-PUSH_FORCE * physicsTimeStep * 0.7, 0),
            true
          );
        }
      }

      // Crouch Mechanics (Visual and gameplay prep)
      if (keys["ArrowDown"] || keys["KeyS"]) {
        // scale visually
        playerTorso.scale.y = THREE.MathUtils.lerp(
          playerTorso.scale.y,
          0.55,
          0.2
        );
        playerTorso.position.y = THREE.MathUtils.lerp(
          playerTorso.position.y,
          -0.22,
          0.2
        );
      } else {
        playerTorso.scale.y = THREE.MathUtils.lerp(
          playerTorso.scale.y,
          1.0,
          0.15
        );
        playerTorso.position.y = THREE.MathUtils.lerp(
          playerTorso.position.y,
          0.0,
          0.15
        );
      }

      // Ollie / Jump Control
      if (keys["Space"]) {
        if (isOnGround) {
          // If crouching, give a major boost (crouch Ollie jump height)
          const crouchMultiplier =
            keys["ArrowDown"] || keys["KeyS"] ? 1.45 : 1.0;
          const jumpImpulse = OLLIE_IMPULSE * crouchMultiplier;

          // Apply vertical impulse
          deckBody.applyImpulse(new RAPIER.Vector2(0, jumpImpulse), true);
          playerBody.applyImpulse(
            new RAPIER.Vector2(0, jumpImpulse * 0.4),
            true
          );

          // Apply slight nose up rotation torque impulse to look authentic
          deckBody.applyTorqueImpulse(TILT_TORQUE * 0.45, true);

          cameraShake = 0.25;

          // Clear keys so holding space doesn't spam jumps
          keys["Space"] = false;
        }
      }

      // Air Rotations
      if (!isOnGround && !isGrinding) {
        if (keys["ArrowRight"] || keys["KeyD"]) {
          // Frontflip/spin clockwise
          deckBody.applyTorqueImpulse(
            -TILT_TORQUE * 5.5 * physicsTimeStep,
            true
          );
        }
        if (keys["ArrowLeft"] || keys["KeyA"]) {
          // Backflip/spin counter-clockwise
          deckBody.applyTorqueImpulse(
            TILT_TORQUE * 5.5 * physicsTimeStep,
            true
          );
        }
      }
    }

    // 2. Active Player Balancing Upright PD Controller
    if (!isCrashed && playerBody) {
      const playerAngle = playerBody.rotation();
      const playerAngularVel = playerBody.angvel();

      let targetAngle = 0; // Completely vertical relative to sky

      // Lean visual when moving
      if (keys["ArrowRight"] && isOnGround) {
        targetAngle = -0.3; // lean forward into movement
      } else if (keys["ArrowLeft"] && isOnGround) {
        targetAngle = 0.3; // lean backward
      }

      // Add terrain slope leaning component
      if (isOnGround) {
        targetAngle += slope * 0.4;
      }

      // Proportional-Derivative (PD) loop
      const diff = targetAngle - playerAngle;
      const wrappedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));

      const kp = 28.0; // torque coefficient
      const kd = 4.5; // damping
      const uprightTorque = kp * wrappedDiff - kd * playerAngularVel;

      playerBody.applyTorqueImpulse(uprightTorque * physicsTimeStep, true);
    }

    // 3. Step physics simulation
    world.step();
    accumulator -= physicsTimeStep;
  }

  // --- TRICK RECOGNITION & LANDING LOGIC ---
  const currentRotation = deckBody.rotation();
  isGrinding = checkGrinding();

  if (isGrinding && !isCrashed) {
    grindTime += dt;
    spawnSparks(
      deckBody.translation().x + (Math.random() - 0.5) * 1.2,
      deckBody.translation().y - DECK_HEIGHT / 2,
      2
    );
  }

  if (!isOnGround && !isGrinding) {
    if (!wasInAir) {
      // Just left ground
      wasInAir = true;
      airTime = 0;
      prevFrameRotation = currentRotation;
      accumulatedRotation = 0;
    }

    // Track airborne statistics
    airTime += dt;
    const diff = currentRotation - prevFrameRotation;
    const wrappedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
    accumulatedRotation += wrappedDiff;
    prevFrameRotation = currentRotation;
  } else {
    // We are on the ground or grinding
    if (wasInAir && !isCrashed) {
      wasInAir = false;

      const rotDeg = Math.abs(accumulatedRotation * (180 / Math.PI));
      let trickName = "";
      let trickPoints = 0;

      // Classify trick based on rotation & grind time
      if (rotDeg >= 980) {
        trickName = "1080 Holy Spin!";
        trickPoints = 2500;
      } else if (rotDeg >= 620) {
        trickName = "720 Mega Flip";
        trickPoints = 1200;
      } else if (rotDeg >= 280) {
        // Check spin direction
        trickName = accumulatedRotation < 0 ? "Kickflip 360" : "Heelflip 360";
        trickPoints = 500;
      } else if (rotDeg >= 130) {
        trickName = accumulatedRotation < 0 ? "Pop Shuvit" : "Ollie 180";
        trickPoints = 200;
      }

      if (grindTime > 0.15) {
        const grindName = grindTime > 1.2 ? "Mega Boardslide" : "50-50 Grind";
        const grindPoints = Math.floor(grindTime * 400);

        if (trickName) {
          trickName = `${trickName} to ${grindName}!`;
          trickPoints += grindPoints;
        } else {
          trickName = `${grindName}!`;
          trickPoints = grindPoints;
        }
      }

      // Landed trick successfully!
      if (trickPoints > 0) {
        // Check if landing angle matches terrain slope safely (within tolerance)
        const angleDiff = Math.abs(currentRotation - slope);
        const wrappedAngleDiff = Math.abs(
          Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff))
        );

        if (wrappedAngleDiff > 0.72) {
          // Landing angle was terrible! Wipeout!
          triggerCrash();
        } else {
          // Safe landing! Award score
          const pointsEarned = Math.floor(
            (trickPoints + airTime * 100) * multiplier
          );
          score += pointsEarned;
          scoreVal.innerText = score.toString();

          multVal.innerText = `x${++multiplier}`;
          multVal.classList.add("highlight");
          setTimeout(() => multVal.classList.remove("highlight"), 500);

          showTrickText(`${trickName} +${pointsEarned}`);
          cameraShake = 0.45; // nice thump shake on landing
          lastLandedTrickTime = Date.now();
        }
      } else {
        // Landed regular ollie safely
        const angleDiff = Math.abs(currentRotation - slope);
        const wrappedAngleDiff = Math.abs(
          Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff))
        );
        if (wrappedAngleDiff > 0.72) {
          triggerCrash();
        }
      }

      // Reset air/grind trackers
      accumulatedRotation = 0;
      airTime = 0;
      grindTime = 0;
    }
  }

  // Crash detection when riding (e.g. board is upside down or head hits ground)
  if (!isCrashed) {
    const deckAngle = deckBody.rotation();
    const wrappedAngle = Math.abs(
      Math.atan2(Math.sin(deckAngle), Math.cos(deckAngle))
    );

    // 1. Skateboard is upside down close to ground
    const upsideDown = wrappedAngle > 1.95 && distToGround < 0.45;

    // 2. Player head/shoulder is colliding or clipping into ground
    const playerX = playerBody.translation().x;
    const playerY = playerBody.translation().y;
    const terrainHeightAtPlayer = getTerrainHeight(playerX);
    const playerClipped =
      playerY - terrainHeightAtPlayer < PLAYER_RADIUS + 0.15;

    if (upsideDown || playerClipped) {
      triggerCrash();
    }
  }

  // Handle Crash/Wipeout duration and countdown
  if (isCrashed) {
    if (Date.now() - crashTime > RESET_TIME) {
      triggerReset();
    }
  }

  // --- TRICK TEXT TIMEOUTS / RESET MULTIPLIER ---
  // If the player goes 4 seconds without doing any trick on the ground, reset the multiplier
  if (isOnGround && multiplier > 1 && Date.now() - lastLandedTrickTime > 4000) {
    multiplier = 1;
    multVal.innerText = "x1";
  }

  // --- SYNC PHYSICS WITH VISUALS ---
  const dPos = deckBody.translation();
  const dRot = deckBody.rotation();

  deckMesh.position.set(dPos.x, dPos.y, 0);
  deckMesh.rotation.z = dRot;

  const fPos = frontWheelBody.translation();
  const fRot = frontWheelBody.rotation();
  frontWheelMesh.position.set(fPos.x, fPos.y, 0.25);
  frontWheelMesh.rotation.z = fRot;

  const bPos = backWheelBody.translation();
  const bRot = backWheelBody.rotation();
  backWheelMesh.position.set(bPos.x, bPos.y, -0.25);
  backWheelMesh.rotation.z = bRot;

  const pPos = playerBody.translation();
  const pRot = playerBody.rotation();
  playerGroup.position.set(pPos.x, pPos.y, 0);
  playerGroup.rotation.z = pRot;

  // --- PROCEDURAL TERRAIN CHUNKS GENERATION TRIGGER ---
  updateChunks(dPos.x);

  // --- ENGINE PARTICLES UPDATES ---
  updateParticles(dt);

  // --- CAMERA MANAGEMENT ---
  // Camera smooth track
  const targetCamX = dPos.x + deckVel.x * 0.15; // Lead the camera forward based on velocity
  let targetCamY = dPos.y + 1.5;

  // Clamp camera minimum Y to avoid looking below horizon
  targetCamY = Math.max(getTerrainHeight(targetCamX) + 1.0, targetCamY);

  // Speed-based dynamic Zoom out
  const targetCamZ = 13.5 + Math.abs(deckVel.x) * 0.16;

  // LERP camera
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.05);

  // Screen shake application
  if (cameraShake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake;
    cameraShake *= 0.9; // decay shake
  }

  // Camera focus offset
  camera.lookAt(
    new THREE.Vector3(camera.position.x, camera.position.y - 0.5, 0)
  );

  // --- PARALLAX SUN & HILLS UPDATE ---
  sunMesh.position.x = camera.position.x + 22.0; // move sun slow
  bgMesh.position.x = camera.position.x; // sky follows camera

  bgHills.forEach((hill, idx) => {
    // Parallax hills at Z offset
    const initialHillsOffset = (idx - hillCount / 2) * hillWidth * 0.7;
    hill.position.x = initialHillsOffset + camera.position.x * 0.82;
  });

  // Keep directional light focused near player to optimize shadows
  sunLight.position.set(dPos.x + 12, dPos.y + 18, 12);
  sunLight.target = deckMesh;

  renderer.render(scene, camera);
}

// Trigger Wipeout
function triggerCrash(): void {
  if (isCrashed) return;

  isCrashed = true;
  crashTime = Date.now();
  multiplier = 1;
  multVal.innerText = "x1";

  wipeoutBanner.classList.remove("hidden");

  // SEVER JOINT TO CREATE RAGDOLL PHYSICS tumbles
  if (playerJoint) {
    world.removeImpulseJoint(playerJoint, true);
    playerJoint = null;
  }

  // Apply massive rotational tumble to make the crash dramatic
  playerBody.applyTorqueImpulse((Math.random() - 0.5) * 12.0, true);
  playerBody.applyImpulse(
    new RAPIER.Vector2(
      deckBody.linvel().x * 0.4,
      Math.max(5.0, deckBody.linvel().y + 3.0)
    ),
    true
  );

  // Explode sparks on crash
  spawnSparks(playerBody.translation().x, playerBody.translation().y, 15);
  cameraShake = 0.9; // big screen shake
}

// Start Game Loop
tick();

// Handle browser resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
