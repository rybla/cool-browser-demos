import * as THREE from "three";
import RAPIER from "@dimforge/rapier2d-compat";

// --- State Variables ---
let world: RAPIER.World;
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;

// Viewport sizes in physics coordinates
const viewHeight = 20;
let aspect = window.innerWidth / window.innerHeight;
let viewWidth = viewHeight * aspect;

// Boundaries (Static Rigid Bodies)
let groundBody: RAPIER.RigidBody | null = null;
let ceilingBody: RAPIER.RigidBody | null = null;
let leftWallBody: RAPIER.RigidBody | null = null;
let rightWallBody: RAPIER.RigidBody | null = null;

// Character Texture Cache
const textTextureCache = new Map<string, THREE.Texture>();

// Active Letters Pile
interface PhysicalLetter {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  char: string;
  spawnTime: number;
  colorType: string;
  baseColor: THREE.Color;
}
let activeLetters: PhysicalLetter[] = [];
const MAX_LETTERS = 500;

// Delayed Spawning Queue
interface SpawnQueueItem {
  text: string;
  colorType: string;
  align: "center" | "left";
  xStart?: number;
  y: number;
}
const spawnQueue: SpawnQueueItem[] = [];
let spawnTimer = 0;
const SPAWN_INTERVAL = 0.08; // smooth cascade spacing

// Effects & Controls State
let currentGravityDir: "down" | "up" | "left" | "right" | "zero" = "down";
let windDirection: "left" | "right" | "off" = "off";
let vortexActive = false;
let cameraShakeAmount = 0;
let cameraShakeDecay = 1.0;
let activeColorTheme: "neon" | "matrix" | "cyber" | "gold" | "rainbow" = "neon";

// Background Grid Helper
let gridHelper: THREE.GridHelper;

// Floating Background Particles (Digital Dust)
let particleGeo: THREE.BufferGeometry;
let particleMat: THREE.PointsMaterial;
let backgroundParticles: THREE.Points;
const particleCount = 150;
let speeds: Float32Array;

// Spark Bursts (Particles)
interface Spark {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}
const sparks: Spark[] = [];
let sparkTexture: THREE.Texture;

// Gravity Arrow Visual Indicator
let gravityArrowMesh: THREE.Mesh | null = null;

// Wind Streaks Visual
interface WindStreak {
  mesh: THREE.Mesh;
  vx: number;
  life: number;
  maxLife: number;
}
const windStreaks: WindStreak[] = [];

// Physical Sweeper (For `clear` command)
let sweeperBody: RAPIER.RigidBody | null = null;
let sweeperMesh: THREE.Mesh | null = null;
let sweeperActive = false;
let sweeperX = 0;

// --- Text Texture Generation ---
function getCharTexture(char: string): THREE.Texture {
  if (textTextureCache.has(char)) {
    return textTextureCache.get(char)!;
  }

  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, size, size);

  // Font settings
  ctx.font = 'bold 96px "Fira Code", Consolas, "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Transparent background with glowing white text
  ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ffffff";

  ctx.fillText(char, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  textTextureCache.set(char, texture);
  return texture;
}

function pregenerateTextures() {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?@#$%^&*()_+-=[]{}|;:',.<>/\\~` ";
  for (const char of chars) {
    getCharTexture(char);
  }
}

// --- Spark Texture Generation ---
function createSparkTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.4, "rgba(255, 255, 255, 0.6)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// --- Physics Boundary Colliders Setup ---
function updateBoundaries(width: number, height: number) {
  if (groundBody) world.removeRigidBody(groundBody);
  if (ceilingBody) world.removeRigidBody(ceilingBody);
  if (leftWallBody) world.removeRigidBody(leftWallBody);
  if (rightWallBody) world.removeRigidBody(rightWallBody);

  // Ground
  const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    -height / 2 - 0.5
  );
  groundBody = world.createRigidBody(groundDesc);
  const groundCol = RAPIER.ColliderDesc.cuboid(width / 2, 0.5);
  world.createCollider(groundCol, groundBody);

  // Ceiling
  const ceilingDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    0,
    height / 2 + 0.5
  );
  ceilingBody = world.createRigidBody(ceilingDesc);
  const ceilingCol = RAPIER.ColliderDesc.cuboid(width / 2, 0.5);
  world.createCollider(ceilingCol, ceilingBody);

  // Left Wall
  const leftWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    -width / 2 - 0.5,
    0
  );
  leftWallBody = world.createRigidBody(leftWallDesc);
  const leftWallCol = RAPIER.ColliderDesc.cuboid(0.5, height / 2);
  world.createCollider(leftWallCol, leftWallBody);

  // Right Wall
  const rightWallDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    width / 2 + 0.5,
    0
  );
  rightWallBody = world.createRigidBody(rightWallDesc);
  const rightWallCol = RAPIER.ColliderDesc.cuboid(0.5, height / 2);
  world.createCollider(rightWallCol, rightWallBody);
}

function openRightWall() {
  if (rightWallBody) {
    rightWallBody.setTranslation({ x: viewWidth / 2 + 15, y: 0 }, true);
  }
}

function closeRightWall() {
  if (rightWallBody) {
    rightWallBody.setTranslation({ x: viewWidth / 2 + 0.5, y: 0 }, true);
  }
}

// --- Letter Spawner ---
function spawnLetter(
  char: string,
  x: number,
  y: number,
  colorType: string,
  options: { vx?: number; vy?: number } = {}
) {
  // If character is not cached, default to '?'
  let texture: THREE.Texture;
  if (textTextureCache.has(char)) {
    texture = textTextureCache.get(char)!;
  } else {
    texture = textTextureCache.get("?") || getCharTexture("?");
  }

  // Base colors
  const color = new THREE.Color();
  if (colorType === "prompt")
    color.setHex(0x00ffcc); // neon cyan
  else if (colorType === "input")
    color.setHex(0xffffff); // glowing white
  else if (colorType === "help")
    color.setHex(0xffaa00); // gold
  else if (colorType === "output")
    color.setHex(0x39ff14); // matrix light-green
  else if (colorType === "error")
    color.setHex(0xff007f); // neon pink
  else if (colorType === "matrix")
    color.setHex(0x00ff33); // green rain
  else if (colorType === "cyber")
    color.setHex(0xbd00ff); // violet
  else color.setHex(0x00ffcc);

  // If theme override is active (except for prompt / custom spawning themes in matrix mode)
  if (colorType !== "prompt" && colorType !== "matrix") {
    if (activeColorTheme === "matrix") color.setHex(0x00ff33);
    else if (activeColorTheme === "cyber") color.setHex(0xff00ff);
    else if (activeColorTheme === "gold") color.setHex(0xffaa00);
  }

  const width = 0.52;
  const height = 0.88;

  // ThreeJS Mesh
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    color: color.clone(),
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, 0);
  scene.add(mesh);

  // Rapier rigid body
  const rbDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y)
    .setLinearDamping(
      vortexActive ? 0.25 : currentGravityDir === "zero" ? 0.05 : 0.6
    )
    .setAngularDamping(currentGravityDir === "zero" ? 0.05 : 0.6);

  if (options.vx !== undefined || options.vy !== undefined) {
    rbDesc.setLinvel(options.vx || 0, options.vy || 0);
  }

  const body = world.createRigidBody(rbDesc);

  // Collider (slightly smaller bounds for pleasant overlaps)
  const colDesc = RAPIER.ColliderDesc.cuboid(width / 2.1, height / 2.1);
  colDesc.setRestitution(0.35); // bouncy!
  colDesc.setFriction(0.2); // realistic sliding
  world.createCollider(colDesc, body);

  const letter: PhysicalLetter = {
    body,
    mesh,
    char,
    spawnTime: Date.now(),
    colorType,
    baseColor: color,
  };

  activeLetters.push(letter);

  // Keep count under limit
  if (activeLetters.length > MAX_LETTERS) {
    const oldest = activeLetters.shift()!;
    world.removeRigidBody(oldest.body);
    scene.remove(oldest.mesh);
    oldest.mesh.geometry.dispose();
    (oldest.mesh.material as THREE.Material).dispose();
  }

  return letter;
}

// --- Spawn Strings ---
function spawnString(
  str: string,
  xStart: number,
  y: number,
  colorType: string
) {
  const spacing = 0.44;
  let cx = xStart;
  for (const char of str) {
    if (char === " ") {
      cx += spacing;
    } else {
      spawnLetter(char, cx, y, colorType);
      cx += spacing;
    }
  }
}

function spawnStringCentered(str: string, y: number, colorType: string) {
  const spacing = 0.44;
  const totalWidth = str.length * spacing;
  const xStart = -totalWidth / 2 + spacing / 2;
  spawnString(str, xStart, y, colorType);
}

// --- Spawn Particle Sparks ---
function spawnSparkBurst(
  x: number,
  y: number,
  count: number,
  colorHex: number
) {
  const geom = new THREE.PlaneGeometry(0.12, 0.12);

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: sparkTexture,
      transparent: true,
      color: colorHex,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, 0.3);
    scene.add(mesh);

    const angle = Math.random() * Math.PI * 2;
    const speed = 3.0 + Math.random() * 10.0;

    sparks.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 0.3 + Math.random() * 0.5,
    });
  }
}

// --- Spawn Wind Streaks ---
function spawnWindStreak(dir: "left" | "right") {
  if (Math.random() > 0.15) return; // limit count

  const w = 2.0 + Math.random() * 4.0;
  const h = 0.04 + Math.random() * 0.06;
  const geom = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.08 + Math.random() * 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geom, mat);
  const y = (Math.random() - 0.5) * 16;
  const x = dir === "right" ? -viewWidth / 2 - w : viewWidth / 2 + w;
  mesh.position.set(x, y, -0.8);
  scene.add(mesh);

  const vx =
    dir === "right"
      ? 20.0 + Math.random() * 12.0
      : -20.0 - Math.random() * 12.0;

  windStreaks.push({
    mesh,
    vx,
    life: 0,
    maxLife: 1.5,
  });
}

// --- Fading Gravity Indicator ---
function showGravityArrow(dir: "down" | "up" | "left" | "right" | "zero") {
  if (gravityArrowMesh) {
    scene.remove(gravityArrowMesh);
    gravityArrowMesh.geometry.dispose();
    (gravityArrowMesh.material as THREE.Material).dispose();
    gravityArrowMesh = null;
  }

  if (dir === "zero") return;

  const shape = new THREE.Shape();
  shape.moveTo(0, 1.5);
  shape.lineTo(1.2, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, -1.5);
  shape.lineTo(-0.5, -1.5);
  shape.lineTo(-0.5, 0);
  shape.lineTo(-1.2, 0);
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  gravityArrowMesh = new THREE.Mesh(geom, mat);
  gravityArrowMesh.position.set(0, 0, -2.2);

  if (dir === "down") {
    gravityArrowMesh.rotation.z = Math.PI;
  } else if (dir === "left") {
    gravityArrowMesh.rotation.z = Math.PI / 2;
  } else if (dir === "right") {
    gravityArrowMesh.rotation.z = -Math.PI / 2;
  } else if (dir === "up") {
    gravityArrowMesh.rotation.z = 0;
  }

  scene.add(gravityArrowMesh);
}

// --- Process Queued Text Spawning ---
function processSpawnQueue(dt: number) {
  if (spawnQueue.length === 0) return;
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INTERVAL) {
    const item = spawnQueue.shift()!;
    if (item.align === "center") {
      spawnStringCentered(item.text, item.y, item.colorType);
    } else {
      const x = item.xStart !== undefined ? item.xStart : -viewWidth / 2 + 1.0;
      spawnString(item.text, x, item.y, item.colorType);
    }
    spawnTimer = 0;
  }
}

// --- Command Execution Logic ---
function executeHelp() {
  const lines = [
    "--- SYSTEM UTILITIES DIRECTORY ---",
    "pop             - Explode letters with a shockwave!",
    "gravity [dir]   - Rotate gravity (down, up, left, right, zero)",
    "wind [left|right|off] - Apply force field currents",
    "vortex          - Toggle black hole swirling pull",
    "shake           - Trigger earthquake screen rumble",
    "matrix          - Rain down streaming green code lines",
    "spawn [word|count] - Spawn custom text or random blocks",
    "color [theme]   - Neon, Matrix, Cyber, Gold, Rainbow",
    "clear           - Sweep all terminal items physically",
    "----------------------------------",
  ];

  lines.forEach((line, idx) => {
    spawnQueue.push({
      text: line,
      colorType: "help",
      align: "center",
      y: 9 - idx * 0.45,
    });
  });
}

function executePop() {
  const cx = 0;
  const cy = 2;

  const word = "POP!";
  const spacing = 1.0;
  const startX = -((word.length - 1) * spacing) / 2;

  const popLetters: {
    mesh: THREE.Mesh;
    body: RAPIER.RigidBody;
    char: string;
  }[] = [];

  // Spawn pulsing letters in center
  let charIndex = 0;
  for (const char of word) {
    const x = startX + charIndex * spacing;
    const y = cy;

    const texture = getCharTexture(char);
    const geom = new THREE.PlaneGeometry(1.5, 2.5); // Large text
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      color: 0xff007f, // glowing hot pink
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, 0.4);
    scene.add(mesh);

    const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      x,
      y
    );
    const body = world.createRigidBody(rbDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.6, 1.0);
    world.createCollider(colDesc, body);

    popLetters.push({ mesh, body, char });
    charIndex++;
  }

  // Throb loop
  let elapsed = 0;
  const duration = 0.55;

  const timer = setInterval(() => {
    elapsed += 0.05;
    if (elapsed >= duration) {
      clearInterval(timer);

      // Trigger Explosion
      cameraShakeAmount = 0.7;
      cameraShakeDecay = 1.4;

      activeLetters.forEach((l) => {
        const pos = l.body.translation();
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.05) {
          const force = 75.0 / (dist + 0.3);
          l.body.applyImpulse(
            { x: (dx / dist) * force, y: (dy / dist) * force },
            true
          );
          l.body.applyTorqueImpulse((Math.random() - 0.5) * force * 0.4, true);
        }
      });

      // Sparks
      spawnSparkBurst(cx, cy, 70, 0xff007f);
      spawnSparkBurst(cx, cy, 70, 0x00ffcc);

      // Disintegrate POP!
      popLetters.forEach((p, idx) => {
        const pos = p.body.translation();
        world.removeRigidBody(p.body);
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();

        const angle = (idx - 1.5) * 0.35 + Math.PI / 2;
        const speed = 12.0 + Math.random() * 10.0;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        spawnLetter(p.char, pos.x, pos.y, "cyber", { vx, vy });
      });
    } else {
      // Scale throb
      const scale = 1.0 + Math.sin(elapsed * 25) * 0.4;
      popLetters.forEach((p) => {
        p.mesh.scale.set(scale, scale, 1);
        p.mesh.rotation.z = (Math.random() - 0.5) * 0.08;
      });
    }
  }, 50);
}

function executeGravity(arg?: string) {
  const dir = (arg || "down").toLowerCase();
  const hud = document.getElementById("status-gravity")!;

  if (dir === "up") {
    world.gravity = { x: 0, y: 15.0 };
    currentGravityDir = "up";
    hud.innerText = "GRAVITY: UP";
  } else if (dir === "left") {
    world.gravity = { x: -15.0, y: 0 };
    currentGravityDir = "left";
    hud.innerText = "GRAVITY: LEFT";
  } else if (dir === "right") {
    world.gravity = { x: 15.0, y: 0 };
    currentGravityDir = "right";
    hud.innerText = "GRAVITY: RIGHT";
  } else if (dir === "zero") {
    world.gravity = { x: 0, y: 0 };
    currentGravityDir = "zero";
    hud.innerText = "GRAVITY: ZERO";
    activeLetters.forEach((l) => {
      l.body.setLinearDamping(0.05);
      l.body.setAngularDamping(0.05);
    });
  } else {
    world.gravity = { x: 0, y: -15.0 };
    currentGravityDir = "down";
    hud.innerText = "GRAVITY: DOWN";
    activeLetters.forEach((l) => {
      l.body.setLinearDamping(0.6);
      l.body.setAngularDamping(0.6);
    });
  }

  showGravityArrow(currentGravityDir);
}

function executeWind(arg?: string) {
  const dir = (arg || "off").toLowerCase();
  const hud = document.getElementById("status-wind")!;

  if (dir === "left") {
    windDirection = "left";
    hud.innerText = "WIND: LEFT";
  } else if (dir === "right") {
    windDirection = "right";
    hud.innerText = "WIND: RIGHT";
  } else {
    windDirection = "off";
    hud.innerText = "WIND: OFF";
  }
}

function executeVortex() {
  vortexActive = !vortexActive;
  const hud = document.getElementById("status-vortex")!;
  hud.innerText = vortexActive ? "VORTEX: ON" : "VORTEX: OFF";

  if (!vortexActive && currentGravityDir !== "zero") {
    activeLetters.forEach((l) => {
      l.body.setLinearDamping(0.6);
    });
  }
}

function executeShake() {
  cameraShakeAmount = 0.55;
  cameraShakeDecay = 1.1;

  activeLetters.forEach((l) => {
    const fx = (Math.random() - 0.5) * 45.0;
    const fy = (Math.random() - 0.5) * 45.0;
    l.body.applyImpulse({ x: fx, y: fy }, true);
    l.body.applyTorqueImpulse((Math.random() - 0.5) * 12.0, true);
  });

  const bursts = Math.min(activeLetters.length, 12);
  for (let i = 0; i < bursts; i++) {
    const l = activeLetters[Math.floor(Math.random() * activeLetters.length)];
    if (l) {
      const pos = l.body.translation();
      spawnSparkBurst(pos.x, pos.y, 6, 0x00ffcc);
    }
  }
}

function spawnMatrixStream() {
  const streamCount = 14;
  const glyphs =
    "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ1234567890";

  for (let s = 0; s < streamCount; s++) {
    const x = (Math.random() - 0.5) * (viewWidth - 1.5);
    const length = 6 + Math.floor(Math.random() * 10);
    const startY = 11 + Math.random() * 6;

    for (let c = 0; c < length; c++) {
      const char = glyphs[Math.floor(Math.random() * glyphs.length)];
      if (char) {
        const y = startY + c * 0.7;
        setTimeout(() => {
          spawnLetter(char, x, y, "matrix");
        }, c * 60);
      }
    }
  }
}

function executeSpawn(arg?: string) {
  if (!arg) {
    spawnStringCentered("VISUAL CLI", 8, "cyber");
    return;
  }

  const count = parseInt(arg);
  if (!isNaN(count)) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?@#$";
    const clamped = Math.min(count, 80);
    for (let i = 0; i < clamped; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      if (char) {
        const x = (Math.random() - 0.5) * (viewWidth - 1.5);
        const y = 8 + Math.random() * 5;
        spawnLetter(char, x, y, "output");
      }
    }
  } else {
    spawnStringCentered(arg, 8, "output");
  }
}

function executeColor(arg?: string) {
  const theme = (arg || "neon").toLowerCase();
  if (["neon", "matrix", "cyber", "gold", "rainbow"].includes(theme)) {
    activeColorTheme = theme as
      | "neon"
      | "matrix"
      | "cyber"
      | "gold"
      | "rainbow";

    activeLetters.forEach((l) => {
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      const c = new THREE.Color();
      if (activeColorTheme === "neon") {
        const r = Math.random();
        if (r < 0.35) c.setHex(0x00ffcc);
        else if (r < 0.7) c.setHex(0xff007f);
        else c.setHex(0x9900ff);
      } else if (activeColorTheme === "matrix") {
        c.setHex(0x00ff33);
      } else if (activeColorTheme === "cyber") {
        c.setHex(0xff00ff);
      } else if (activeColorTheme === "gold") {
        c.setHex(0xffaa00);
      } else if (activeColorTheme === "rainbow") {
        c.setHSL(Math.random(), 1.0, 0.55);
      }
      mat.color = c;
    });
  }
}

function executeClear() {
  if (sweeperActive) return;

  sweeperActive = true;
  sweeperX = -viewWidth / 2 - 1.0;
  openRightWall();

  const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
    sweeperX,
    0
  );
  sweeperBody = world.createRigidBody(rbDesc);
  const colDesc = RAPIER.ColliderDesc.cuboid(0.4, 15.0);
  world.createCollider(colDesc, sweeperBody);

  const geom = new THREE.PlaneGeometry(0.8, 24.0);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff0033, // Glowing red hazard beam
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  sweeperMesh = new THREE.Mesh(geom, mat);
  sweeperMesh.position.set(sweeperX, 0, 0.5);
  scene.add(sweeperMesh);

  spawnSparkBurst(sweeperX, 0, 45, 0xff0033);
}

function executeCommand(line: string) {
  const parts = line.split(/\s+/);
  const cmd = parts[0] ? parts[0].toLowerCase() : "";
  const args = parts.slice(1).join(" ");

  switch (cmd) {
    case "help":
      executeHelp();
      break;
    case "pop":
    case "explode":
      executePop();
      break;
    case "gravity":
      executeGravity(args);
      break;
    case "wind":
      executeWind(args);
      break;
    case "vortex":
      executeVortex();
      break;
    case "shake":
      executeShake();
      break;
    case "matrix":
      spawnMatrixStream();
      break;
    case "spawn":
      executeSpawn(args);
      break;
    case "color":
      executeColor(args);
      break;
    case "clear":
      executeClear();
      break;
    default:
      spawnQueue.push({
        text: `Error: Unknown command "${cmd}". Type "help" for a list of commands.`,
        colorType: "error",
        align: "left",
        y: 8,
      });
  }
}

// --- Main Engine Initialization ---
async function startApp() {
  // 1. Initialize Rapier compatibility layer
  await RAPIER.init();

  // Create Physics World
  const gravityVec = { x: 0.0, y: -15.0 };
  world = new RAPIER.World(gravityVec);

  // Setup boundaries
  updateBoundaries(viewWidth, viewHeight);

  // 2. Setup ThreeJS
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050508);

  // Pre-generate textures
  pregenerateTextures();
  sparkTexture = createSparkTexture();

  // Background Grid (tilted for 3D hologram perspective)
  gridHelper = new THREE.GridHelper(36, 36, 0x00ffcc, 0x071118);
  gridHelper.position.set(0, -6, -2.5);
  gridHelper.rotation.x = Math.PI / 2.5;
  scene.add(gridHelper);

  // Atmospheric Particles
  speeds = new Float32Array(particleCount);
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 32;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = -4.0 + Math.random() * 2.0;
    speeds[i] = 0.4 + Math.random() * 1.6;
  }
  particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleMat = new THREE.PointsMaterial({
    color: 0x00ffcc,
    size: 0.12,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
  });
  backgroundParticles = new THREE.Points(particleGeo, particleMat);
  scene.add(backgroundParticles);

  // 3. UI Hooks
  const input = document.getElementById("terminal-input") as HTMLInputElement;
  input.focus();

  // Enforce terminal input focus
  document.body.addEventListener("click", () => {
    input.focus();
  });
  document.addEventListener("keydown", (_e) => {
    if (document.activeElement !== input) {
      input.focus();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const line = input.value.trim();
      input.value = "";
      if (!line) return;

      // Spawn user typed command line
      const promptText = `visitor@visual-cli:~$ ${line}`;
      const xStart = -viewWidth / 2 + 1.0;
      spawnString(promptText, xStart, -7.5, "prompt");

      // Exec command
      executeCommand(line);
    }
  });

  // Window Resize
  window.addEventListener("resize", () => {
    aspect = window.innerWidth / window.innerHeight;
    viewWidth = viewHeight * aspect;

    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    updateBoundaries(viewWidth, viewHeight);
  });

  // Camera setup
  camera = new THREE.OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    100
  );
  camera.position.set(0, 0, 10);

  // 4. Intro Text Cascade sequence
  const intro = [
    "VISUAL_CLI v1.0.0 HOST:_localhost",
    "INITIALIZING PHYSICS ENGINE RAPIER2D... OK",
    "INITIALIZING GRAPHICS INTERFACE THREEJS... OK",
    "READY. TYPE 'help' TO VIEW INTERACTIVE UTILITIES.",
  ];
  intro.forEach((line, idx) => {
    spawnQueue.push({
      text: line,
      colorType: "output",
      align: "left",
      y: 9 - idx * 0.45,
    });
  });

  // 5. Run Animation Loop
  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // Step physics
    world.step();

    // Sync letters meshes
    activeLetters.forEach((l) => {
      const pos = l.body.translation();
      const rot = l.body.rotation();
      l.mesh.position.set(pos.x, pos.y, 0);
      l.mesh.rotation.set(0, 0, rot);
    });

    // Rainbow theme animation
    if (activeColorTheme === "rainbow") {
      activeLetters.forEach((l, idx) => {
        const mat = l.mesh.material as THREE.MeshBasicMaterial;
        const hue = (now * 0.0002 + idx * 0.02) % 1.0;
        mat.color.setHSL(hue, 0.9, 0.55);
      });
    }

    // Sparks update
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      if (!s) continue;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.vy -= 12.0 * dt; // gravity

      s.life += dt;
      const opacity = Math.max(0, 1.0 - s.life / s.maxLife);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;

      if (s.life >= s.maxLife) {
        scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        mat.dispose();
        sparks.splice(i, 1);
      }
    }

    // Wind streaks update
    for (let i = windStreaks.length - 1; i >= 0; i--) {
      const w = windStreaks[i];
      if (!w) continue;
      w.mesh.position.x += w.vx * dt;
      w.life += dt;
      const mat = w.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1.0 - w.life / w.maxLife) * 0.25);

      if (w.life >= w.maxLife) {
        scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        mat.dispose();
        windStreaks.splice(i, 1);
      }
    }

    // Delayed spawning processing
    processSpawnQueue(dt);

    // Camera shake update
    if (cameraShakeAmount > 0) {
      const shakeX = (Math.random() - 0.5) * cameraShakeAmount;
      const shakeY = (Math.random() - 0.5) * cameraShakeAmount;
      camera.position.set(shakeX, shakeY, 10);
      cameraShakeAmount -= dt * cameraShakeDecay;
      if (cameraShakeAmount < 0) cameraShakeAmount = 0;
    } else {
      camera.position.set(0, 0, 10);
    }

    // Gravity indicator fade
    if (gravityArrowMesh) {
      const mat = gravityArrowMesh.material as THREE.MeshBasicMaterial;
      mat.opacity -= dt * 0.8;
      if (mat.opacity <= 0) {
        scene.remove(gravityArrowMesh);
        gravityArrowMesh.geometry.dispose();
        mat.dispose();
        gravityArrowMesh = null;
      }
    }

    // Vortex particle animation
    if (vortexActive) {
      const posAttr = particleGeo.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const dist = Math.sqrt(px * px + py * py);

        const angle = Math.atan2(py, px) + 2.4 * dt;
        let newDist = dist - 1.2 * dt;
        if (newDist < 0.2) {
          newDist = 12.0 + Math.random() * 5.0;
        }

        posAttr.setXY(i, Math.cos(angle) * newDist, Math.sin(angle) * newDist);
      }
      posAttr.needsUpdate = true;
      gridHelper.rotation.y += dt * 0.12;
    } else {
      // Atmospheric rising drift
      const posAttr = particleGeo.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        let px = posAttr.getX(i);
        let py = posAttr.getY(i);
        const speed = speeds[i];
        if (speed !== undefined) {
          py += speed * dt;
        }
        if (py > 11) {
          py = -11;
          px = (Math.random() - 0.5) * viewWidth;
        }
        posAttr.setXY(i, px, py);
      }
      posAttr.needsUpdate = true;
      gridHelper.rotation.y += dt * 0.015;
    }

    // Continuous wind force
    if (windDirection === "left") {
      activeLetters.forEach((l) => {
        l.body.addForce({ x: -14.0 * l.body.mass(), y: 0 }, true);
      });
      spawnWindStreak("left");
    } else if (windDirection === "right") {
      activeLetters.forEach((l) => {
        l.body.addForce({ x: 14.0 * l.body.mass(), y: 0 }, true);
      });
      spawnWindStreak("right");
    }

    // Vortex swirling force
    if (vortexActive) {
      activeLetters.forEach((l) => {
        const pos = l.body.translation();
        const dx = 0 - pos.x;
        const dy = 0 - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.1) {
          const pull = 22.0 / (dist + 0.3);
          const fx = (dx / dist) * pull * l.body.mass();
          const fy = (dy / dist) * pull * l.body.mass();

          const swirl = 14.0 / (dist + 0.3);
          const tx = -dy / dist;
          const ty = dx / dist;

          l.body.addForce(
            {
              x: fx + tx * swirl * l.body.mass(),
              y: fy + ty * swirl * l.body.mass(),
            },
            true
          );

          l.body.setLinearDamping(0.25);
        }
      });
    }

    // Sweeper bar motion
    if (sweeperActive && sweeperBody && sweeperMesh) {
      const sweepSpeed = 8.5;
      sweeperX += sweepSpeed * dt;

      sweeperBody.setNextKinematicTranslation({ x: sweeperX, y: 0 });
      sweeperMesh.position.x = sweeperX;

      if (Math.random() < 0.35) {
        spawnSparkBurst(sweeperX, -10 + Math.random() * 20, 3, 0xff0033);
      }

      // Swept letter cleanup
      for (let i = activeLetters.length - 1; i >= 0; i--) {
        const l = activeLetters[i];
        if (!l) continue;
        const pos = l.body.translation();
        if (pos.x > viewWidth / 2 + 0.8) {
          world.removeRigidBody(l.body);
          scene.remove(l.mesh);
          l.mesh.geometry.dispose();
          (l.mesh.material as THREE.Material).dispose();
          activeLetters.splice(i, 1);
        }
      }

      if (sweeperX > viewWidth / 2 + 2.0) {
        world.removeRigidBody(sweeperBody);
        scene.remove(sweeperMesh);
        sweeperMesh.geometry.dispose();
        (sweeperMesh.material as THREE.Material).dispose();

        sweeperBody = null;
        sweeperMesh = null;
        sweeperActive = false;

        closeRightWall();

        // Clear any residual
        activeLetters.forEach((l) => {
          world.removeRigidBody(l.body);
          scene.remove(l.mesh);
          l.mesh.geometry.dispose();
          (l.mesh.material as THREE.Material).dispose();
        });
        activeLetters = [];
      }
    }

    renderer.render(scene, camera);
  }

  animate();
}

startApp().catch(console.error);
