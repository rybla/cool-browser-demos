import * as THREE from "three";

// ============================================================================
// 1. DATA STRUCTURES & CLASSES
// ============================================================================

type ObjectType = "bar" | "wire" | "ball" | "compass";

interface BaseObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  isFrozen: boolean;
  mesh: THREE.Group | THREE.Mesh;

  // Physics accumulators
  fx: number;
  fy: number;
}

class BarMagnet implements BaseObject {
  id: string;
  readonly type = "bar";
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle: number; // in radians
  omega = 0; // angular velocity
  mass = 4.0;
  inertia: number;
  strength: number; // dipole moment
  width = 2.4;
  height = 0.7;
  isFrozen = false;
  mesh: THREE.Group;

  fx = 0;
  fy = 0;
  torque = 0;

  constructor(x: number, y: number, angle = 0, strength = 18) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.strength = strength;
    this.inertia =
      (1 / 12) *
      this.mass *
      (this.width * this.width + this.height * this.height);
    this.mesh = createMagnetMesh(this.width, this.height, this.strength);
    this.mesh.position.set(x, y, 0);
    this.mesh.rotation.z = angle;
  }
}

class CurrentWire implements BaseObject {
  id: string;
  readonly type = "wire";
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  mass = 2.0;
  radius = 0.45;
  current: number; // in Amperes
  isFrozen = false;
  mesh: THREE.Mesh;

  fx = 0;
  fy = 0;

  constructor(x: number, y: number, current = 2.0) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.x = x;
    this.y = y;
    this.current = current;
    this.mesh = createWireMesh(this.radius, this.current);
    this.mesh.position.set(x, y, 0);
  }
}

class IronBall implements BaseObject {
  id: string;
  readonly type = "ball";
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  mass = 1.0;
  radius = 0.35;
  isFrozen = false;
  mesh: THREE.Mesh;

  // Induced dipole moment
  mx = 0;
  my = 0;

  fx = 0;
  fy = 0;

  constructor(x: number, y: number) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.x = x;
    this.y = y;
    this.mesh = createBallMesh(this.radius);
    this.mesh.position.set(x, y, 0);
  }
}

class Compass implements BaseObject {
  id: string;
  readonly type = "compass";
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle: number;
  omega = 0;
  mass = 0.5;
  inertia = 0.04;
  strength = 4.0;
  radius = 0.4;
  isFrozen = true; // Fixed position
  mesh: THREE.Group;

  fx = 0;
  fy = 0;
  torque = 0;

  constructor(x: number, y: number, angle = 0) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.mesh = createCompassMesh(this.radius);
    this.mesh.position.set(x, y, 0);
    const needle = this.mesh.getObjectByName("needle");
    if (needle) needle.rotation.z = angle;
  }
}

// Float32Arrays for iron filings simulation
class IronFilingsSystem {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  angle: Float32Array;
  life: Float32Array;
  maxCount: number;
  count = 0;
  mesh: THREE.InstancedMesh;

  constructor(maxCount = 2000) {
    this.maxCount = maxCount;
    this.x = new Float32Array(maxCount);
    this.y = new Float32Array(maxCount);
    this.vx = new Float32Array(maxCount);
    this.vy = new Float32Array(maxCount);
    this.angle = new Float32Array(maxCount);
    this.life = new Float32Array(maxCount);

    // Create instanced line segments
    const geom = new THREE.BoxGeometry(0.18, 0.03, 0.01);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x889aa8,
      transparent: true,
      opacity: 0.65,
    });
    this.mesh = new THREE.InstancedMesh(geom, mat, maxCount);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  addFiling(x: number, y: number) {
    if (this.count >= this.maxCount) return;
    const idx = this.count;
    this.x[idx] = x;
    this.y[idx] = y;
    this.vx[idx] = (Math.random() - 0.5) * 0.2;
    this.vy[idx] = (Math.random() - 0.5) * 0.2;
    this.angle[idx] = Math.random() * Math.PI * 2;
    this.life[idx] = 1.0; // standard life duration
    this.count++;
    this.mesh.count = this.count;
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
  }
}

// ============================================================================
// 2. TEXTURE & MESH CREATION HELPERS
// ============================================================================

function createMagnetTexture(label: string, color: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);

  // Text label
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px 'Outfit', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 64);

  // Subtle border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 122);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createWireTexture(current: number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Outer circle body
  ctx.fillStyle = "#0c101b";
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  // Theme color based on current flow
  const color = current > 0 ? "#00e5ff" : current < 0 ? "#ff3d00" : "#8f9cae";
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.stroke();

  // Current indicator symbols: ⊙ (out of page), ⊗ (into page)
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";

  if (current > 0) {
    // Dot in center
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(64, 64, 14, 0, Math.PI * 2);
    ctx.fill();
  } else if (current < 0) {
    // Cross
    ctx.beginPath();
    ctx.moveTo(42, 42);
    ctx.lineTo(86, 86);
    ctx.moveTo(86, 42);
    ctx.lineTo(42, 86);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function createMagnetMesh(w: number, h: number, strength: number): THREE.Group {
  const group = new THREE.Group();

  // North half (Red, +x local)
  const nGeo = new THREE.BoxGeometry(w / 2, h, 0.12);
  const nMat = new THREE.MeshStandardMaterial({
    map: createMagnetTexture("N", "#ff1744"),
    roughness: 0.15,
    metalness: 0.2,
  });
  const nMesh = new THREE.Mesh(nGeo, nMat);
  nMesh.position.x = w / 4;
  group.add(nMesh);

  // South half (Blue, -x local)
  const sGeo = new THREE.BoxGeometry(w / 2, h, 0.12);
  const sMat = new THREE.MeshStandardMaterial({
    map: createMagnetTexture("S", "#2979ff"),
    roughness: 0.15,
    metalness: 0.2,
  });
  const sMesh = new THREE.Mesh(sGeo, sMat);
  sMesh.position.x = -w / 4;
  group.add(sMesh);

  group.userData = { w, h, strength };
  return group;
}

function createWireMesh(r: number, current: number): THREE.Mesh {
  const geom = new THREE.CylinderGeometry(r, r, 0.12, 32);
  geom.rotateX(Math.PI / 2); // Face camera

  const mat = new THREE.MeshStandardMaterial({
    map: createWireTexture(current),
    roughness: 0.2,
    metalness: 0.3,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData = { r, current };
  return mesh;
}

function createBallMesh(r: number): THREE.Mesh {
  const geom = new THREE.SphereGeometry(r, 32, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a99a8,
    metalness: 0.95,
    roughness: 0.1,
    envMapIntensity: 1.2,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData = { r };
  return mesh;
}

function createCompassMesh(r: number): THREE.Group {
  const group = new THREE.Group();

  // Background Dial Plate
  const baseGeom = new THREE.CylinderGeometry(r, r, 0.04, 32);
  baseGeom.rotateX(Math.PI / 2);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f18,
    roughness: 0.6,
    metalness: 0.2,
    transparent: true,
    opacity: 0.75,
  });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  group.add(baseMesh);

  // Dial border ring
  const ringGeom = new THREE.RingGeometry(r - 0.04, r, 32);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x8f9cae,
    roughness: 0.3,
    metalness: 0.8,
  });
  const ringMesh = new THREE.Mesh(ringGeom, ringMat);
  ringMesh.position.z = 0.021;
  group.add(ringMesh);

  // Rotating Needle Group
  const needleGroup = new THREE.Group();
  needleGroup.name = "needle";
  needleGroup.position.z = 0.03;

  // North Cone (Red, points +y local)
  const nCone = new THREE.ConeGeometry(0.08, r * 0.75, 4);
  nCone.rotateX(Math.PI / 2); // oriented flat
  nCone.translate(0, r * 0.375, 0);
  const nMat = new THREE.MeshStandardMaterial({
    color: 0xff1744,
    roughness: 0.2,
    metalness: 0.3,
  });
  const nMesh = new THREE.Mesh(nCone, nMat);
  needleGroup.add(nMesh);

  // South Cone (Blue, points -y local)
  const sCone = new THREE.ConeGeometry(0.08, r * 0.75, 4);
  sCone.rotateX(-Math.PI / 2);
  sCone.translate(0, -r * 0.375, 0);
  const sMat = new THREE.MeshStandardMaterial({
    color: 0x2979ff,
    roughness: 0.2,
    metalness: 0.3,
  });
  const sMesh = new THREE.Mesh(sCone, sMat);
  needleGroup.add(sMesh);

  // Center Pin Cap
  const pinGeom = new THREE.SphereGeometry(0.04, 8, 8);
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pinMesh = new THREE.Mesh(pinGeom, pinMat);
  pinMesh.position.z = 0.03;
  needleGroup.add(pinMesh);

  group.add(needleGroup);
  group.userData = { r };
  return group;
}

// ============================================================================
// 3. FIELD MATH FORMULAS (JS ENVIRONMENT)
// ============================================================================

const EPS_SQ = 0.16; // Softening parameter (r0 ~ 0.4 units)
const WIRE_CONST = 1.0; // scaling factor for wires B field
const DIPOLE_CONST = 1.0; // scaling factor for dipoles B field

// Compute B field vector at position (x, y) due to all sources
function getFieldAt(
  x: number,
  y: number,
  magnets: BarMagnet[],
  wires: CurrentWire[],
  balls: IronBall[]
): { bx: number; by: number } {
  let bx = 0;
  let by = 0;

  // 1. Permanent magnets
  for (const m of magnets) {
    const dx = x - m.x;
    const dy = y - m.y;
    const d2 = dx * dx + dy * dy;
    const D = d2 + EPS_SQ;
    const D25 = D * D * Math.sqrt(D);

    const mx = Math.cos(m.angle) * m.strength * DIPOLE_CONST;
    const my = Math.sin(m.angle) * m.strength * DIPOLE_CONST;
    const m_dot_d = mx * dx + my * dy;

    bx += (3 * m_dot_d * dx - D * mx) / D25;
    by += (3 * m_dot_d * dy - D * my) / D25;
  }

  // 2. Wires
  for (const w of wires) {
    const dx = x - w.x;
    const dy = y - w.y;
    const d2 = dx * dx + dy * dy;
    const D = d2 + EPS_SQ;

    bx += (-w.current * WIRE_CONST * dy) / D;
    by += (w.current * WIRE_CONST * dx) / D;
  }

  // 3. Magnetized Balls
  for (const b of balls) {
    const dx = x - b.x;
    const dy = y - b.y;
    const d2 = dx * dx + dy * dy;
    const D = d2 + EPS_SQ;
    const D25 = D * D * Math.sqrt(D);

    const mx = b.mx * DIPOLE_CONST;
    const my = b.my * DIPOLE_CONST;
    const m_dot_d = mx * dx + my * dy;

    bx += (3 * m_dot_d * dx - D * mx) / D25;
    by += (3 * m_dot_d * dy - D * my) / D25;
  }

  return { bx, by };
}

// Compute analytical forces/torques between dipoles (Magnets, Balls) and wires
function accumulateForces(
  magnets: BarMagnet[],
  wires: CurrentWire[],
  balls: IronBall[],
  compasses: Compass[],
  gravityEnabled: boolean
) {
  // Reset forces and torques
  const allObjects: BaseObject[] = [
    ...magnets,
    ...wires,
    ...balls,
    ...compasses,
  ];
  for (const obj of allObjects) {
    obj.fx = 0;
    obj.fy = 0;
    if ("torque" in obj) {
      (obj as BarMagnet | Compass).torque = 0;
    }
  }

  // 1. Magnet-Magnet Dipole-Dipole interactions
  for (let i = 0; i < magnets.length; i++) {
    const m1 = magnets[i]!;
    const m1x = Math.cos(m1.angle) * m1.strength * DIPOLE_CONST;
    const m1y = Math.sin(m1.angle) * m1.strength * DIPOLE_CONST;

    for (let j = i + 1; j < magnets.length; j++) {
      const m2 = magnets[j]!;
      const m2x = Math.cos(m2.angle) * m2.strength * DIPOLE_CONST;
      const m2y = Math.sin(m2.angle) * m2.strength * DIPOLE_CONST;

      addDipoleDipoleForceAndTorque(
        m1.x,
        m1.y,
        m1x,
        m1y,
        m2.x,
        m2.y,
        m2x,
        m2y,
        m1,
        m2
      );
    }
  }

  // 2. Ball-Ball Dipole-Dipole interactions (using induced moments)
  for (let i = 0; i < balls.length; i++) {
    const b1 = balls[i]!;
    const b1x = b1.mx * DIPOLE_CONST;
    const b1y = b1.my * DIPOLE_CONST;

    for (let j = i + 1; j < balls.length; j++) {
      const b2 = balls[j]!;
      const b2x = b2.mx * DIPOLE_CONST;
      const b2y = b2.my * DIPOLE_CONST;

      if (b1x * b1x + b1y * b1y > 1e-5 && b2x * b2x + b2y * b2y > 1e-5) {
        addDipoleDipoleForceAndTorque(
          b1.x,
          b1.y,
          b1x,
          b1y,
          b2.x,
          b2.y,
          b2x,
          b2y,
          b1,
          b2
        );
      }
    }
  }

  // 3. Magnet-Ball interactions
  for (const m of magnets) {
    const mx = Math.cos(m.angle) * m.strength * DIPOLE_CONST;
    const my = Math.sin(m.angle) * m.strength * DIPOLE_CONST;

    for (const b of balls) {
      const bx = b.mx * DIPOLE_CONST;
      const by = b.my * DIPOLE_CONST;

      if (bx * bx + by * by > 1e-5) {
        addDipoleDipoleForceAndTorque(m.x, m.y, mx, my, b.x, b.y, bx, by, m, b);
      }
    }
  }

  // 4. Wire-Wire interactions (Ampere's law)
  for (let i = 0; i < wires.length; i++) {
    const w1 = wires[i]!;
    for (let j = i + 1; j < wires.length; j++) {
      const w2 = wires[j]!;

      const dx = w2.x - w1.x;
      const dy = w2.y - w1.y;
      const d2 = dx * dx + dy * dy;
      const D = d2 + EPS_SQ;

      // Parallel attract, anti-parallel repel
      const f_mag = (-2.0 * w1.current * w2.current) / D;
      const fx = f_mag * dx;
      const fy = f_mag * dy;

      w2.fx += fx;
      w2.fy += fy;
      w1.fx -= fx;
      w1.fy -= fy;
    }
  }

  // 5. Wire-Magnet interactions
  for (const w of wires) {
    for (const m of magnets) {
      const mx = Math.cos(m.angle) * m.strength * DIPOLE_CONST;
      const my = Math.sin(m.angle) * m.strength * DIPOLE_CONST;

      addWireDipoleForceAndTorque(w.x, w.y, w.current, m.x, m.y, mx, my, w, m);
    }
  }

  // 6. Wire-Ball interactions
  for (const w of wires) {
    for (const b of balls) {
      const bx = b.mx * DIPOLE_CONST;
      const by = b.my * DIPOLE_CONST;
      if (bx * bx + by * by > 1e-5) {
        addWireDipoleForceAndTorque(
          w.x,
          w.y,
          w.current,
          b.x,
          b.y,
          bx,
          by,
          w,
          b
        );
      }
    }
  }

  // 7. Torque on pinned compasses due to all sources (magnets, wires, magnetized balls)
  for (const c of compasses) {
    const cx = Math.cos(c.angle) * c.strength * DIPOLE_CONST;
    const cy = Math.sin(c.angle) * c.strength * DIPOLE_CONST;

    // Find field at compass
    const field = getFieldAt(c.x, c.y, magnets, wires, balls);
    c.torque += cx * field.by - cy * field.bx;
  }

  // 8. Add Gravity to non-frozen objects
  if (gravityEnabled) {
    const gravity = 8.0;
    for (const obj of allObjects) {
      if (!obj.isFrozen) {
        obj.fy -= obj.mass * gravity;
      }
    }
  }
}

// Core helper for dipole-dipole force and torque accumulation
function addDipoleDipoleForceAndTorque(
  x1: number,
  y1: number,
  mx1: number,
  my1: number,
  x2: number,
  y2: number,
  mx2: number,
  my2: number,
  ref1: { fx: number; fy: number; torque?: number },
  ref2: { fx: number; fy: number; torque?: number }
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d2 = dx * dx + dy * dy;
  const D = d2 + EPS_SQ;
  const D25 = D * D * Math.sqrt(D);

  const m1_dot_d = mx1 * dx + my1 * dy;
  const m2_dot_d = mx2 * dx + my2 * dy;
  const m1_dot_m2 = mx1 * mx2 + my1 * my2;

  // Force on dipole 2 due to dipole 1
  const fx =
    (3 *
      (m1_dot_d * mx2 +
        m2_dot_d * mx1 +
        m1_dot_m2 * dx -
        (5 * m1_dot_d * m2_dot_d * dx) / D)) /
    D25;
  const fy =
    (3 *
      (m1_dot_d * my2 +
        m2_dot_d * my1 +
        m1_dot_m2 * dy -
        (5 * m1_dot_d * m2_dot_d * dy) / D)) /
    D25;

  ref2.fx += fx;
  ref2.fy += fy;
  ref1.fx -= fx;
  ref1.fy -= fy;

  // Torque on 2 due to field of 1
  if (ref2.torque !== undefined) {
    const Bx1 = (3 * m1_dot_d * dx - D * mx1) / D25;
    const By1 = (3 * m1_dot_d * dy - D * my1) / D25;
    ref2.torque += mx2 * By1 - my2 * Bx1;
  }

  // Torque on 1 due to field of 2
  if (ref1.torque !== undefined) {
    const rdx = -dx;
    const rdy = -dy;
    const m2_dot_rd = mx2 * rdx + my2 * rdy;
    const Bx2 = (3 * m2_dot_rd * rdx - D * mx2) / D25;
    const By2 = (3 * m2_dot_rd * rdy - D * my2) / D25;
    ref1.torque += mx1 * By2 - my1 * Bx2;
  }
}

// Core helper for wire-dipole force and torque accumulation
function addWireDipoleForceAndTorque(
  wx: number,
  wy: number,
  current: number,
  mx_pos: number,
  my_pos: number,
  mx: number,
  my: number,
  refWire: { fx: number; fy: number },
  refDipole: { fx: number; fy: number; torque?: number }
) {
  const dx = mx_pos - wx;
  const dy = my_pos - wy;
  const d2 = dx * dx + dy * dy;
  const D = d2 + EPS_SQ;
  const D2 = D * D;

  const cross = mx * dy - my * dx;

  const fx = (current * WIRE_CONST * (my * D + 2 * dx * cross)) / D2;
  const fy = (current * WIRE_CONST * (-mx * D + 2 * dy * cross)) / D2;

  refDipole.fx += fx;
  refDipole.fy += fy;
  refWire.fx -= fx;
  refWire.fy -= fy;

  if (refDipole.torque !== undefined) {
    const Bx = (-current * WIRE_CONST * dy) / D;
    const By = (current * WIRE_CONST * dx) / D;
    refDipole.torque += mx * By - my * Bx;
  }
}

// ============================================================================
// 4. MAIN APP INITIALIZATION & SHADER GLSL
// ============================================================================

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_camera_zoom;
  uniform vec2 u_camera_pos;

  struct Magnet {
    vec2 position;
    vec2 direction;
    float strength;
  };

  struct Wire {
    vec2 position;
    float current;
  };

  struct Ball {
    vec2 position;
    vec2 moment;
  };

  uniform Magnet u_magnets[16];
  uniform int u_magnet_count;
  uniform Wire u_wires[16];
  uniform int u_wire_count;
  uniform Ball u_balls[24];
  uniform int u_ball_count;

  uniform bool u_vis_field_lines;
  uniform bool u_vis_flow;
  uniform bool u_vis_heatmap;

  varying vec2 vUv;

  #define EPS_SQ 0.16
  #define PI 3.14159265

  void main() {
    // Screen aspect ratio
    float aspect = u_resolution.x / u_resolution.y;
    // Map screen coordinate space from [-10, 10] width
    vec2 worldCoord = (vUv - 0.5) * vec2(20.0 * aspect, 20.0);
    worldCoord /= u_camera_zoom;
    worldCoord += u_camera_pos;

    float Az = 0.0;
    vec2 B = vec2(0.0);

    // 1. Contribution from permanent magnets
    for (int i = 0; i < 16; i++) {
      if (i >= u_magnet_count) break;
      Magnet m = u_magnets[i];
      vec2 d = worldCoord - m.position;
      float d2 = dot(d, d);
      float D = d2 + EPS_SQ;
      float D15 = D * sqrt(D);
      float D25 = D15 * D;
      
      vec2 m_vec = m.direction * m.strength;
      
      // Vector potential Az contribution (m x r / r^3)
      Az += (m_vec.x * d.y - m_vec.y * d.x) / D15;
      
      // Field B contribution: (3 * (m.d) * d - D * m) / D25
      float m_dot_d = dot(m_vec, d);
      B += (3.0 * m_dot_d * d - D * m_vec) / D25;
    }

    // 2. Contribution from wires
    for (int i = 0; i < 16; i++) {
      if (i >= u_wire_count) break;
      Wire w = u_wires[i];
      vec2 d = worldCoord - w.position;
      float d2 = dot(d, d);
      float D = d2 + EPS_SQ;
      
      // Vector potential Az: -0.5 * I * ln(r^2)
      Az += -0.5 * w.current * log(D) * 1.5;
      
      // Field B: I * (-y, x) / r^2
      B += w.current * vec2(-d.y, d.x) / D;
    }

    // 3. Contribution from iron balls
    for (int i = 0; i < 24; i++) {
      if (i >= u_ball_count) break;
      Ball b = u_balls[i];
      vec2 d = worldCoord - b.position;
      float d2 = dot(d, d);
      float D = d2 + EPS_SQ;
      float D15 = D * sqrt(D);
      float D25 = D15 * D;
      
      Az += (b.moment.x * d.y - b.moment.y * d.x) / D15;
      
      float m_dot_d = dot(b.moment, d);
      B += (3.0 * m_dot_d * d - D * b.moment) / D25;
    }

    float B_len = length(B);
    vec3 color = vec3(0.015, 0.018, 0.025); // Base background

    // 1. Render Heatmap if enabled
    if (u_vis_heatmap) {
      float strength = log(1.0 + B_len * 1.5);
      
      // Custom neon color scheme
      vec3 purple = vec3(0.06, 0.0, 0.18); // Weak intensity
      vec3 blue = vec3(0.0, 0.15, 0.4);
      vec3 cyan = vec3(0.0, 0.65, 0.85);  // Medium intensity
      vec3 gold = vec3(1.0, 0.82, 0.2);   // Strong near poles
      vec3 white = vec3(1.0, 0.98, 0.85);
      
      vec3 heat;
      if (strength < 0.8) {
        heat = mix(color, purple, strength / 0.8);
      } else if (strength < 2.0) {
        heat = mix(purple, blue, (strength - 0.8) / 1.2);
      } else if (strength < 3.8) {
        heat = mix(blue, cyan, (strength - 2.0) / 1.8);
      } else if (strength < 6.0) {
        heat = mix(cyan, gold, (strength - 3.8) / 2.2);
      } else {
        heat = mix(gold, white, min((strength - 6.0) / 3.0, 1.0));
      }
      color = heat;
    }

    // 2. Render Glowing Field Lines if enabled
    if (u_vis_field_lines) {
      float freq = 4.2;
      float phase = 0.0;
      if (u_vis_flow) {
        // Animate field lines flow based on vector potential sign
        phase = u_time * 6.5 * sign(Az);
      }
      
      float val = sin(Az * freq - phase);
      float line = smoothstep(0.965, 0.988, abs(val));
      
      // Field lines shift colors from cyan/blue to gold in strong fields
      vec3 glowColor = mix(vec3(0.0, 0.82, 1.0), vec3(1.0, 0.72, 0.0), min(B_len * 0.1, 1.0));
      color = mix(color, glowColor, line * 0.45);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Start application setup on page load
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;

  // THREE setup
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();

  // Camera unit size coordinate setup: viewport width is 20 units
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -10 * aspect,
    10 * aspect,
    10,
    -10,
    0.1,
    100
  );
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  // Lights for 3D elements
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(-6, 10, 12);
  scene.add(dirLight);

  // Background Shader Plane
  const shaderGeom = new THREE.PlaneGeometry(100, 100);

  // Setup shader structures uniforms
  const shaderUniforms = {
    u_resolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    u_time: { value: 0.0 },
    u_camera_zoom: { value: 1.0 },
    u_camera_pos: { value: new THREE.Vector2(0, 0) },

    // Magnets
    u_magnets: {
      value: Array.from({ length: 16 }, () => ({
        position: new THREE.Vector2(),
        direction: new THREE.Vector2(),
        strength: 0.0,
      })),
    },
    u_magnet_count: { value: 0 },

    // Wires
    u_wires: {
      value: Array.from({ length: 16 }, () => ({
        position: new THREE.Vector2(),
        current: 0.0,
      })),
    },
    u_wire_count: { value: 0 },

    // Balls
    u_balls: {
      value: Array.from({ length: 24 }, () => ({
        position: new THREE.Vector2(),
        moment: new THREE.Vector2(),
      })),
    },
    u_ball_count: { value: 0 },

    u_vis_field_lines: { value: true },
    u_vis_flow: { value: true },
    u_vis_heatmap: { value: true },
  };

  const shaderMat = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: shaderUniforms,
    depthWrite: false,
  });

  const shaderMesh = new THREE.Mesh(shaderGeom, shaderMat);
  shaderMesh.position.z = -2;
  scene.add(shaderMesh);

  // Selection Ring indicators
  const selectRingCircle = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthWrite: false })
  );
  selectRingCircle.visible = false;
  selectRingCircle.position.z = 0.05;
  scene.add(selectRingCircle);

  // Box-shaped selection ring for magnets
  const boxEdges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(2.5, 0.8, 0.01)
  );
  const selectRingBox = new THREE.LineSegments(
    boxEdges,
    new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2 })
  );
  selectRingBox.visible = false;
  selectRingBox.position.z = 0.05;
  scene.add(selectRingBox);

  // Forces visualizers (Group to hold force lines & arrows)
  const forcesGroup = new THREE.Group();
  forcesGroup.position.z = 0.1;
  scene.add(forcesGroup);

  // ============================================================================
  // 5. SIMULATION ARRAYS AND STATE
  // ============================================================================
  let magnets: BarMagnet[] = [];
  let wires: CurrentWire[] = [];
  let balls: IronBall[] = [];
  let compasses: Compass[] = [];
  const filings = new IronFilingsSystem(2000);
  scene.add(filings.mesh);

  // Instanced Compass Grid overlay setup
  const compassGridCols = 22;
  const compassGridRows = 14;
  const compassGridSize = compassGridCols * compassGridRows;

  const gridConeGeo = new THREE.ConeGeometry(0.04, 0.35, 4);
  gridConeGeo.rotateX(Math.PI / 2); // align flat

  // North pointers (Red)
  const gridNorthMesh = new THREE.InstancedMesh(
    gridConeGeo,
    new THREE.MeshBasicMaterial({ color: 0xff1744 }),
    compassGridSize
  );
  gridNorthMesh.position.z = -0.5;
  gridNorthMesh.visible = false;
  scene.add(gridNorthMesh);

  // South pointers (Blue)
  const gridSouthMesh = new THREE.InstancedMesh(
    gridConeGeo,
    new THREE.MeshBasicMaterial({ color: 0x2979ff }),
    compassGridSize
  );
  gridSouthMesh.position.z = -0.5;
  gridSouthMesh.visible = false;
  scene.add(gridSouthMesh);

  // Populate grid coordinates
  const compassGridPositions: THREE.Vector2[] = [];
  for (let c = 0; c < compassGridCols; c++) {
    for (let r = 0; r < compassGridRows; r++) {
      const gx = (c / (compassGridCols - 1) - 0.5) * 26; // spans width
      const gy = (r / (compassGridRows - 1) - 0.5) * 16; // spans height
      compassGridPositions.push(new THREE.Vector2(gx, gy));
    }
  }

  // App running states
  let isPlaying = true;
  let gravityEnabled = false;
  let showForces = true;
  let damping = 0.015;
  let selectedObject: BaseObject | null = null;
  let activeTool: ObjectType | "filings" | null = null;

  // Interaction dragging states
  let isDragging = false;
  const dragOffset = new THREE.Vector2();
  let rightClickStartAngle = 0;
  let rightClickStartObjAngle = 0;

  // ============================================================================
  // 6. SCENE LOADER & PRESETS
  // ============================================================================
  function clearScene() {
    selectedObject = null;
    updateInspectorUI();
    hideSelectionRings();

    for (const m of magnets) scene.remove(m.mesh);
    for (const w of wires) scene.remove(w.mesh);
    for (const b of balls) scene.remove(b.mesh);
    for (const c of compasses) scene.remove(c.mesh);

    magnets = [];
    wires = [];
    balls = [];
    compasses = [];
    filings.clear();
  }

  function loadPreset(presetName: string) {
    clearScene();

    if (presetName === "attract-repel") {
      // Two magnets showing magnetic attraction
      const m1 = new BarMagnet(-4.0, 1.5, 0, 20);
      const m2 = new BarMagnet(4.0, 1.5, 0, 20); // Aligned N-S for attraction
      magnets.push(m1, m2);
      scene.add(m1.mesh, m2.mesh);

      // Two magnets showing magnetic repulsion
      const m3 = new BarMagnet(-4.0, -1.5, 0, 20);
      const m4 = new BarMagnet(4.0, -1.5, Math.PI, 20); // Opposite facing for repulsion
      magnets.push(m3, m4);
      scene.add(m3.mesh, m4.mesh);

      // Label magnets
      m1.isFrozen = true;
      m3.isFrozen = true;

      // Sprinkle a few iron balls between them
      const b1 = new IronBall(0.0, 1.5);
      const b2 = new IronBall(0.0, -1.5);
      balls.push(b1, b2);
      scene.add(b1.mesh, b2.mesh);
    } else if (presetName === "wire-field") {
      // Wire carrying high current in middle and free magnet around it
      const w = new CurrentWire(0, 0, 6.0);
      w.isFrozen = true;
      wires.push(w);
      scene.add(w.mesh);

      const m = new BarMagnet(-4.0, 0, Math.PI / 2, 18);
      magnets.push(m);
      scene.add(m.mesh);

      // Compass indicators to show the circular field
      for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
        const cx = Math.cos(theta) * 2.5;
        const cy = Math.sin(theta) * 2.5;
        const c = new Compass(cx, cy, theta + Math.PI / 2);
        compasses.push(c);
        scene.add(c.mesh);
      }
    } else if (presetName === "magnetic-chain") {
      // Anchored strong magnet, and many free iron balls to form chain links
      const m = new BarMagnet(-6.0, 0, 0, 30);
      m.isFrozen = true;
      magnets.push(m);
      scene.add(m.mesh);

      const m2 = new BarMagnet(6.0, 0, Math.PI, 30);
      m2.isFrozen = true;
      magnets.push(m2);
      scene.add(m2.mesh);

      // Spawn many soft-iron balls in between
      for (let i = 0; i < 15; i++) {
        const bx = -4.0 + i * 0.6 + (Math.random() - 0.5) * 0.1;
        const by = (Math.random() - 0.5) * 0.1;
        const ball = new IronBall(bx, by);
        balls.push(ball);
        scene.add(ball.mesh);
      }
    } else if (presetName === "solenoid") {
      // Parallel array of alternating wires forming a solenoid coil field
      for (let i = 0; i < 7; i++) {
        const wx = -4.5 + i * 1.5;
        // Wires at top carrying current OUT
        const wTop = new CurrentWire(wx, 2.0, 3.5);
        wTop.isFrozen = true;
        wires.push(wTop);
        scene.add(wTop.mesh);

        // Wires at bottom carrying current IN
        const wBot = new CurrentWire(wx, -2.0, -3.5);
        wBot.isFrozen = true;
        wires.push(wBot);
        scene.add(wBot.mesh);
      }

      // Add a central compass to witness uniform field inside solenoid
      const c = new Compass(0, 0, 0);
      compasses.push(c);
      scene.add(c.mesh);
    } else if (presetName === "iron-filings-demo") {
      // Showcase magnet attracting and organizing filings
      const m = new BarMagnet(0, 0, Math.PI / 6, 25);
      magnets.push(m);
      scene.add(m.mesh);

      // Seed iron filings around the scene
      for (let i = 0; i < 800; i++) {
        const r = 1.0 + Math.random() * 8.0;
        const theta = Math.random() * Math.PI * 2;
        filings.addFiling(Math.cos(theta) * r, Math.sin(theta) * r);
      }
    } else if (presetName === "chaos-sandbox") {
      // Fun chaotic sandbox setup
      const m1 = new BarMagnet(-3.0, 1.5, 0.4, 20);
      const m2 = new BarMagnet(3.0, -1.5, -0.8, 20);
      magnets.push(m1, m2);
      scene.add(m1.mesh, m2.mesh);

      const w = new CurrentWire(0, 2.5, -4.0);
      wires.push(w);
      scene.add(w.mesh);

      const c1 = new Compass(-5, -2, 0);
      const c2 = new Compass(5, 2, 0);
      compasses.push(c1, c2);
      scene.add(c1.mesh, c2.mesh);

      for (let i = 0; i < 8; i++) {
        const ball = new IronBall(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 2
        );
        balls.push(ball);
        scene.add(ball.mesh);
      }
    }
  }

  // ============================================================================
  // 7. INPUT HANDLERS & RAYCAST DETECTOR
  // ============================================================================

  function getMouseWorldCoords(e: MouseEvent): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const worldX =
      (mouseX * (camera.right - camera.left)) / 2 + camera.position.x;
    const worldY =
      (mouseY * (camera.top - camera.bottom)) / 2 + camera.position.y;
    return new THREE.Vector2(worldX, worldY);
  }

  function getClickedObject(worldPos: THREE.Vector2): BaseObject | null {
    // 1. Check wires
    for (const w of wires) {
      const dist = worldPos.distanceTo(new THREE.Vector2(w.x, w.y));
      if (dist < w.radius + 0.15) return w;
    }

    // 2. Check balls
    for (const b of balls) {
      const dist = worldPos.distanceTo(new THREE.Vector2(b.x, b.y));
      if (dist < b.radius + 0.15) return b;
    }

    // 3. Check compasses
    for (const c of compasses) {
      const dist = worldPos.distanceTo(new THREE.Vector2(c.x, c.y));
      if (dist < c.radius + 0.15) return c;
    }

    // 4. Check magnets (box containment)
    for (const m of magnets) {
      const dx = worldPos.x - m.x;
      const dy = worldPos.y - m.y;
      // Rotate local coordinates
      const cos = Math.cos(-m.angle);
      const sin = Math.sin(-m.angle);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (
        Math.abs(lx) < m.width / 2 + 0.1 &&
        Math.abs(ly) < m.height / 2 + 0.1
      ) {
        return m;
      }
    }

    return null;
  }

  function updateInspectorUI() {
    const emptyUI = document.getElementById("inspector-empty")!;
    const contentUI = document.getElementById("inspector-content")!;
    const inspectType = document.getElementById("inspect-type")!;
    const grpStrength = document.getElementById("group-strength")!;
    const grpCurrent = document.getElementById("group-current")!;
    const inspectFrozen = document.getElementById(
      "inspect-frozen"
    ) as HTMLInputElement;

    if (!selectedObject) {
      emptyUI.classList.remove("hidden");
      contentUI.classList.add("hidden");
      return;
    }

    emptyUI.classList.add("hidden");
    contentUI.classList.remove("hidden");

    inspectFrozen.checked = selectedObject.isFrozen;

    if (selectedObject.type === "bar") {
      const m = selectedObject as BarMagnet;
      inspectType.innerText = "Bar Magnet";
      grpStrength.classList.remove("hidden");
      grpCurrent.classList.add("hidden");

      const slider = document.getElementById(
        "inspect-strength-slider"
      ) as HTMLInputElement;
      slider.value = m.strength.toString();
      document.getElementById("inspect-strength-val")!.innerText =
        m.strength.toFixed(0);
    } else if (selectedObject.type === "wire") {
      const w = selectedObject as CurrentWire;
      inspectType.innerText = "Current Wire";
      grpStrength.classList.add("hidden");
      grpCurrent.classList.remove("hidden");

      const slider = document.getElementById(
        "inspect-current-slider"
      ) as HTMLInputElement;
      slider.value = w.current.toString();
      document.getElementById("inspect-current-val")!.innerText =
        w.current.toFixed(1) + " A";
    } else if (selectedObject.type === "ball") {
      inspectType.innerText = "Soft Iron Ball";
      grpStrength.classList.add("hidden");
      grpCurrent.classList.add("hidden");
    } else if (selectedObject.type === "compass") {
      inspectType.innerText = "Compass Stand";
      grpStrength.classList.add("hidden");
      grpCurrent.classList.add("hidden");
    }
  }

  function showSelectionRings() {
    if (!selectedObject) {
      hideSelectionRings();
      return;
    }

    if (selectedObject.type === "bar") {
      const m = selectedObject as BarMagnet;
      selectRingBox.visible = true;
      selectRingCircle.visible = false;
      selectRingBox.position.set(m.x, m.y, 0.05);
      selectRingBox.rotation.z = m.angle;
    } else {
      let r = 0.45;
      if (selectedObject.type === "wire")
        r = (selectedObject as CurrentWire).radius;
      if (selectedObject.type === "ball")
        r = (selectedObject as IronBall).radius;
      if (selectedObject.type === "compass")
        r = (selectedObject as Compass).radius;

      selectRingCircle.visible = true;
      selectRingBox.visible = false;
      selectRingCircle.position.set(selectedObject.x, selectedObject.y, 0.05);
      selectRingCircle.scale.setScalar(r * 2.3);
    }
  }

  function hideSelectionRings() {
    selectRingCircle.visible = false;
    selectRingBox.visible = false;
  }

  function deleteSelectedObject() {
    if (!selectedObject) return;

    // Remove from array and scene
    if (selectedObject.type === "bar") {
      magnets = magnets.filter((o) => o.id !== selectedObject!.id);
    } else if (selectedObject.type === "wire") {
      wires = wires.filter((o) => o.id !== selectedObject!.id);
    } else if (selectedObject.type === "ball") {
      balls = balls.filter((o) => o.id !== selectedObject!.id);
    } else if (selectedObject.type === "compass") {
      compasses = compasses.filter((o) => o.id !== selectedObject!.id);
    }

    scene.remove(selectedObject.mesh);
    selectedObject = null;
    updateInspectorUI();
    hideSelectionRings();
  }

  // Mouse click down
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const mousePos = getMouseWorldCoords(e);

    // Check if we click on an existing object
    const hitObj = getClickedObject(mousePos);

    if (hitObj) {
      selectedObject = hitObj;
      updateInspectorUI();
      showSelectionRings();

      if (e.button === 0) {
        // Left click drag
        isDragging = true;
        dragOffset.set(hitObj.x - mousePos.x, hitObj.y - mousePos.y);
      } else if (e.button === 2) {
        // Right click rotate
        if (
          selectedObject.type === "bar" ||
          selectedObject.type === "compass"
        ) {
          const dy = mousePos.y - selectedObject.y;
          const dx = mousePos.x - selectedObject.x;
          rightClickStartAngle = Math.atan2(dy, dx);
          rightClickStartObjAngle =
            selectedObject.type === "bar"
              ? (selectedObject as BarMagnet).angle
              : (selectedObject as Compass).angle;
          isDragging = true;
        }
      }
    } else {
      // Clicked on empty space: try to add object with activeTool
      if (activeTool && activeTool !== "filings") {
        let newObj: BaseObject;
        if (activeTool === "bar") {
          newObj = new BarMagnet(mousePos.x, mousePos.y, 0, 18);
          magnets.push(newObj as BarMagnet);
        } else if (activeTool === "wire") {
          newObj = new CurrentWire(mousePos.x, mousePos.y, 2.0);
          wires.push(newObj as CurrentWire);
        } else if (activeTool === "ball") {
          newObj = new IronBall(mousePos.x, mousePos.y);
          balls.push(newObj as IronBall);
        } else {
          newObj = new Compass(mousePos.x, mousePos.y, 0);
          compasses.push(newObj as Compass);
        }

        scene.add(newObj.mesh);
        selectedObject = newObj;
        updateInspectorUI();
        showSelectionRings();

        // Deactivate toolbox active select state
        document
          .querySelectorAll(".tool-btn")
          .forEach((btn) => btn.classList.remove("active"));
        activeTool = null;
      } else if (activeTool === "filings") {
        // Sprinkle a box of filings
        for (let i = 0; i < 40; i++) {
          const rx = mousePos.x + (Math.random() - 0.5) * 1.5;
          const ry = mousePos.y + (Math.random() - 0.5) * 1.5;
          filings.addFiling(rx, ry);
        }
      } else {
        // Deselect
        selectedObject = null;
        updateInspectorUI();
        hideSelectionRings();
      }
    }
  });

  // Mouse move
  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging || !selectedObject) return;

    const mousePos = getMouseWorldCoords(e);

    if (e.buttons === 1) {
      // Left dragging - update position
      selectedObject.x = mousePos.x + dragOffset.x;
      selectedObject.y = mousePos.y + dragOffset.y;
      selectedObject.vx = 0;
      selectedObject.vy = 0;

      // Update mesh position immediately
      selectedObject.mesh.position.set(selectedObject.x, selectedObject.y, 0);
      showSelectionRings();
    } else if (e.buttons === 2) {
      // Right dragging - rotate
      if (selectedObject.type === "bar" || selectedObject.type === "compass") {
        const dy = mousePos.y - selectedObject.y;
        const dx = mousePos.x - selectedObject.x;
        const currentAngle = Math.atan2(dy, dx);
        const delta = currentAngle - rightClickStartAngle;

        if (selectedObject.type === "bar") {
          const m = selectedObject as BarMagnet;
          m.angle = rightClickStartObjAngle + delta;
          m.omega = 0;
          m.mesh.rotation.z = m.angle;
        } else {
          const c = selectedObject as Compass;
          c.angle = rightClickStartObjAngle + delta;
          c.omega = 0;
          const needle = c.mesh.getObjectByName("needle");
          if (needle) needle.rotation.z = c.angle;
        }
        showSelectionRings();
      }
    }
  });

  // Mouse up
  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // Mouse wheel rotation
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!selectedObject) return;

      if (selectedObject.type === "bar" || selectedObject.type === "compass") {
        e.preventDefault();
        // Rotate by 5 degrees per scroll tick
        const rotDelta = (e.deltaY > 0 ? -1 : 1) * ((5 * Math.PI) / 180);

        if (selectedObject.type === "bar") {
          const m = selectedObject as BarMagnet;
          m.angle += rotDelta;
          m.omega = 0;
          m.mesh.rotation.z = m.angle;
        } else {
          const c = selectedObject as Compass;
          c.angle += rotDelta;
          c.omega = 0;
          const needle = c.mesh.getObjectByName("needle");
          if (needle) needle.rotation.z = c.angle;
        }
        showSelectionRings();
      }
    },
    { passive: false }
  );

  // Double click freeze/unfreeze
  canvas.addEventListener("dblclick", (e) => {
    const mousePos = getMouseWorldCoords(e);
    const hitObj = getClickedObject(mousePos);
    if (hitObj) {
      hitObj.isFrozen = !hitObj.isFrozen;
      selectedObject = hitObj;
      updateInspectorUI();
    }
  });

  // Prevent browser context menu
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard actions
  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelectedObject();
    } else if (e.key === " ") {
      // Toggle play pause
      e.preventDefault();
      const playBtn = document.getElementById("btn-play-pause")!;
      playBtn.click();
    } else if (e.key.toLowerCase() === "s") {
      // Step simulation
      const stepBtn = document.getElementById("btn-step")!;
      stepBtn.click();
    } else if (e.key.toLowerCase() === "r") {
      // Reset preset
      const resetBtn = document.getElementById("btn-reset")!;
      resetBtn.click();
    }
  });

  // ============================================================================
  // 8. COLLISION SOLVERS (2D CONSTRAINTS)
  // ============================================================================

  function resolveCollisions() {
    const aspect = window.innerWidth / window.innerHeight;
    const halfWidth = 10.0 * aspect;
    const halfHeight = 10.0;
    const restitution = 0.45;

    // 1. Boundary constraints for all objects
    for (const obj of [...magnets, ...wires, ...balls, ...compasses]) {
      let r = 0.4;
      let w = 0.0;
      let h = 0.0;
      if (obj.type === "wire") r = obj.radius;
      if (obj.type === "ball") r = obj.radius;
      if (obj.type === "compass") r = obj.radius;
      if (obj.type === "bar") {
        w = obj.width;
        h = obj.height;
        r = Math.max(w, h) / 2; // conservative bound
      }

      if (obj.type === "bar") {
        // Constrain center
        const cxLimit = halfWidth - w / 2;
        const cyLimit = halfHeight - h / 2;
        if (obj.x < -cxLimit) {
          obj.x = -cxLimit;
          obj.vx = -obj.vx * restitution;
        }
        if (obj.x > cxLimit) {
          obj.x = cxLimit;
          obj.vx = -obj.vx * restitution;
        }
        if (obj.y < -cyLimit) {
          obj.y = -cyLimit;
          obj.vy = -obj.vy * restitution;
        }
        if (obj.y > cyLimit) {
          obj.y = cyLimit;
          obj.vy = -obj.vy * restitution;
        }
      } else {
        if (obj.x < -halfWidth + r) {
          obj.x = -halfWidth + r;
          obj.vx = -obj.vx * restitution;
        }
        if (obj.x > halfWidth - r) {
          obj.x = halfWidth - r;
          obj.vx = -obj.vx * restitution;
        }
        if (obj.y < -halfHeight + r) {
          obj.y = -halfHeight + r;
          obj.vy = -obj.vy * restitution;
        }
        if (obj.y > halfHeight - r) {
          obj.y = halfHeight - r;
          obj.vy = -obj.vy * restitution;
        }
      }
    }

    // 2. Circle-Circle collisions (Balls & Wires)
    const circles: (CurrentWire | IronBall)[] = [...wires, ...balls];
    for (let i = 0; i < circles.length; i++) {
      const c1 = circles[i]!;
      const r1 = c1.radius;

      for (let j = i + 1; j < circles.length; j++) {
        const c2 = circles[j]!;
        const r2 = c2.radius;

        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = r1 + r2;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dist > 1e-4 ? dx / dist : 1.0;
          const ny = dist > 1e-4 ? dy / dist : 0.0;

          // Push apart
          if (!c1.isFrozen && !c2.isFrozen) {
            c1.x -= nx * overlap * 0.5;
            c1.y -= ny * overlap * 0.5;
            c2.x += nx * overlap * 0.5;
            c2.y += ny * overlap * 0.5;
          } else if (!c1.isFrozen) {
            c1.x -= nx * overlap;
            c1.y -= ny * overlap;
          } else if (!c2.isFrozen) {
            c2.x += nx * overlap;
            c2.y += ny * overlap;
          }

          // Elastic collision velocities swap
          const kx = c1.vx - c2.vx;
          const ky = c1.vy - c2.vy;
          const vn = kx * nx + ky * ny;

          if (vn > 0) {
            // relative velocity along normal is positive, they are moving closer
            const totalMass = c1.mass + c2.mass;
            const impulse = ((1.0 + restitution) * vn) / totalMass;

            if (!c1.isFrozen) {
              c1.vx -= impulse * c2.mass * nx;
              c1.vy -= impulse * c2.mass * ny;
            }
            if (!c2.isFrozen) {
              c2.vx += impulse * c1.mass * nx;
              c2.vy += impulse * c1.mass * ny;
            }
          }
        }
      }
    }

    // 3. Circle-Magnet (Rect) collisions
    // Simple representation: treat bar magnet box as OBB, test circle intersection
    for (const m of magnets) {
      const cos = Math.cos(m.angle);
      const sin = Math.sin(m.angle);
      const wHalf = m.width / 2;
      const hHalf = m.height / 2;

      for (const c of circles) {
        const r = c.radius;

        // Transform circle world position to magnet's local coordinate frame
        const dx = c.x - m.x;
        const dy = c.y - m.y;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;

        // Find closest point on local rectangle boundaries
        const cx = Math.max(-wHalf, Math.min(wHalf, lx));
        const cy = Math.max(-hHalf, Math.min(hHalf, ly));

        const distLocalX = lx - cx;
        const distLocalY = ly - cy;
        const distLocal = Math.sqrt(
          distLocalX * distLocalX + distLocalY * distLocalY
        );

        if (distLocal < r) {
          const overlap = r - distLocal;

          // Get local normal pointing from closest point to circle center
          let lnx = distLocal > 1e-4 ? distLocalX / distLocal : 0.0;
          let lny = distLocal > 1e-4 ? distLocalY / distLocal : 1.0;

          if (distLocal < 1e-4) {
            // inside box center, choose outward normal based on coordinates
            if (Math.abs(lx) / wHalf > Math.abs(ly) / hHalf) {
              lnx = lx > 0 ? 1.0 : -1.0;
              lny = 0.0;
            } else {
              lnx = 0.0;
              lny = ly > 0 ? 1.0 : -1.0;
            }
          }

          // Transform normal back to world coordinates
          const nx = lnx * cos - lny * sin;
          const ny = lnx * sin + lny * cos;

          // Push apart
          if (!c.isFrozen && !m.isFrozen) {
            c.x += nx * overlap * 0.7;
            c.y += ny * overlap * 0.7;
            m.x -= nx * overlap * 0.3;
            m.y -= ny * overlap * 0.3;
          } else if (!c.isFrozen) {
            c.x += nx * overlap;
            c.y += ny * overlap;
          } else if (!m.isFrozen) {
            m.x -= nx * overlap;
            m.y -= ny * overlap;
          }

          // Bounce velocity change
          // Relative velocity along collision normal
          const rvx = c.vx - m.vx;
          const rvy = c.vy - m.vy;
          const vn = rvx * nx + rvy * ny;

          if (vn < 0) {
            // moving towards box
            const totalMass = c.mass + m.mass;
            const impulse = ((1.0 + restitution) * vn) / totalMass;

            if (!c.isFrozen) {
              c.vx -= impulse * m.mass * nx;
              c.vy -= impulse * m.mass * ny;
            }
            if (!m.isFrozen) {
              m.vx += impulse * c.mass * nx;
              m.vy += impulse * c.mass * ny;

              // Also add angular impulse due to off-center contact torque!
              // Contact point in world relative to magnet center:
              const rx_c = cx * cos - cy * sin;
              const ry_c = cx * sin + cy * cos;
              // torque impulse = r x F_impulse
              const t_impulse =
                rx_c * (impulse * c.mass * ny) - ry_c * (impulse * c.mass * nx);
              m.omega += t_impulse / m.inertia;
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // 9. ANIMATION / SIMULATION TICK
  // ============================================================================

  const DT = 0.01;
  const SUBSTEPS = 6;

  function runPhysicsStep() {
    const subDt = DT / SUBSTEPS;

    for (let step = 0; step < SUBSTEPS; step++) {
      // 1. Calculate induced magnetization moments for soft iron balls
      for (const b of balls) {
        const field = getFieldAt(
          b.x,
          b.y,
          magnets,
          wires,
          balls.filter((ob) => ob.id !== b.id)
        );

        const chi = 0.9;
        const saturation = 14.0;
        const B_len = Math.sqrt(field.bx * field.bx + field.by * field.by);

        if (B_len > 1e-4) {
          const m_len = Math.min(B_len * chi, saturation);
          b.mx = (field.bx / B_len) * m_len;
          b.my = (field.by / B_len) * m_len;
        } else {
          b.mx = 0;
          b.my = 0;
        }
      }

      // 2. Accumulate forces
      accumulateForces(magnets, wires, balls, compasses, gravityEnabled);

      // 3. Integrate position & velocity for magnets
      for (const m of magnets) {
        if (m.isFrozen || (isDragging && selectedObject === m)) continue;

        // Acceleration
        const ax = m.fx / m.mass;
        const ay = m.fy / m.mass;
        m.vx += ax * subDt;
        m.vy += ay * subDt;
        m.x += m.vx * subDt;
        m.y += m.vy * subDt;

        // Angular acceleration
        const alpha = m.torque / m.inertia;
        m.omega += alpha * subDt;
        m.angle += m.omega * subDt;

        // Apply damping
        m.vx *= 1.0 - damping;
        m.vy *= 1.0 - damping;
        m.omega *= 1.0 - damping * 1.5;
      }

      // 4. Wires integration
      for (const w of wires) {
        if (w.isFrozen || (isDragging && selectedObject === w)) continue;
        const ax = w.fx / w.mass;
        const ay = w.fy / w.mass;
        w.vx += ax * subDt;
        w.vy += ay * subDt;
        w.x += w.vx * subDt;
        w.y += w.vy * subDt;

        w.vx *= 1.0 - damping;
        w.vy *= 1.0 - damping;
      }

      // 5. Balls integration
      for (const b of balls) {
        if (b.isFrozen || (isDragging && selectedObject === b)) continue;
        const ax = b.fx / b.mass;
        const ay = b.fy / b.mass;
        b.vx += ax * subDt;
        b.vy += ay * subDt;
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;

        b.vx *= 1.0 - damping;
        b.vy *= 1.0 - damping;
      }

      // 6. Compass integration (pinned position, only rotate)
      for (const c of compasses) {
        if (isDragging && selectedObject === c) continue;
        const alpha = c.torque / c.inertia;
        c.omega += alpha * subDt;
        c.angle += c.omega * subDt;
        // Strong angular friction on compasses to mimic needle damping
        c.omega *= 1.0 - 0.08;
      }

      // 7. Resolve collision constraints
      resolveCollisions();
    }

    // 8. Move and Align Iron Filings (particles)
    if (filings.count > 0) {
      for (let i = 0; i < filings.count; i++) {
        let px = filings.x[i];
        let py = filings.y[i];
        let vx = filings.vx[i];
        let vy = filings.vy[i];

        if (
          px === undefined ||
          py === undefined ||
          vx === undefined ||
          vy === undefined
        )
          continue;

        // Find field
        const f = getFieldAt(px, py, magnets, wires, balls);
        const bLen = Math.sqrt(f.bx * f.bx + f.by * f.by);

        if (bLen > 1e-4) {
          // Align angle with field line
          const targetAngle = Math.atan2(f.by, f.bx);
          filings.angle[i] = targetAngle;

          // Pull filings towards closest magnetic pole
          let attractFx = 0;
          let attractFy = 0;

          for (const m of magnets) {
            const cos = Math.cos(m.angle);
            const sin = Math.sin(m.angle);

            // Pole positions
            const npx = m.x + cos * (m.width / 2);
            const npy = m.y + sin * (m.width / 2);
            const spx = m.x - cos * (m.width / 2);
            const spy = m.y - sin * (m.width / 2);

            const dnx = npx - px;
            const dny = npy - py;
            const dn_dist = Math.sqrt(dnx * dnx + dny * dny);

            const dsx = spx - px;
            const dsy = spy - py;
            const ds_dist = Math.sqrt(dsx * dsx + dsy * dsy);

            // Pole attraction force scaling
            if (dn_dist < 10.0) {
              const pull = 0.1 / (dn_dist * dn_dist + 0.1);
              attractFx += (dnx / dn_dist) * pull;
              attractFy += (dny / dn_dist) * pull;
            }
            if (ds_dist < 10.0) {
              const pull = 0.1 / (ds_dist * ds_dist + 0.1);
              attractFx += (dsx / ds_dist) * pull;
              attractFy += (dsy / ds_dist) * pull;
            }

            // Slide filing slightly along field vector to help trace line
            const flowSpeed = 0.015;
            vx += (f.bx / bLen) * flowSpeed;
            vy += (f.by / bLen) * flowSpeed;
          }

          vx += attractFx;
          vy += attractFy;
        }

        // Apply friction and integrate position
        vx *= 0.85;
        vy *= 0.85;
        px += vx;
        py += vy;

        // Handle boundaries
        const aspect = window.innerWidth / window.innerHeight;
        const hw = 10.0 * aspect;
        const hh = 10.0;
        if (px < -hw) px = -hw;
        if (px > hw) px = hw;
        if (py < -hh) py = -hh;
        if (py > hh) py = hh;

        // Save back
        filings.x[i] = px;
        filings.y[i] = py;
        filings.vx[i] = vx;
        filings.vy[i] = vy;
      }
    }
  }

  // Draw force vector indicators (arrows)
  function drawForceArrows() {
    // Clear previous
    while (forcesGroup.children.length > 0) {
      forcesGroup.remove(forcesGroup.children[0]!);
    }

    if (!showForces) return;

    const allObjects: BaseObject[] = [...magnets, ...wires, ...balls];
    for (const obj of allObjects) {
      if (obj.isFrozen) continue;

      const f_mag = Math.sqrt(obj.fx * obj.fx + obj.fy * obj.fy);
      if (f_mag > 0.05) {
        // Draw line representing force vector
        const maxLen = 1.8;
        const arrowLen = Math.min(f_mag * 0.07, maxLen);
        const dir = new THREE.Vector3(obj.fx, obj.fy, 0).normalize();

        // Custom arrow helper using simple meshes
        const arrowColor = 0xffd54f; // gold yellow force vectors
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(obj.x, obj.y, 0),
          new THREE.Vector3(
            obj.x + dir.x * arrowLen,
            obj.y + dir.y * arrowLen,
            0
          ),
        ]);
        const line = new THREE.Line(
          lineGeom,
          new THREE.LineBasicMaterial({ color: arrowColor, linewidth: 2.5 })
        );
        forcesGroup.add(line);

        // Arrow head cone
        const headGeom = new THREE.ConeGeometry(0.06, 0.2, 4);
        headGeom.rotateX(Math.PI / 2);
        const headMat = new THREE.MeshBasicMaterial({ color: arrowColor });
        const headMesh = new THREE.Mesh(headGeom, headMat);
        headMesh.position.set(
          obj.x + dir.x * arrowLen,
          obj.y + dir.y * arrowLen,
          0
        );
        headMesh.lookAt(
          new THREE.Vector3(
            obj.x + dir.x * (arrowLen + 1.0),
            obj.y + dir.y * (arrowLen + 1.0),
            0
          )
        );
        forcesGroup.add(headMesh);
      }
    }
  }

  // Update Compass Grid Rotations
  function drawCompassGrid() {
    if (!gridNorthMesh.visible) return;

    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempRot = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1, 1, 1);

    for (let i = 0; i < compassGridPositions.length; i++) {
      const pos = compassGridPositions[i]!;

      // Calculate B field direction
      const f = getFieldAt(pos.x, pos.y, magnets, wires, balls);
      const angle = Math.atan2(f.by, f.bx);

      // Set North pointer
      tempPos.set(pos.x, pos.y, -0.4);
      tempRot.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
      tempMatrix.compose(tempPos, tempRot, tempScale);
      gridNorthMesh.setMatrixAt(i, tempMatrix);

      // Set South pointer (slightly offset behind North)
      tempPos.set(pos.x, pos.y, -0.42);
      tempRot.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
      tempMatrix.compose(tempPos, tempRot, tempScale);
      gridSouthMesh.setMatrixAt(i, tempMatrix);
    }

    gridNorthMesh.instanceMatrix.needsUpdate = true;
    gridSouthMesh.instanceMatrix.needsUpdate = true;
  }

  // Synchronize object data with Three.js meshes
  function syncRenderMeshes() {
    // 1. Permanent magnets
    for (const m of magnets) {
      m.mesh.position.set(m.x, m.y, 0);
      m.mesh.rotation.z = m.angle;
    }

    // 2. Wires
    for (const w of wires) {
      w.mesh.position.set(w.x, w.y, 0);
    }

    // 3. Balls
    for (const b of balls) {
      b.mesh.position.set(b.x, b.y, 0);
      // Give magnetized balls a subtle rolling effect
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > 0.01) {
        b.mesh.rotation.x += b.vy * 0.1;
        b.mesh.rotation.y += -b.vx * 0.1;
      }
    }

    // 4. Compasses
    for (const c of compasses) {
      const needle = c.mesh.getObjectByName("needle");
      if (needle) needle.rotation.z = c.angle;
    }

    // 5. Filings
    if (filings.count > 0) {
      const tempMatrix = new THREE.Matrix4();
      const tempPos = new THREE.Vector3();
      const tempRot = new THREE.Quaternion();
      const tempScale = new THREE.Vector3(1, 1, 1);

      for (let i = 0; i < filings.count; i++) {
        tempPos.set(filings.x[i]!, filings.y[i]!, -0.2);
        tempRot.setFromAxisAngle(new THREE.Vector3(0, 0, 1), filings.angle[i]!);
        tempMatrix.compose(tempPos, tempRot, tempScale);
        filings.mesh.setMatrixAt(i, tempMatrix);
      }
      filings.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Feed objects uniforms data to background ShaderMaterial
  function updateShaderUniforms() {
    // Magnets
    const uMagnets = shaderUniforms.u_magnets.value;
    const mCount = Math.min(magnets.length, 16);
    shaderUniforms.u_magnet_count.value = mCount;

    for (let i = 0; i < mCount; i++) {
      const m = magnets[i]!;
      uMagnets[i]!.position.set(m.x, m.y);
      uMagnets[i]!.direction.set(Math.cos(m.angle), Math.sin(m.angle));
      uMagnets[i]!.strength = m.strength;
    }

    // Wires
    const uWires = shaderUniforms.u_wires.value;
    const wCount = Math.min(wires.length, 16);
    shaderUniforms.u_wire_count.value = wCount;

    for (let i = 0; i < wCount; i++) {
      const w = wires[i]!;
      uWires[i]!.position.set(w.x, w.y);
      uWires[i]!.current = w.current;
    }

    // Balls
    const uBalls = shaderUniforms.u_balls.value;
    const bCount = Math.min(balls.length, 24);
    shaderUniforms.u_ball_count.value = bCount;

    for (let i = 0; i < bCount; i++) {
      const b = balls[i]!;
      uBalls[i]!.position.set(b.x, b.y);
      uBalls[i]!.moment.set(b.mx, b.my);
    }
  }

  // Update HUD statistics panel
  let lastFpsUpdate = 0;
  let fpsFrames = 0;
  let fpsVal = 60;

  function updateStatsPanel(time: number) {
    fpsFrames++;
    if (time > lastFpsUpdate + 1.0) {
      fpsVal = Math.round(fpsFrames / (time - lastFpsUpdate));
      fpsFrames = 0;
      lastFpsUpdate = time;
    }

    document.getElementById("stat-count")!.innerText = (
      magnets.length +
      wires.length +
      balls.length +
      compasses.length
    ).toString();
    document.getElementById("stat-filings")!.innerText =
      filings.count.toString();
    document.getElementById("stat-fps")!.innerText = fpsVal.toString();

    // Compute total system kinetic energy (sum 0.5 * m * v^2 + 0.5 * I * omega^2)
    let totalEnergy = 0;
    for (const m of magnets) {
      if (!m.isFrozen) {
        totalEnergy +=
          0.5 * m.mass * (m.vx * m.vx + m.vy * m.vy) +
          0.5 * m.inertia * m.omega * m.omega;
      }
    }
    for (const w of wires) {
      if (!w.isFrozen)
        totalEnergy += 0.5 * w.mass * (w.vx * w.vx + w.vy * w.vy);
    }
    for (const b of balls) {
      if (!b.isFrozen)
        totalEnergy += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy);
    }
    for (const c of compasses) {
      totalEnergy += 0.5 * c.inertia * c.omega * c.omega;
    }

    document.getElementById("stat-energy")!.innerText =
      totalEnergy.toFixed(2) + " J";
  }

  // Main animation frame loop
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    shaderUniforms.u_time.value = time;

    // Run physics tick if playing
    if (isPlaying) {
      runPhysicsStep();
    }

    // Collision resolutions, mesh sync
    resolveCollisions();
    syncRenderMeshes();
    drawForceArrows();
    drawCompassGrid();

    // Shader updates
    updateShaderUniforms();

    // Stats HUD panel update
    updateStatsPanel(time);

    // Selected object selections visual rings update
    showSelectionRings();

    renderer.render(scene, camera);
  }

  // Start loop
  animate();

  // ============================================================================
  // 10. UI EVENT LISTENERS CONNECTION
  // ============================================================================

  // Playback footer controls
  const playBtn = document.getElementById("btn-play-pause")!;
  playBtn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
      playBtn.classList.add("playing");
      playBtn.innerHTML = "<span class='icon'>⏸</span>";
    } else {
      playBtn.classList.remove("playing");
      playBtn.innerHTML = "<span class='icon'>▶</span>";
    }
  });

  document.getElementById("btn-step")!.addEventListener("click", () => {
    // Manually run one full step
    isPlaying = false;
    playBtn.classList.remove("playing");
    playBtn.innerHTML = "<span class='icon'>▶</span>";
    runPhysicsStep();
  });

  const presetSelect = document.getElementById(
    "preset-select"
  ) as HTMLSelectElement;
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    loadPreset(presetSelect.value);
  });

  // Help Modal display
  const helpModal = document.getElementById("help-modal")!;
  document.getElementById("btn-help")!.addEventListener("click", () => {
    helpModal.classList.remove("hidden");
  });
  document.getElementById("close-help-btn")!.addEventListener("click", () => {
    helpModal.classList.add("hidden");
  });

  // Settings: damping, gravity, clear
  const dampSlider = document.getElementById(
    "damping-slider"
  ) as HTMLInputElement;
  dampSlider.addEventListener("input", () => {
    damping = parseFloat(dampSlider.value);
    const textVal =
      damping < 0.005
        ? "Zero"
        : damping < 0.03
          ? "Low"
          : damping < 0.07
            ? "Medium"
            : "High";
    document.getElementById("damping-val")!.innerText = textVal;
  });

  const gravityCheck = document.getElementById(
    "toggle-gravity"
  ) as HTMLInputElement;
  gravityCheck.addEventListener("change", () => {
    gravityEnabled = gravityCheck.checked;
  });

  document.getElementById("clear-scene-btn")!.addEventListener("click", () => {
    clearScene();
  });

  // Visualizations checkboxes toggles
  const lineCheck = document.getElementById(
    "vis-field-lines"
  ) as HTMLInputElement;
  lineCheck.addEventListener("change", () => {
    shaderUniforms.u_vis_field_lines.value = lineCheck.checked;
  });

  const flowCheck = document.getElementById("vis-flow") as HTMLInputElement;
  flowCheck.addEventListener("change", () => {
    shaderUniforms.u_vis_flow.value = flowCheck.checked;
  });

  const heatCheck = document.getElementById("vis-heatmap") as HTMLInputElement;
  heatCheck.addEventListener("change", () => {
    shaderUniforms.u_vis_heatmap.value = heatCheck.checked;
  });

  const compCheck = document.getElementById(
    "vis-compass-grid"
  ) as HTMLInputElement;
  compCheck.addEventListener("change", () => {
    const active = compCheck.checked;
    gridNorthMesh.visible = active;
    gridSouthMesh.visible = active;
  });

  const forceCheck = document.getElementById("vis-forces") as HTMLInputElement;
  forceCheck.addEventListener("change", () => {
    showForces = forceCheck.checked;
  });

  // Preset loading selector
  presetSelect.addEventListener("change", () => {
    loadPreset(presetSelect.value);
  });

  // Toolbox actions
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Toggle select state
      const type = btn.getAttribute("data-type") as ObjectType | "filings";
      if (activeTool === type) {
        // Deselect
        btn.classList.remove("active");
        activeTool = null;
      } else {
        document
          .querySelectorAll(".tool-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeTool = type;
      }
    });
  });

  // Inspector dynamic updates: delete, freeze
  document
    .getElementById("inspect-delete-btn")!
    .addEventListener("click", () => {
      deleteSelectedObject();
    });

  const inspectFrozen = document.getElementById(
    "inspect-frozen"
  ) as HTMLInputElement;
  inspectFrozen.addEventListener("change", () => {
    if (selectedObject) {
      selectedObject.isFrozen = inspectFrozen.checked;
    }
  });

  // Inspector sliders: strength, current
  const inspectStrengthSlider = document.getElementById(
    "inspect-strength-slider"
  ) as HTMLInputElement;
  inspectStrengthSlider.addEventListener("input", () => {
    if (selectedObject && selectedObject.type === "bar") {
      const m = selectedObject as BarMagnet;
      m.strength = parseFloat(inspectStrengthSlider.value);
      document.getElementById("inspect-strength-val")!.innerText =
        m.strength.toFixed(0);

      // Update North/South mesh labels strength property (if needed for rendering)
      m.mesh.userData.strength = m.strength;
    }
  });

  const inspectCurrentSlider = document.getElementById(
    "inspect-current-slider"
  ) as HTMLInputElement;
  inspectCurrentSlider.addEventListener("input", () => {
    if (selectedObject && selectedObject.type === "wire") {
      const w = selectedObject as CurrentWire;
      w.current = parseFloat(inspectCurrentSlider.value);
      document.getElementById("inspect-current-val")!.innerText =
        w.current.toFixed(1) + " A";

      // Re-create wire texture to show the updated current direction instantly
      const mat = w.mesh.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.dispose();
      mat.map = createWireTexture(w.current);
    }
  });

  // Handle window resizing
  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);

    const newAspect = w / h;
    camera.left = -10 * newAspect;
    camera.right = 10 * newAspect;
    camera.top = 10;
    camera.bottom = -10;
    camera.updateProjectionMatrix();

    shaderUniforms.u_resolution.value.set(w, h);
  });

  // Load default preset empty sandbox on startup
  loadPreset("empty");
});
