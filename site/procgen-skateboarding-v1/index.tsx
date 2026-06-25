import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

// ============================================================================
// 1. SEEDED RANDOM & PERLIN NOISE
// ============================================================================

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

function getChunkSeed(cx: number, cz: number): number {
  let h = cx * 374761393 + cz * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

class ImprovedNoise {
  private p: number[] = new Array<number>(512);
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

// Global terrain height function using noise
function getBaseNoiseHeight(
  x: number,
  z: number,
  noiseGen: ImprovedNoise
): number {
  const n1 = noiseGen.noise(x * 0.005, z * 0.005, 0.0) * 12.0;
  const n2 = noiseGen.noise(x * 0.018, z * 0.018, 1.2) * 3.0;
  const n3 = noiseGen.noise(x * 0.07, z * 0.07, 3.5) * 0.6;
  return n1 + n2 + n3;
}

function getTerrainHeight(
  x: number,
  z: number,
  noiseGen: ImprovedNoise
): number {
  const cx = Math.floor((x + 30) / 60);
  const cz = Math.floor((z + 30) / 60);
  const seed = getChunkSeed(cx, cz);
  const rng = new SeededRandom(seed);
  const feature = rng.next();

  let height = getBaseNoiseHeight(x, z, noiseGen);

  const lx = x - cx * 60;
  const lz = z - cz * 60;

  if (feature < 0.25) {
    // Skate Bowl
    const radius = 18;
    const dist = Math.sqrt(lx * lx + lz * lz);
    if (dist < radius) {
      const ratio = dist / radius;
      height -= 6.5 * Math.pow(1 - ratio * ratio, 2);
    }
  } else if (feature < 0.5) {
    // Half-pipe aligned along Z
    const width = 12;
    const length = 40;
    if (Math.abs(lz) < length / 2 && Math.abs(lx) < width) {
      const ratio = lx / width;
      height -= 5.5 * Math.pow(1 - ratio * ratio, 2);
    }
  }

  return height;
}

function getTerrainColor(
  y: number,
  baseH: number,
  noiseVal: number
): THREE.Color {
  const color = new THREE.Color();
  // Concrete skate structures are carved below the natural base noise height
  if (y < baseH - 0.15) {
    const lightness = 0.68 + noiseVal * 0.05;
    color.setHSL(0.0, 0.0, lightness); // Concrete grey
  } else {
    // Outside landscape
    if (y < 2.0) {
      color.setHSL(0.28, 0.42, 0.42 + noiseVal * 0.05); // Grassy valley green
    } else if (y < 7.0) {
      color.setHSL(0.09, 0.28, 0.56 + noiseVal * 0.06); // Sandy dirt beige
    } else {
      color.setHSL(0.0, 0.0, 0.5 + noiseVal * 0.08); // Rocky peak grey
    }
  }
  return color;
}

let globalTerrainTexture: THREE.CanvasTexture | null = null;

function getGlobalTerrainTexture(): THREE.CanvasTexture {
  if (globalTerrainTexture) return globalTerrainTexture;

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Combination of fine grain, medium frequency mottling, and low frequency light/dark variations
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % size;
    const y = Math.floor(pixelIndex / size);

    // 1. High frequency fine grain
    const grain = Math.random() * 0.12;

    // 2. Medium frequency noise-like waves
    const m1 = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.04;
    const m2 =
      Math.sin(x * 0.04 + y * 0.02) * Math.cos(y * 0.05 - x * 0.01) * 0.04;
    const m3 = Math.sin(x * 0.01) * Math.cos(y * 0.015) * 0.06;

    const baseValue = 0.84;
    const totalVal = baseValue + grain + m1 + m2 + m3;
    const finalVal = Math.max(0, Math.min(255, Math.floor(totalVal * 255)));

    data[i] = finalVal; // R
    data[i + 1] = finalVal; // G
    data[i + 2] = finalVal; // B
    data[i + 3] = 255; // A
  }
  ctx.putImageData(imgData, 0, 0);

  // Subtle dark splatters/spots
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  for (let s = 0; s < 30; s++) {
    const rx = Math.random() * size;
    const ry = Math.random() * size;
    const rrad = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(rx, ry, rrad, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  globalTerrainTexture = texture;
  return texture;
}

// ============================================================================
// 2. CONSTANTS & COLLISION GROUPS
// ============================================================================

const CHUNK_SIZE = 60;
const CHUNK_RES = 30; // Grid segments

const GROUP_TERRAIN = 0x0001;
const GROUP_BOARD = 0x0002;
const GROUP_CHARACTER = 0x0004;

const terrainFilter =
  (GROUP_TERRAIN << 16) | (GROUP_TERRAIN | GROUP_BOARD | GROUP_CHARACTER);
const boardFilter = (GROUP_BOARD << 16) | GROUP_TERRAIN;
const characterFilter = (GROUP_CHARACTER << 16) | GROUP_TERRAIN;

// ============================================================================
// 3. PROCEDURAL OBSTACLE/CHUNK MANAGER
// ============================================================================

interface RailInfo {
  start: THREE.Vector3;
  end: THREE.Vector3;
  mesh: THREE.Mesh;
}

class Chunk {
  cx: number;
  cz: number;
  group: THREE.Group;
  physicsBodies: RAPIER.RigidBody[] = [];
  rails: RailInfo[] = [];

  constructor(
    cx: number,
    cz: number,
    scene: THREE.Scene,
    world: RAPIER.World,
    noiseGen: ImprovedNoise
  ) {
    this.cx = cx;
    this.cz = cz;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.generate(world, noiseGen);
  }

  generate(world: RAPIER.World, noiseGen: ImprovedNoise) {
    const vertices: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // 1. Terrain grid vertices
    for (let i = 0; i <= CHUNK_RES; i++) {
      const lx = (i / CHUNK_RES) * CHUNK_SIZE - CHUNK_SIZE / 2;
      const wx = this.cx * CHUNK_SIZE + lx;

      for (let j = 0; j <= CHUNK_RES; j++) {
        const lz = (j / CHUNK_RES) * CHUNK_SIZE - CHUNK_SIZE / 2;
        const wz = this.cz * CHUNK_SIZE + lz;

        const wy = getTerrainHeight(wx, wz, noiseGen);
        vertices.push(wx, wy, wz);

        const baseH = getBaseNoiseHeight(wx, wz, noiseGen);
        const noiseVal = noiseGen.noise(wx * 0.1, wz * 0.1, 0.0);
        const col = getTerrainColor(wy, baseH, noiseVal);
        colors.push(col.r, col.g, col.b);
        uvs.push(wx * 0.08, wz * 0.08); // Scale UV mapping relative to world coords for seamless tiling
      }
    }

    // 2. Index buffers
    for (let i = 0; i < CHUNK_RES; i++) {
      for (let j = 0; j < CHUNK_RES; j++) {
        const a = i * (CHUNK_RES + 1) + j;
        const b = i * (CHUNK_RES + 1) + (j + 1);
        const c = (i + 1) * (CHUNK_RES + 1) + j;
        const d = (i + 1) * (CHUNK_RES + 1) + (j + 1);

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // 3. Create flat-shaded terrain mesh
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
      map: getGlobalTerrainTexture(),
      transparent: false,
      opacity: 1.0,
    });
    const terrainMesh = new THREE.Mesh(geometry, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    this.group.add(terrainMesh);

    // 4. Create wireframe grid lines (subtle contour lines)
    const wireframeGeo = new THREE.WireframeGeometry(geometry);
    const wireframeMat = new THREE.LineBasicMaterial({
      color: 0x14532d, // Dark forest green
      transparent: true,
      opacity: 0.08,
    });
    const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
    this.group.add(wireframe);

    // 5. Rapier trimesh collider
    const verticesFloat32 = new Float32Array(vertices);
    const indicesUint32 = new Uint32Array(indices);
    const terrainBodyDesc = RAPIER.RigidBodyDesc.fixed();
    const terrainBody = world.createRigidBody(terrainBodyDesc);
    const terrainColliderDesc = RAPIER.ColliderDesc.trimesh(
      verticesFloat32,
      indicesUint32
    );
    const terrainCollider = world.createCollider(
      terrainColliderDesc,
      terrainBody
    );
    terrainCollider.setCollisionGroups(terrainFilter);
    this.physicsBodies.push(terrainBody);

    // 6. Procedural Static Obstacles (ramps and rails)
    const seed = getChunkSeed(this.cx, this.cz);
    const rng = new SeededRandom(seed);
    const feature = rng.next();

    // Ramps and rails are spawned mostly in non-bowl/half-pipe chunks
    if (feature >= 0.5) {
      // Spawn 1-2 ramps
      const numRamps = Math.floor(rng.range(1, 3));
      for (let r = 0; r < numRamps; r++) {
        const rx = this.cx * CHUNK_SIZE + rng.range(-15, 15);
        const rz = this.cz * CHUNK_SIZE + rng.range(-15, 15);
        const ry = getTerrainHeight(rx, rz, noiseGen) + 0.4;

        const width = 6.0;
        const height = 1.8;
        const depth = 6.0;

        const rampGeo = new THREE.BoxGeometry(width, height, depth);
        const rampMat = new THREE.MeshStandardMaterial({
          color: 0xb45309, // Plywood skater wood brown
          roughness: 0.85,
          flatShading: true,
        });
        const rampMesh = new THREE.Mesh(rampGeo, rampMat);
        rampMesh.position.set(rx, ry, rz);
        rampMesh.rotation.x = rng.range(0.15, 0.35); // tilt angle
        rampMesh.rotation.y = rng.range(0, Math.PI * 2);
        rampMesh.castShadow = true;
        rampMesh.receiveShadow = true;
        this.group.add(rampMesh);

        // Physics static collider matching rotation
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
          rx,
          ry,
          rz
        );
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            rampMesh.rotation.x,
            rampMesh.rotation.y,
            rampMesh.rotation.z
          )
        );
        bodyDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        const body = world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(
          width / 2,
          height / 2,
          depth / 2
        );
        const collider = world.createCollider(colliderDesc, body);
        collider.setCollisionGroups(terrainFilter);
        this.physicsBodies.push(body);
      }

      // Spawn grinding rail
      if (rng.next() < 0.7) {
        const railX = this.cx * CHUNK_SIZE + rng.range(-10, 10);
        const railZ = this.cz * CHUNK_SIZE + rng.range(-10, 10);
        const railBaseY = getTerrainHeight(railX, railZ, noiseGen);
        const railH = 1.3;
        const railY = railBaseY + railH;
        const railLen = 14.0;

        const railAngle = rng.range(0, Math.PI * 2);
        const start = new THREE.Vector3(
          railX - (railLen / 2) * Math.sin(railAngle),
          railY,
          railZ - (railLen / 2) * Math.cos(railAngle)
        );
        const end = new THREE.Vector3(
          railX + (railLen / 2) * Math.sin(railAngle),
          railY,
          railZ + (railLen / 2) * Math.cos(railAngle)
        );

        // Adjust start/end to follow terrain slope slightly
        start.y = getTerrainHeight(start.x, start.z, noiseGen) + railH;
        end.y = getTerrainHeight(end.x, end.z, noiseGen) + railH;

        // Visual Rail Mesh
        const railGeo = new THREE.CylinderGeometry(0.06, 0.06, railLen, 8);
        const railMat = new THREE.MeshStandardMaterial({
          color: 0xd1d5db, // Galvanized metal steel rail
          metalness: 0.95,
          roughness: 0.1,
        });
        const railMesh = new THREE.Mesh(railGeo, railMat);

        // Position and orient cylinder along segment
        const segmentCenter = new THREE.Vector3()
          .addVectors(start, end)
          .multiplyScalar(0.5);
        railMesh.position.copy(segmentCenter);

        const direction = new THREE.Vector3().subVectors(end, start);
        const up = new THREE.Vector3(0, 1, 0);
        const alignQ = new THREE.Quaternion().setFromUnitVectors(
          up,
          direction.clone().normalize()
        );
        railMesh.quaternion.copy(alignQ);
        railMesh.castShadow = true;
        this.group.add(railMesh);

        // Visual support legs
        const numLegs = 3;
        for (let l = 0; l < numLegs; l++) {
          const t = l / (numLegs - 1);
          const px = start.x + t * (end.x - start.x);
          const pz = start.z + t * (end.z - start.z);
          const py = start.y + t * (end.y - start.y);
          const gY = getTerrainHeight(px, pz, noiseGen);

          const legH = py - gY;
          if (legH > 0) {
            const legGeo = new THREE.CylinderGeometry(0.04, 0.04, legH, 6);
            const leg = new THREE.Mesh(legGeo, railMat);
            leg.position.set(px, gY + legH / 2, pz);
            leg.castShadow = true;
            this.group.add(leg);
          }
        }

        // Store rail references for grind calculations
        this.rails.push({ start, end, mesh: railMesh });

        // Physics static box collider along the rail
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
          segmentCenter.x,
          segmentCenter.y,
          segmentCenter.z
        );
        bodyDesc.setRotation({
          x: alignQ.x,
          y: alignQ.y,
          z: alignQ.z,
          w: alignQ.w,
        });
        const body = world.createRigidBody(bodyDesc);
        const colliderDesc = RAPIER.ColliderDesc.cuboid(
          0.08,
          railLen / 2,
          0.08
        ); // aligned along local Y of body
        const collider = world.createCollider(colliderDesc, body);
        collider.setCollisionGroups(terrainFilter);
        this.physicsBodies.push(body);
      }
    }
  }

  destroy(world: RAPIER.World, scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if (m && typeof m.dispose === "function") m.dispose();
          });
        } else if (mat && typeof mat.dispose === "function") {
          mat.dispose();
        }
      } else if (obj instanceof THREE.LineSegments) {
        const line = obj as THREE.LineSegments;
        line.geometry.dispose();
        const mat = line.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if (m && typeof m.dispose === "function") m.dispose();
          });
        } else if (mat && typeof mat.dispose === "function") {
          mat.dispose();
        }
      }
    });

    this.physicsBodies.forEach((body) => {
      world.removeRigidBody(body);
    });
    this.physicsBodies = [];
  }
}

// ============================================================================
// 4. RAGDOLL & SKATEBOARD PLAYER SYSTEM
// ============================================================================

interface PhysicsBodyPair {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
}

class PlayerSystem {
  world: RAPIER.World;
  scene: THREE.Scene;

  // Skateboard
  boardBody!: RAPIER.RigidBody;
  boardMesh!: THREE.Group;
  wheels: THREE.Mesh[] = [];

  // Ragdoll bodies and meshes
  torso!: PhysicsBodyPair;
  head!: PhysicsBodyPair;
  leftArm!: PhysicsBodyPair;
  rightArm!: PhysicsBodyPair;
  leftLeg!: PhysicsBodyPair;
  rightLeg!: PhysicsBodyPair;

  joints: RAPIER.ImpulseJoint[] = [];
  riderJoint: RAPIER.ImpulseJoint | null = null; // Connects board & torso

  crashed = false;
  sparkParticles!: THREE.Points;
  sparkGeo!: THREE.BufferGeometry;
  sparkCount = 30;
  sparkPool: {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    age: number;
    maxAge: number;
  }[] = [];

  constructor(world: RAPIER.World, scene: THREE.Scene, pos: THREE.Vector3) {
    this.world = world;
    this.scene = scene;
    this.initializeSparks();
    this.spawn(pos);
  }

  initializeSparks() {
    this.sparkGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.sparkCount * 3);
    this.sparkGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const sparkMat = new THREE.PointsMaterial({
      color: 0xfacc15, // yellow sparks
      size: 0.18,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.sparkParticles = new THREE.Points(this.sparkGeo, sparkMat);
    this.sparkParticles.visible = false;
    this.scene.add(this.sparkParticles);
  }

  spawnSparks(position: THREE.Vector3, direction: THREE.Vector3) {
    this.sparkParticles.visible = true;
    for (let i = 0; i < 5; i++) {
      this.sparkPool.push({
        pos: position.clone(),
        vel: direction
          .clone()
          .multiplyScalar(-2.5)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 1.5,
              (Math.random() - 0.5) * 1.5,
              (Math.random() - 0.5) * 1.5
            )
          ),
        age: 0,
        maxAge: Math.random() * 0.4 + 0.2,
      });
    }
  }

  updateSparks(dt: number) {
    this.sparkPool = this.sparkPool.filter((s) => {
      s.pos.add(s.vel.clone().multiplyScalar(dt));
      s.vel.y -= 9.81 * dt; // gravity
      s.age += dt;
      return s.age < s.maxAge;
    });

    const positionAttr = this.sparkGeo.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    if (positionAttr) {
      const positions = positionAttr.array as Float32Array;
      for (let i = 0; i < this.sparkCount; i++) {
        const spark = this.sparkPool[i];
        if (spark) {
          positions[i * 3] = spark.pos.x;
          positions[i * 3 + 1] = spark.pos.y;
          positions[i * 3 + 2] = spark.pos.z;
        } else {
          positions[i * 3] = 0;
          positions[i * 3 + 1] = -9999;
          positions[i * 3 + 2] = 0;
        }
      }
      positionAttr.needsUpdate = true;
    }
    if (this.sparkPool.length === 0) {
      this.sparkParticles.visible = false;
    }
  }

  spawn(pos: THREE.Vector3) {
    this.crashed = false;
    this.joints.forEach((j) => this.world.removeImpulseJoint(j, true));
    this.joints = [];
    if (this.riderJoint) {
      this.world.removeImpulseJoint(this.riderJoint, true);
      this.riderJoint = null;
    }

    // Cleanup old meshes
    const cleanupPair = (p: PhysicsBodyPair | undefined) => {
      if (p) {
        this.scene.remove(p.mesh);
        this.world.removeRigidBody(p.body);
      }
    };
    cleanupPair(this.torso);
    cleanupPair(this.head);
    cleanupPair(this.leftArm);
    cleanupPair(this.rightArm);
    cleanupPair(this.leftLeg);
    cleanupPair(this.rightLeg);
    if (this.boardBody) {
      this.scene.remove(this.boardMesh);
      this.world.removeRigidBody(this.boardBody);
    }

    // 1. Skateboard Rigid Body
    const boardDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y + 0.3, pos.z)
      .setLinearDamping(0.2)
      .setAngularDamping(1.6);
    this.boardBody = this.world.createRigidBody(boardDesc);

    // Box dimensions: 0.8 width (x), 0.16 height (y), 2.0 length (z)
    const boardColliderDesc = RAPIER.ColliderDesc.cuboid(0.4, 0.08, 1.0)
      .setFriction(0.12)
      .setRestitution(0.25);
    const boardCol = this.world.createCollider(
      boardColliderDesc,
      this.boardBody
    );
    boardCol.setCollisionGroups(boardFilter);

    // Visual Board Mesh
    this.boardMesh = new THREE.Group();

    // Deck (wood border)
    const deckGeo = new THREE.BoxGeometry(0.8, 0.08, 2.0);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Maple wood brown border
      roughness: 0.7,
      flatShading: true,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    this.boardMesh.add(deckMesh);

    // Black Grip Tape Overlay
    const stripeGeo = new THREE.BoxGeometry(0.72, 0.084, 1.92);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.9,
    });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    stripeMesh.position.y = 0.002;
    this.boardMesh.add(stripeMesh);

    // Wheels (4 cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // Polyurethane white skate wheels
      roughness: 0.45,
    });
    wheelGeo.rotateZ(Math.PI / 2); // align wheels sideways

    const wheelOffsets = [
      new THREE.Vector3(0.35, -0.12, 0.6),
      new THREE.Vector3(-0.35, -0.12, 0.6),
      new THREE.Vector3(0.35, -0.12, -0.6),
      new THREE.Vector3(-0.35, -0.12, -0.6),
    ];

    this.wheels = [];
    wheelOffsets.forEach((offset) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.copy(offset);
      wheel.castShadow = true;
      this.boardMesh.add(wheel);
      this.wheels.push(wheel);
    });

    this.scene.add(this.boardMesh);

    // 2. Character Ragdoll Parts
    // Torso Capsule (radius 0.2, cylinder height 0.6)
    const charMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Bright red skater mannequin
      roughness: 0.4,
      flatShading: true,
    });

    const torsoY = pos.y + 1.15;
    const torsoDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, torsoY, pos.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.5);
    const torsoBody = this.world.createRigidBody(torsoDesc);
    const torsoColDesc = RAPIER.ColliderDesc.capsule(0.3, 0.2); // half-height = 0.3, radius = 0.2
    const torsoCol = this.world.createCollider(torsoColDesc, torsoBody);
    torsoCol.setCollisionGroups(characterFilter);
    const torsoGeo = new THREE.CapsuleGeometry(0.2, 0.6, 8, 16);
    const torsoMesh = new THREE.Mesh(torsoGeo, charMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    this.scene.add(torsoMesh);
    this.torso = { body: torsoBody, mesh: torsoMesh };

    // Head Sphere
    const headDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y + 1.8, pos.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.8);
    const headBody = this.world.createRigidBody(headDesc);
    const headColDesc = RAPIER.ColliderDesc.ball(0.16);
    const headCol = this.world.createCollider(headColDesc, headBody);
    headCol.setCollisionGroups(characterFilter);
    const headGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const headMesh = new THREE.Mesh(headGeo, charMat);
    headMesh.castShadow = true;
    this.scene.add(headMesh);
    this.head = { body: headBody, mesh: headMesh };

    // Left Arm
    const laDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x + 0.4, pos.y + 1.35, pos.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.6);
    const laBody = this.world.createRigidBody(laDesc);
    const laColDesc = RAPIER.ColliderDesc.capsule(0.16, 0.08);
    const laCol = this.world.createCollider(laColDesc, laBody);
    laCol.setCollisionGroups(characterFilter);
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.32, 6, 12);
    const laMesh = new THREE.Mesh(armGeo, charMat);
    laMesh.castShadow = true;
    this.scene.add(laMesh);
    this.leftArm = { body: laBody, mesh: laMesh };

    // Right Arm
    const raDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x - 0.4, pos.y + 1.35, pos.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.6);
    const raBody = this.world.createRigidBody(raDesc);
    const raColDesc = RAPIER.ColliderDesc.capsule(0.16, 0.08);
    const raCol = this.world.createCollider(raColDesc, raBody);
    raCol.setCollisionGroups(characterFilter);
    const raMesh = new THREE.Mesh(armGeo, charMat);
    raMesh.castShadow = true;
    this.scene.add(raMesh);
    this.rightArm = { body: raBody, mesh: raMesh };

    // Left Leg
    const llDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x + 0.22, pos.y + 0.65, pos.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.6);
    const llBody = this.world.createRigidBody(llDesc);
    const llColDesc = RAPIER.ColliderDesc.capsule(0.22, 0.09);
    const llCol = this.world.createCollider(llColDesc, llBody);
    llCol.setCollisionGroups(characterFilter);
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.44, 6, 12);
    const llMesh = new THREE.Mesh(legGeo, charMat);
    llMesh.castShadow = true;
    this.scene.add(llMesh);
    this.leftLeg = { body: llBody, mesh: llMesh };

    // Right Leg
    const rlDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x - 0.22, pos.y + 0.65, pos.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.6);
    const rlBody = this.world.createRigidBody(rlDesc);
    const rlColDesc = RAPIER.ColliderDesc.capsule(0.22, 0.09);
    const rlCol = this.world.createCollider(rlColDesc, rlBody);
    rlCol.setCollisionGroups(characterFilter);
    const rlMesh = new THREE.Mesh(legGeo, charMat);
    rlMesh.castShadow = true;
    this.scene.add(rlMesh);
    this.rightLeg = { body: rlBody, mesh: rlMesh };

    // 3. Connect Ragdoll Joints
    // Neck: Torso -> Head
    const neckData = RAPIER.JointData.spherical(
      { x: 0, y: 0.5, z: 0 },
      { x: 0, y: -0.22, z: 0 }
    );
    this.joints.push(
      this.world.createImpulseJoint(neckData, torsoBody, headBody, true)
    );

    // Shoulders
    const lShoulderData = RAPIER.JointData.spherical(
      { x: 0.25, y: 0.35, z: 0 },
      { x: 0, y: 0.22, z: 0 }
    );
    this.joints.push(
      this.world.createImpulseJoint(lShoulderData, torsoBody, laBody, true)
    );

    const rShoulderData = RAPIER.JointData.spherical(
      { x: -0.25, y: 0.35, z: 0 },
      { x: 0, y: 0.22, z: 0 }
    );
    this.joints.push(
      this.world.createImpulseJoint(rShoulderData, torsoBody, raBody, true)
    );

    // Hips
    const lHipData = RAPIER.JointData.spherical(
      { x: 0.18, y: -0.4, z: 0 },
      { x: 0, y: 0.26, z: 0 }
    );
    this.joints.push(
      this.world.createImpulseJoint(lHipData, torsoBody, llBody, true)
    );

    const rHipData = RAPIER.JointData.spherical(
      { x: -0.18, y: -0.4, z: 0 },
      { x: 0, y: 0.26, z: 0 }
    );
    this.joints.push(
      this.world.createImpulseJoint(rHipData, torsoBody, rlBody, true)
    );

    // 4. Stand/Weld Joint connecting Board and Torso
    // Standing offset places torso center 0.8m above skateboard deck
    const identityQ = { x: 0, y: 0, z: 0, w: 1 };
    const weldData = RAPIER.JointData.fixed(
      { x: 0, y: 0.7, z: 0 }, // anchor on board
      identityQ,
      { x: 0, y: -0.45, z: 0 }, // anchor on torso
      identityQ
    );
    this.riderJoint = this.world.createImpulseJoint(
      weldData,
      this.boardBody,
      torsoBody,
      true
    );
  }

  crash() {
    if (this.crashed) return;
    this.crashed = true;

    // Disconnect torso from board
    if (this.riderJoint) {
      this.world.removeImpulseJoint(this.riderJoint, true);
      this.riderJoint = null;
    }

    // Apply explosion impulse outward to give funny ragdoll crash velocity
    const boardVel = this.boardBody.linvel();
    const crashVel = new THREE.Vector3(boardVel.x, boardVel.y, boardVel.z);

    // Add forward tumble + pop up force
    crashVel.y += 4.0;

    const bodies = [
      this.torso.body,
      this.head.body,
      this.leftArm.body,
      this.rightArm.body,
      this.leftLeg.body,
      this.rightLeg.body,
    ];

    bodies.forEach((b) => {
      b.setLinvel(
        {
          x: crashVel.x + (Math.random() - 0.5) * 2.0,
          y: crashVel.y + (Math.random() - 0.5) * 2.0,
          z: crashVel.z + (Math.random() - 0.5) * 2.0,
        },
        true
      );
      b.setAngvel(
        {
          x: (Math.random() - 0.5) * 15,
          y: (Math.random() - 0.5) * 15,
          z: (Math.random() - 0.5) * 15,
        },
        true
      );
    });

    // Skateboard flies off on its own
    this.boardBody.setAngvel(
      {
        x: (Math.random() - 0.5) * 25,
        y: (Math.random() - 0.5) * 25,
        z: (Math.random() - 0.5) * 25,
      },
      true
    );

    // Show wipeout overlay in DOM
    const overlay = document.getElementById("wipeout-screen");
    if (overlay) overlay.classList.remove("hidden");
  }

  syncVisuals(dt: number) {
    const sync = (pair: PhysicsBodyPair) => {
      const p = pair.body.translation();
      const r = pair.body.rotation();
      pair.mesh.position.set(p.x, p.y, p.z);
      pair.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    };

    sync(this.torso);
    sync(this.head);
    sync(this.leftArm);
    sync(this.rightArm);
    sync(this.leftLeg);
    sync(this.rightLeg);

    const bp = this.boardBody.translation();
    const br = this.boardBody.rotation();
    this.boardMesh.position.set(bp.x, bp.y, bp.z);
    this.boardMesh.quaternion.set(br.x, br.y, br.z, br.w);

    // Rotate wheels based on linear speed along local board axis
    const velocity = this.boardBody.linvel();
    const velVec = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    const boardRotation = new THREE.Quaternion(br.x, br.y, br.z, br.w);
    const boardForward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      boardRotation
    );
    const speed = velVec.dot(boardForward);

    this.wheels.forEach((wheel) => {
      wheel.rotation.x += speed * dt * 3.5;
    });

    this.updateSparks(dt);
  }
}

// ============================================================================
// 5. MAIN SIMULATOR CLASS
// ============================================================================

class SkateSimulator {
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  world!: RAPIER.World;

  noiseGen!: ImprovedNoise;
  player!: PlayerSystem;

  // Chunk loading
  activeChunks = new Map<string, Chunk>();
  currentChunkX = 0;
  currentChunkZ = 0;

  // Controls
  keys: Record<string, boolean> = {
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false,
  };

  // Game state
  score = 0;
  multiplier = 1;
  isGrounded = false;
  grindRail: RailInfo | null = null;
  grindT = 0;
  grindSpeed = 0;

  // Air state & trick accumulators
  airTime = 0.0;
  wasGroundedLast = true;
  lastVerticalVelocity = 0.0;

  accumulatedYaw = 0.0;
  accumulatedPitch = 0.0;
  accumulatedRoll = 0.0;
  lastQuaternion = new THREE.Quaternion();

  currentTrickCombo: string[] = [];

  // Follow camera parameters
  cameraYaw = 0.0;
  cameraPitch = 0.2;
  isMouseDown = false;
  prevMouseX = 0;
  prevMouseY = 0;

  constructor() {
    this.initEngine()
      .then(() => {
        this.setupInput();
        this.animate();
      })
      .catch((err) => {
        console.error("Failed to initialize game:", err);
      });
  }

  async initEngine() {
    // Await WASM physics load
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0.0, y: -14.0, z: 0.0 }); // Slightly higher gravity for snappier feel

    // Noise Setup
    const globalRng = new SeededRandom(999);
    this.noiseGen = new ImprovedNoise(globalRng);

    // ThreeJS Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbae6fd); // Bright blue sky
    this.scene.fog = new THREE.FogExp2(0xbae6fd, 0.01); // Soft sky fog

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient light (bright sunlight bounce)
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(ambient);

    // Golden Sunlight
    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.8); // Warm sun
    dirLight.position.set(60, 120, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    const shadowD = 60;
    dirLight.shadow.camera.left = -shadowD;
    dirLight.shadow.camera.right = shadowD;
    dirLight.shadow.camera.top = shadowD;
    dirLight.shadow.camera.bottom = -shadowD;
    dirLight.shadow.bias = -0.0003;
    this.scene.add(dirLight);

    // Soft point light following player (subtle fill)
    const pointLight = new THREE.PointLight(0xfffbeb, 0.5, 15);
    pointLight.castShadow = false;
    this.scene.add(pointLight);
    this.scene.userData.playerLight = pointLight;

    // Spawn player at start position (0, getTerrainHeight(0,0)+3, 0)
    const terrainStartH = getTerrainHeight(0, 0, this.noiseGen);
    this.player = new PlayerSystem(
      this.world,
      this.scene,
      new THREE.Vector3(0, terrainStartH + 2, 0)
    );

    // Set initial camera behind player
    this.cameraYaw = Math.PI;

    // Initial chunk load
    this.updateChunks(true);

    // Resizing
    window.addEventListener("resize", () => this.onResize());

    // Wire up HUD button
    const respawnBtn = document.getElementById("respawn-btn");
    if (respawnBtn) {
      respawnBtn.addEventListener("click", () => this.resetPlayer());
    }
  }

  setupInput() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") this.keys.Space = true;
      else if (e.key === "r" || e.key === "R") {
        this.resetPlayer();
      } else {
        const key = e.key;
        if (key in this.keys) this.keys[key] = true;
        const keyLower = key.toLowerCase();
        if (keyLower in this.keys) this.keys[keyLower] = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.keys.Space = false;
      else {
        const key = e.key;
        if (key in this.keys) this.keys[key] = false;
        const keyLower = key.toLowerCase();
        if (keyLower in this.keys) this.keys[keyLower] = false;
      }
    });

    // Mouse drag to look around
    window.addEventListener("mousedown", (e) => {
      this.isMouseDown = true;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isMouseDown) return;
      const dx = e.clientX - this.prevMouseX;
      const dy = e.clientY - this.prevMouseY;
      this.cameraYaw += dx * 0.005;
      this.cameraPitch = Math.max(
        -0.4,
        Math.min(1.0, this.cameraPitch + dy * 0.005)
      );
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener("mouseup", () => (this.isMouseDown = false));
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  resetPlayer() {
    const bp = this.player.boardBody.translation();
    // Respawn slightly above the nearest terrain segment
    const th = getTerrainHeight(bp.x, bp.z, this.noiseGen);
    this.player.spawn(new THREE.Vector3(bp.x, th + 2.0, bp.z));

    this.isGrounded = false;
    this.grindRail = null;
    this.airTime = 0.0;
    this.accumulatedYaw = 0.0;
    this.accumulatedPitch = 0.0;
    this.accumulatedRoll = 0.0;
    this.wasGroundedLast = true;
    this.multiplier = 1;
    this.currentTrickCombo = [];

    // Hide overlays
    const overlay = document.getElementById("wipeout-screen");
    if (overlay) overlay.classList.add("hidden");
    const banner = document.getElementById("center-message");
    if (banner) banner.classList.add("hidden");
    const tricksList = document.getElementById("combo-tricks");
    if (tricksList) tricksList.innerHTML = "";
    const multVal = document.getElementById("multiplier-val");
    if (multVal) multVal.innerText = "x1";
  }

  updateChunks(force = false) {
    const bp = this.player.boardBody.translation();
    const cx = Math.floor((bp.x + CHUNK_SIZE / 2) / CHUNK_SIZE);
    const cz = Math.floor((bp.z + CHUNK_SIZE / 2) / CHUNK_SIZE);

    if (cx === this.currentChunkX && cz === this.currentChunkZ && !force)
      return;

    this.currentChunkX = cx;
    this.currentChunkZ = cz;

    const visibleKeys = new Set<string>();
    // Load $3 \times 3$ grid around player
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const nx = cx + dx;
        const nz = cz + dz;
        const key = `${nx},${nz}`;
        visibleKeys.add(key);

        if (!this.activeChunks.has(key)) {
          const chunk = new Chunk(
            nx,
            nz,
            this.scene,
            this.world,
            this.noiseGen
          );
          this.activeChunks.set(key, chunk);
        }
      }
    }

    // Unload chunks outside grid
    this.activeChunks.forEach((chunk, key) => {
      if (!visibleKeys.has(key)) {
        chunk.destroy(this.world, this.scene);
        this.activeChunks.delete(key);
      }
    });
  }

  updatePhysics(dt: number) {
    if (this.player.crashed) {
      this.world.step();
      return;
    }

    const board = this.player.boardBody;
    const bp = board.translation();
    const br = board.rotation();
    const rotQ = new THREE.Quaternion(br.x, br.y, br.z, br.w);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotQ);

    const velocity = board.linvel();
    const velVec = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    this.lastVerticalVelocity = velocity.y;

    // 1. Raycast ground checks
    const rayLength = 0.55;
    let hitCount = 0;
    const groundNormals: THREE.Vector3[] = [];

    // Cast 4 downward rays from board corners
    const rayOffsets = [
      new THREE.Vector3(0.3, -0.05, 0.8),
      new THREE.Vector3(-0.3, -0.05, 0.8),
      new THREE.Vector3(0.3, -0.05, -0.8),
      new THREE.Vector3(-0.3, -0.05, -0.8),
    ];

    rayOffsets.forEach((offset) => {
      const localOrigin = offset.clone().applyQuaternion(rotQ);
      const worldOrigin = new THREE.Vector3(bp.x, bp.y, bp.z).add(localOrigin);

      // Raycast down in physics
      const ray = new RAPIER.Ray(worldOrigin, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRayAndGetNormal(
        ray,
        rayLength,
        true,
        undefined,
        undefined,
        undefined,
        board
      );

      if (hit) {
        hitCount++;
        groundNormals.push(
          new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z)
        );
      }
    });

    const isGroundedNow = hitCount >= 2;

    // 2. Grinding Rail Logic
    if (this.grindRail) {
      // We are grinding!
      const start = this.grindRail.start;
      const end = this.grindRail.end;
      const ab = new THREE.Vector3().subVectors(end, start);
      const ap = new THREE.Vector3(bp.x, bp.y, bp.z).subVectors(
        new THREE.Vector3(bp.x, bp.y, bp.z),
        start
      );

      const railLenSq = ab.lengthSq();
      let t = ab.dot(ap) / railLenSq;
      t = Math.max(0, Math.min(1, t)); // clamp segment

      const projection = start.clone().add(ab.multiplyScalar(t));

      // Grind speed stays high
      if (Math.abs(this.grindSpeed) < 8.0) {
        this.grindSpeed = Math.sign(this.grindSpeed || 1) * 8.0;
      }

      // Progress along rail
      const railDir = ab.clone().normalize();
      const progress = railDir.clone().multiplyScalar(this.grindSpeed * dt);
      const targetPos = projection.add(progress);

      // Check if run off end of rail
      if (t <= 0.005 || t >= 0.995) {
        // Fly off rail!
        board.setTranslation(
          { x: targetPos.x, y: targetPos.y + 0.1, z: targetPos.z },
          true
        );
        board.setLinvel(railDir.clone().multiplyScalar(this.grindSpeed), true);
        this.grindRail = null;
      } else {
        // Keep snapped to rail
        board.setTranslation(
          { x: targetPos.x, y: targetPos.y + 0.12, z: targetPos.z },
          true
        );
        board.setLinvel(railDir.clone().multiplyScalar(this.grindSpeed), true);

        // Lock rotation along rail
        const lookQ = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(start, end, new THREE.Vector3(0, 1, 0))
        );
        board.setRotation(
          { x: lookQ.x, y: lookQ.y, z: lookQ.z, w: lookQ.w },
          true
        );

        // Sparks!
        this.player.spawnSparks(
          new THREE.Vector3(bp.x, bp.y - 0.1, bp.z),
          railDir
        );

        // Grind tricks
        let trickName = "50-50 Grind";
        const angle = forward.angleTo(railDir);
        if (angle > Math.PI / 4 && angle < (3 * Math.PI) / 4) {
          trickName = "Boardslide";
        }
        if (!this.currentTrickCombo.includes(trickName)) {
          this.currentTrickCombo.push(trickName);
          this.showTrickAlert(trickName, 300);
        }

        // Jump out of grind
        if (this.keys.Space) {
          board.setLinvel(
            {
              x: railDir.x * this.grindSpeed,
              y: 3.5, // Reduced from 7.5
              z: railDir.z * this.grindSpeed,
            },
            true
          );
          this.grindRail = null;
        }
      }
    } else {
      // 3. Ground / Air Movement
      this.isGrounded = isGroundedNow;

      if (this.isGrounded) {
        // Clear trick list on successful landing
        if (!this.wasGroundedLast) {
          this.landTrick();
        }

        // Accelerate / Brake input
        let forceMag = 0;
        if (this.keys.w || this.keys.ArrowUp) {
          forceMag = 15.0; // Much weaker, more realistic acceleration
        } else if (this.keys.s || this.keys.ArrowDown) {
          forceMag = -8.0; // Much weaker brake/reverse
        }

        // Apply forward/backward drive force as an impulse (force * dt)
        // to prevent force accumulation issues in the physics engine.
        const driveImpulse = forward.clone().multiplyScalar(forceMag * dt);
        board.applyImpulse(
          { x: driveImpulse.x, y: driveImpulse.y, z: driveImpulse.z },
          true
        );

        // Drag/Friction as an impulse to cap max speed and prevent drifting sideways
        const lateralSpeed = velVec.dot(right);
        const mass = board.mass();
        const lateralFrictionImpulse = right
          .clone()
          .multiplyScalar(-lateralSpeed * mass * 0.45); // Damps 45% of lateral velocity per frame
        board.applyImpulse(
          {
            x: lateralFrictionImpulse.x,
            y: lateralFrictionImpulse.y,
            z: lateralFrictionImpulse.z,
          },
          true
        );

        // Steering torque
        let steerMag = 0.0;
        if (this.keys.a || this.keys.ArrowLeft) {
          steerMag = 8.0; // Much weaker, more balanced steering torque
        } else if (this.keys.d || this.keys.ArrowRight) {
          steerMag = -8.0;
        }
        // Steer rotates yaw (local Y)
        board.applyTorqueImpulse({ x: 0, y: steerMag * dt, z: 0 }, true);

        // Jump (Ollie)
        if (this.keys.Space) {
          // Downward pop impulse on board back, upward push on board center
          board.applyImpulse({ x: 0, y: 3.2, z: 0 }, true); // Reduced from 8.5
          // Brief pitch-up rotation torque
          board.applyTorqueImpulse({ x: -0.6, y: 0, z: 0 }, true); // Reduced from -2.5
          this.isGrounded = false;
        }

        // Ground Stabilization Torque (Aligns pitch/roll with ground normal)
        const avgNormal = new THREE.Vector3(0, 1, 0);
        groundNormals.forEach((n) => avgNormal.add(n));
        avgNormal.normalize();

        const tiltAxis = new THREE.Vector3().crossVectors(up, avgNormal);
        const sinTilt = tiltAxis.length();
        if (sinTilt > 0.001) {
          tiltAxis.normalize();
          const cosTilt = up.dot(avgNormal);
          const angle = Math.atan2(sinTilt, cosTilt);

          // Proportional spring torque (moderate impulse)
          const stiffness = 0.25;
          const restoreTorque = tiltAxis.multiplyScalar(angle * stiffness);

          board.applyTorqueImpulse(restoreTorque, true);
        }

        // Crash conditions:
        // A. Landed completely upside down
        if (up.y < 0.25) {
          this.player.crash();
        }
        // B. Extremely hard impact drops vertical velocity massively
        if (this.lastVerticalVelocity < -15.0) {
          this.player.crash();
        }
      } else {
        // IN AIR: Allow free rotation flips/spins
        this.wasGroundedLast = false;
        this.airTime += dt;

        let spinTorque = 0;
        let flipTorque = 0;
        let rollTorque = 0;

        if (this.keys.a || this.keys.ArrowLeft) {
          spinTorque = 12.0; // Spin (Yaw)
        } else if (this.keys.d || this.keys.ArrowRight) {
          spinTorque = -12.0;
        }

        if (this.keys.w || this.keys.ArrowUp) {
          flipTorque = 12.0; // Flip (Pitch)
        } else if (this.keys.s || this.keys.ArrowDown) {
          flipTorque = -12.0;
        }

        // Roll tricks
        if (this.keys.a && this.keys.w) rollTorque = -8.0;
        if (this.keys.d && this.keys.w) rollTorque = 8.0;

        // Apply rotation control torque
        const airTorque = new THREE.Vector3(
          flipTorque,
          spinTorque,
          rollTorque
        ).applyQuaternion(rotQ);
        board.applyTorqueImpulse(
          { x: airTorque.x * dt, y: airTorque.y * dt, z: airTorque.z * dt },
          true
        );

        // Track air rotation angles
        const deltaQ = rotQ
          .clone()
          .multiply(this.lastQuaternion.clone().invert());
        const euler = new THREE.Euler().setFromQuaternion(deltaQ, "YXZ");
        this.accumulatedYaw += euler.y;
        this.accumulatedPitch += euler.x;
        this.accumulatedRoll += euler.z;

        this.trackAirTricks();

        // Check if we hit a grinding rail while in mid-air
        this.checkRailGrind();
      }
    }

    this.lastQuaternion.copy(rotQ);
    this.wasGroundedLast = this.isGrounded || this.grindRail !== null;

    // Welded FixedJoint (riderJoint) keeps torso stable and aligned while riding,
    // avoiding the need for manual balance torque forces that conflict with the joint solver.

    // Step the physics engine
    this.world.step();
  }

  checkRailGrind() {
    const bp = this.player.boardBody.translation();
    const boardPos = new THREE.Vector3(bp.x, bp.y, bp.z);
    const velocity = this.player.boardBody.linvel();

    // Only grind if descending
    if (velocity.y > 0.5) return;

    // Loop through rails in active chunks
    this.activeChunks.forEach((chunk) => {
      chunk.rails.forEach((rail) => {
        // Project board position onto rail cylinder line segment
        const ab = new THREE.Vector3().subVectors(rail.end, rail.start);
        const ap = boardPos.clone().sub(rail.start);
        const abLenSq = ab.lengthSq();
        let t = ab.dot(ap) / abLenSq;
        t = Math.max(0, Math.min(1, t));

        const projection = rail.start.clone().add(ab.multiplyScalar(t));
        const dist = boardPos.distanceTo(projection);

        // If close enough and landing onto rail
        if (dist < 0.65) {
          const railDir = ab.clone().normalize();
          const velVec = new THREE.Vector3(velocity.x, velocity.y, velocity.z);

          this.grindRail = rail;
          this.grindT = t;
          this.grindSpeed = velVec.dot(railDir);

          // Provide minimum sliding velocity
          if (Math.abs(this.grindSpeed) < 6.0) {
            this.grindSpeed = Math.sign(this.grindSpeed || 1) * 6.0;
          }
          this.isGrounded = true;
        }
      });
    });
  }

  trackAirTricks() {
    const yawDeg = Math.round((this.accumulatedYaw * 180) / Math.PI);
    const pitchDeg = Math.round((this.accumulatedPitch * 180) / Math.PI);
    const rollDeg = Math.round((this.accumulatedRoll * 180) / Math.PI);

    let detected = "";

    // 1. Spins (Yaw)
    if (Math.abs(yawDeg) >= 150) {
      const spins = Math.round(Math.abs(yawDeg) / 180) * 180;
      detected = `${spins}° Spin`;
    }

    // 2. Flips (Pitch / Roll)
    if (Math.abs(pitchDeg) >= 150) {
      const flips = Math.round(Math.abs(pitchDeg) / 360);
      detected = detected
        ? `${detected} Kickflip`
        : flips > 1
          ? `${flips}x Frontflip`
          : "Kickflip";
    } else if (Math.abs(rollDeg) >= 150) {
      const rolls = Math.round(Math.abs(rollDeg) / 360);
      detected = detected
        ? `${detected} Shuvit`
        : rolls > 1
          ? `${rolls}x Backflip`
          : "Backflip";
    }

    if (detected && !this.currentTrickCombo.includes(detected)) {
      this.currentTrickCombo.push(detected);
      this.showTrickAlert(detected, this.currentTrickCombo.length * 200);
    }
  }

  showTrickAlert(name: string, pts: number) {
    const banner = document.getElementById("center-message");
    const nameEl = document.getElementById("trick-name");
    const ptsEl = document.getElementById("trick-pts");

    if (banner && nameEl && ptsEl) {
      banner.classList.remove("hidden");
      nameEl.innerText = name;
      ptsEl.innerText = `+${pts} pts`;

      nameEl.classList.remove("pop-out");
      void nameEl.offsetWidth; // Reflow reset animation
      nameEl.classList.add("pop-out");
    }
  }

  landTrick() {
    // Landed successfully! Apply score
    if (this.currentTrickCombo.length > 0) {
      let comboPts = 0;
      this.currentTrickCombo.forEach((trick) => {
        // Base points: Grinds = 400, Flips/Spins = 500
        comboPts +=
          trick.includes("Grind") || trick.includes("slide") ? 400 : 500;
      });

      const gainedScore = comboPts * this.multiplier;
      this.score += gainedScore;
      this.multiplier++;

      // Update HUD
      const scoreVal = document.getElementById("score-val");
      if (scoreVal) scoreVal.innerText = this.score.toString();
      const multVal = document.getElementById("multiplier-val");
      if (multVal) multVal.innerText = `x${this.multiplier}`;

      // Populate Combo trick list
      const tricksList = document.getElementById("combo-tricks");
      if (tricksList) {
        this.currentTrickCombo.forEach((trick) => {
          const div = document.createElement("div");
          div.classList.add("combo-item");
          div.innerHTML = `<span>${trick}</span><span>+${trick.includes("Grind") ? 400 : 500}</span>`;
          tricksList.appendChild(div);
        });
      }

      // Hide trick alerts after short delay
      setTimeout(() => {
        const banner = document.getElementById("center-message");
        if (banner) banner.classList.add("hidden");
      }, 1500);
    }

    this.currentTrickCombo = [];
    this.accumulatedYaw = 0.0;
    this.accumulatedPitch = 0.0;
    this.accumulatedRoll = 0.0;
    this.airTime = 0.0;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = 1 / 60; // Locked frame step for physics stability

    // 1. Physics Step & Controls
    this.updatePhysics(dt);

    // 2. Load/Unload Terrain chunks
    this.updateChunks();

    // 3. Sync visual models
    this.player.syncVisuals(dt);

    // 4. Follow Camera rotation & translation
    this.updateCamera();

    // 5. Update Point Light following player
    const bp = this.player.boardBody.translation();
    const light = this.scene.userData.playerLight as THREE.PointLight;
    if (light) {
      light.position.set(bp.x, bp.y + 2.0, bp.z);
    }

    // 6. Update HUD Stats
    const velocity = this.player.boardBody.linvel();
    const speed = Math.round(
      Math.sqrt(
        velocity.x * velocity.x +
          velocity.y * velocity.y +
          velocity.z * velocity.z
      ) * 3.6
    ); // m/s to km/h
    const speedVal = document.getElementById("speed-val");
    if (speedVal) speedVal.innerText = speed.toString();

    const airTimeVal = document.getElementById("airtime-val");
    if (airTimeVal) {
      airTimeVal.innerText = `${this.airTime.toFixed(1)}s`;
    }

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera() {
    const bp = this.player.crashed
      ? this.player.head.body.translation()
      : this.player.boardBody.translation();
    const targetPos = new THREE.Vector3(bp.x, bp.y, bp.z);

    const distance = 6.2;
    const height = this.player.crashed ? 1.2 : 2.4;

    // Camera follow uses standard spherical coordinates relative to player center
    const targetOffset = new THREE.Vector3(
      distance * Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
      height + distance * Math.sin(this.cameraPitch),
      distance * Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
    );

    const targetCamPos = targetPos.clone().add(targetOffset);

    // Smoothly ease camera positioning
    this.camera.position.lerp(targetCamPos, 0.12);
    this.camera.lookAt(
      targetPos
        .clone()
        .add(new THREE.Vector3(0, this.player.crashed ? 0 : 0.6, 0))
    ); // Focus target point
  }
}

// Start Simulator
new SkateSimulator();
