import * as THREE from "three";
import RAPIER from "@dimforge/rapier2d-compat";

// ==========================================
// 1. DETERMINISTIC SEEDED RANDOM & NOISE
// ==========================================

function createSeededRandom(seed: number) {
  let h = seed ^ 0xdeadbeef;
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

class PerlinNoise2D {
  private p: number[] = Array.from({ length: 512 }, () => 0);

  constructor(seed = 12345) {
    const random = createSeededRandom(seed);
    const permutation = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = permutation[i]!;
      permutation[i] = permutation[j]!;
      permutation[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255]!;
    }
  }

  private fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number) {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  }

  public noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.p[this.p[X]! + Y]!;
    const ab = this.p[this.p[X]! + Y + 1]!;
    const ba = this.p[this.p[X + 1]! + Y]!;
    const bb = this.p[this.p[X + 1]! + Y + 1]!;

    return this.lerp(
      v,
      this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf)),
      this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1))
    );
  }
}

const noiseGen = new PerlinNoise2D(54321);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function sampleHeight(x: number, z: number): number {
  // Plains vs Mountains macro-noise
  const macro = (noiseGen.noise(x * 0.00015, z * 0.00015) + 1) * 0.5;
  const mountainBlend = smoothstep(0.35, 0.7, macro);

  // Large mountain structures
  let hillVal = 0;
  let amp = 1.0;
  let freq = 1.0;
  for (let i = 0; i < 4; i++) {
    hillVal += noiseGen.noise(x * 0.0015 * freq, z * 0.0015 * freq) * amp;
    amp *= 0.5;
    freq *= 2.1;
  }

  // Micro details / bumpy texture
  let detailVal = 0;
  let detailAmp = 1.0;
  let detailFreq = 1.0;
  for (let i = 0; i < 3; i++) {
    detailVal +=
      noiseGen.noise(x * 0.015 * detailFreq, z * 0.015 * detailFreq) *
      detailAmp;
    detailAmp *= 0.4;
    detailFreq *= 2.3;
  }

  const plainHeight = hillVal * 10.0 + detailVal * 2.0;
  const mountainHeight = hillVal * 120.0 + detailVal * 5.0;

  return THREE.MathUtils.lerp(plainHeight, mountainHeight, mountainBlend);
}

// ==========================================
// 2. CONFIGURATION & TYPES
// ==========================================

const CHUNK_SIZE = 120;
const CHUNK_SEGMENTS = 30;
const CHUNK_RADIUS = 3; // Number of chunks loaded around player in each direction

interface DebrisPiece {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  type: "smoke" | "exhaust" | "fire" | "spark";
}

class TerrainChunk {
  public mesh: THREE.Mesh;
  public staticColliders: RAPIER.Collider[] = [];
  public staticBodies: RAPIER.RigidBody[] = [];

  constructor(
    cx: number,
    cz: number,
    scene: THREE.Scene,
    physicsWorld: RAPIER.World
  ) {
    const geom = new THREE.BufferGeometry();
    const verticesCount = (CHUNK_SEGMENTS + 1) * (CHUNK_SEGMENTS + 1);

    const positions = new Float32Array(verticesCount * 3);
    const indices: number[] = [];

    const startX = cx * CHUNK_SIZE;
    const startZ = cz * CHUNK_SIZE;
    const step = CHUNK_SIZE / CHUNK_SEGMENTS;

    // Generate grid points
    let idx = 0;
    for (let j = 0; j <= CHUNK_SEGMENTS; j++) {
      const z = startZ + j * step;
      for (let i = 0; i <= CHUNK_SEGMENTS; i++) {
        const x = startX + i * step;
        const y = sampleHeight(x, z);

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        idx++;
      }
    }

    // Generate indices
    for (let j = 0; j < CHUNK_SEGMENTS; j++) {
      for (let i = 0; i < CHUNK_SEGMENTS; i++) {
        const r0 = j * (CHUNK_SEGMENTS + 1) + i;
        const r1 = r0 + (CHUNK_SEGMENTS + 1);

        // Triangle 1
        indices.push(r0, r1, r0 + 1);
        // Triangle 2
        indices.push(r0 + 1, r1, r1 + 1);
      }
    }

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Custom Vertex Coloring for Gritty Realism
    const normalsAttr = geom.getAttribute("normal");
    const colors = new Float32Array(verticesCount * 3);

    for (let i = 0; i < verticesCount; i++) {
      const y = positions[i * 3 + 1]!;
      const ny = normalsAttr.getY(i); // vertical alignment

      const hFactor = THREE.MathUtils.clamp((y + 15) / 100, 0, 1);
      const slopeFactor = THREE.MathUtils.clamp(ny, 0, 1);

      const color = new THREE.Color();
      if (hFactor < 0.2) {
        // Deep ravines / Valley
        color.setRGB(0.12, 0.13, 0.15); // very dark carbon grey
      } else if (hFactor < 0.6) {
        // Flat plains
        const dryGrass = new THREE.Color(0.24, 0.25, 0.2);
        const dryDust = new THREE.Color(0.34, 0.3, 0.24);
        const t = (hFactor - 0.2) / 0.4;
        color.copy(dryGrass).lerp(dryDust, t);
      } else {
        // Mountain Peaks
        const dryDust = new THREE.Color(0.34, 0.3, 0.24);
        const coldRock = new THREE.Color(0.18, 0.19, 0.22);
        const t = (hFactor - 0.6) / 0.4;
        color.copy(dryDust).lerp(coldRock, t);
      }

      // Darken steep cliffs for geometrical relief
      const slopeDarkening = THREE.MathUtils.lerp(0.35, 1.0, slopeFactor);
      color.multiplyScalar(slopeDarkening);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true,
      vertexColors: true,
    });

    this.mesh = new THREE.Mesh(geom, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Procedural Obstacles
    const chunkSeed = (cx * 73939) ^ (cz * 47437);
    const rand = createSeededRandom(chunkSeed);

    // Grid-based sub-divisions to ensure separation
    const subGridCount = 4;
    const subGridWidth = CHUNK_SIZE / subGridCount;

    for (let gx = 0; gx < subGridCount; gx++) {
      for (let gz = 0; gz < subGridCount; gz++) {
        // Skip some sub-grids to avoid over-crowding
        if (rand() > 0.28) continue;

        const lx = (gx + 0.1 + rand() * 0.8) * subGridWidth;
        const lz = (gz + 0.1 + rand() * 0.8) * subGridWidth;
        const worldX = startX + lx;
        const worldZ = startZ + lz;

        // Keep starting region empty of obstacles
        const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
        if (distFromCenter < 50) continue;

        const obstacleY = sampleHeight(worldX, worldZ);
        const obstacleType = rand();

        if (obstacleType < 0.35) {
          // 1. Concrete Pillar / Column
          const height = 8.0 + rand() * 4.0;
          const radius = 1.2 + rand() * 0.8;

          const pillarGeom = new THREE.CylinderGeometry(
            radius * 0.8,
            radius,
            height,
            6
          );
          const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x3e424b,
            roughness: 0.85,
            metalness: 0.1,
            flatShading: true,
          });

          // Hazard tape stripe around it
          const stripeGeom = new THREE.CylinderGeometry(
            radius * 0.88,
            radius * 0.91,
            1.2,
            6
          );
          const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe5c158 }); // Yellow Warning Band
          const stripeMesh = new THREE.Mesh(stripeGeom, stripeMat);
          stripeMesh.position.y = 1.0;

          const pillar = new THREE.Mesh(pillarGeom, pillarMat);
          pillar.position.set(worldX, obstacleY + height * 0.5, worldZ);
          pillar.castShadow = true;
          pillar.receiveShadow = true;
          pillar.add(stripeMesh);
          this.mesh.add(pillar);

          // Physics Collider (Static body, Circle shape)
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            worldX,
            worldZ
          );
          const body = physicsWorld.createRigidBody(bodyDesc);
          const colliderDesc = RAPIER.ColliderDesc.ball(radius);
          const col = physicsWorld.createCollider(colliderDesc, body);

          this.staticBodies.push(body);
          this.staticColliders.push(col);
        } else if (obstacleType < 0.7) {
          // 2. Large Low-Poly Boulder
          const radius = 2.5 + rand() * 2.5;
          const boulderGeom = new THREE.DodecahedronGeometry(radius, 1);

          // Randomize vertices slightly to make it look jagged
          const posAttr = boulderGeom.attributes.position!;
          for (let k = 0; k < posAttr.count; k++) {
            posAttr.setX(k, posAttr.getX(k) + (rand() - 0.5) * 0.4);
            posAttr.setY(k, posAttr.getY(k) + (rand() - 0.5) * 0.4);
            posAttr.setZ(k, posAttr.getZ(k) + (rand() - 0.5) * 0.4);
          }
          boulderGeom.computeVertexNormals();

          const boulderMat = new THREE.MeshStandardMaterial({
            color: 0x4f4944,
            roughness: 0.95,
            metalness: 0.05,
            flatShading: true,
          });
          const boulder = new THREE.Mesh(boulderGeom, boulderMat);
          // Keep it buried slightly in the ground
          boulder.position.set(worldX, obstacleY + radius * 0.7, worldZ);
          boulder.castShadow = true;
          boulder.receiveShadow = true;
          this.mesh.add(boulder);

          // Physics Collider (Static body, Circle shape)
          const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
            worldX,
            worldZ
          );
          const body = physicsWorld.createRigidBody(bodyDesc);
          const colliderDesc = RAPIER.ColliderDesc.ball(radius * 0.9);
          const col = physicsWorld.createCollider(colliderDesc, body);

          this.staticBodies.push(body);
          this.staticColliders.push(col);
        } else {
          // 3. Rusty Steel Barrier
          const width = 2.0;
          const height = 3.0;
          const length = 7.0 + rand() * 4.0;
          const angle = rand() * Math.PI;

          const boxGeom = new THREE.BoxGeometry(width, height, length);
          const boxMat = new THREE.MeshStandardMaterial({
            color: 0x5a2d24, // Rusty Red-brown
            roughness: 0.8,
            metalness: 0.6,
            flatShading: true,
          });
          const barrier = new THREE.Mesh(boxGeom, boxMat);
          barrier.position.set(worldX, obstacleY + height * 0.5, worldZ);
          barrier.rotation.y = angle;
          barrier.castShadow = true;
          barrier.receiveShadow = true;
          this.mesh.add(barrier);

          // Physics Collider (Static body, Rotated cuboid)
          const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(worldX, worldZ)
            .setRotation(angle);
          const body = physicsWorld.createRigidBody(bodyDesc);
          const colliderDesc = RAPIER.ColliderDesc.cuboid(
            width * 0.5,
            length * 0.5
          );
          const col = physicsWorld.createCollider(colliderDesc, body);

          this.staticBodies.push(body);
          this.staticColliders.push(col);
        }
      }
    }
  }

  public dispose(scene: THREE.Scene, physicsWorld: RAPIER.World) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((mat) => mat.dispose());
    } else {
      this.mesh.material.dispose();
    }

    // Destroy Rapier static colliders and bodies
    this.staticColliders.forEach((col) => {
      physicsWorld.removeCollider(col, false);
    });
    this.staticBodies.forEach((body) => {
      physicsWorld.removeRigidBody(body);
    });

    this.staticColliders = [];
    this.staticBodies = [];
  }
}

// ==========================================
// 3. PROGRAMMATIC AUDIO ENGINE (Web Audio API)
// ==========================================

class AudioController {
  private ctx: AudioContext | null = null;

  // Engine sound structures
  private engineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private currentGear = 1;

  // Tire slip / Braking noise structures
  private noiseSource: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  // High pitch wheel squeal
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;

  constructor() {}

  public init() {
    if (this.ctx) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    this.setupEngine();
    this.setupScreech();
  }

  private setupEngine() {
    if (!this.ctx) return;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 320; // Muffled base rumble

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
  }

  private setupScreech() {
    if (!this.ctx) return;

    // White noise buffer
    const bufferSize = this.ctx.sampleRate * 2.0;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2.0 - 1.0;
    }

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = "bandpass";
    this.screechFilter.Q.value = 4.0;
    this.screechFilter.frequency.value = 950;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    this.noiseSource.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.ctx.destination);
    this.noiseSource.start();

    // High squeal tone
    this.squealOsc = this.ctx.createOscillator();
    this.squealOsc.type = "triangle";
    this.squealOsc.frequency.value = 1400;

    this.squealGain = this.ctx.createGain();
    this.squealGain.gain.value = 0.0;

    this.squealOsc.connect(this.squealGain);
    this.squealGain.connect(this.ctx.destination);
    this.squealOsc.start();
  }

  public updateEngineSound(speed: number, throttle: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter)
      return;

    const absSpeed = Math.abs(speed);

    // Compute Gear & RPM ratio
    let gear: number;
    let ratio: number;
    if (absSpeed < 10) {
      gear = 1;
      ratio = absSpeed / 10;
    } else if (absSpeed < 25) {
      gear = 2;
      ratio = (absSpeed - 10) / 15;
    } else if (absSpeed < 50) {
      gear = 3;
      ratio = (absSpeed - 25) / 25;
    } else if (absSpeed < 85) {
      gear = 4;
      ratio = (absSpeed - 50) / 35;
    } else {
      gear = 5;
      ratio = Math.min((absSpeed - 85) / 150, 1.0);
    }

    const gearRanges = [
      { min: 55, max: 110 }, // Gear 1
      { min: 70, max: 140 }, // Gear 2
      { min: 85, max: 175 }, // Gear 3
      { min: 100, max: 210 }, // Gear 4
      { min: 115, max: 250 }, // Gear 5
    ];

    const range = gearRanges[gear - 1] || { min: 100, max: 200 };
    const targetFreq = range.min + ratio * (range.max - range.min);

    // Shift gear clutch dip
    if (gear !== this.currentGear) {
      this.currentGear = gear;
      this.engineOsc.frequency.cancelScheduledValues(this.ctx.currentTime);
      this.engineOsc.frequency.setValueAtTime(
        range.min * 0.72,
        this.ctx.currentTime
      );
      this.engineOsc.frequency.exponentialRampToValueAtTime(
        targetFreq,
        this.ctx.currentTime + 0.22
      );
    } else {
      this.engineOsc.frequency.setTargetAtTime(
        targetFreq,
        this.ctx.currentTime,
        0.08
      );
    }

    // Engine filter load: sounds deeper when accelerating
    const filterFreq = 260 + (throttle > 0 ? 280 : 0) + ratio * 350;
    this.engineFilter.frequency.setTargetAtTime(
      filterFreq,
      this.ctx.currentTime,
      0.1
    );

    // Volume curves
    const baseVol = 0.12;
    const throttleVol = throttle > 0 ? 0.08 : 0.03;
    const targetVol = baseVol + throttleVol + ratio * 0.06;
    this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
  }

  public updateScreech(lateralSpeed: number, isBraking: boolean) {
    if (
      !this.ctx ||
      !this.screechGain ||
      !this.screechFilter ||
      !this.squealGain ||
      !this.squealOsc
    )
      return;

    const absLat = Math.abs(lateralSpeed);

    let screechVol = 0.0;
    let squealVol = 0.0;
    let screechFreq = 950;
    let squealFreq = 1400;

    if (absLat > 2.8) {
      // Drifting slide
      const factor = Math.min((absLat - 2.8) / 15.0, 1.0);
      screechVol = 0.08 + factor * 0.28;
      squealVol = 0.02 + factor * 0.07;

      screechFreq = 950 + factor * 750;
      squealFreq = 1400 + factor * 800;
    }

    if (isBraking) {
      screechVol = Math.max(screechVol, 0.18);
      screechFreq = Math.max(screechFreq, 750);
    }

    this.screechGain.gain.setTargetAtTime(
      screechVol,
      this.ctx.currentTime,
      0.08
    );
    this.screechFilter.frequency.setTargetAtTime(
      screechFreq,
      this.ctx.currentTime,
      0.08
    );

    this.squealGain.gain.setTargetAtTime(squealVol, this.ctx.currentTime, 0.08);
    this.squealOsc.frequency.setTargetAtTime(
      squealFreq,
      this.ctx.currentTime,
      0.08
    );
  }

  public playBeep() {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 980;

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
  }

  public playExplosion() {
    if (!this.ctx) return;

    // Shut down engine / screech
    if (this.engineGain) this.engineGain.gain.value = 0.0;
    if (this.screechGain) this.screechGain.gain.value = 0.0;
    if (this.squealGain) this.squealGain.gain.value = 0.0;

    // Base rumble
    const rumble = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    rumble.type = "sawtooth";
    rumble.frequency.setValueAtTime(200, this.ctx.currentTime);
    rumble.frequency.exponentialRampToValueAtTime(
      25,
      this.ctx.currentTime + 1.2
    );

    rumbleGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
    rumbleGain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + 1.5
    );

    rumble.connect(rumbleGain);
    rumbleGain.connect(this.ctx.destination);
    rumble.start();
    rumble.stop(this.ctx.currentTime + 1.6);

    // Blast noise buffer
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2.0 - 1.0;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(550, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(
      60,
      this.ctx.currentTime + 1.0
    );

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55, this.ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + 1.3
    );

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start();
  }

  public playShutdown() {
    if (!this.ctx) return;

    if (this.engineGain)
      this.engineGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.2);
    if (this.screechGain)
      this.screechGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.2);
    if (this.squealGain)
      this.squealGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.2);

    // Generator shut down hum
    const sweep = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    sweep.type = "sine";
    sweep.frequency.setValueAtTime(620, this.ctx.currentTime);
    sweep.frequency.exponentialRampToValueAtTime(
      30,
      this.ctx.currentTime + 1.3
    );

    gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.4);

    sweep.connect(gain);
    gain.connect(this.ctx.destination);
    sweep.start();
    sweep.stop(this.ctx.currentTime + 1.5);
  }

  public playStartup() {
    if (!this.ctx) return;

    const chime = (freq: number, start: number, duration: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + start);

      gain.gain.setValueAtTime(0.0, this.ctx!.currentTime);
      gain.gain.setValueAtTime(0.18, this.ctx!.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.ctx!.currentTime + start + duration
      );

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(this.ctx!.currentTime + start);
      osc.stop(this.ctx!.currentTime + start + duration + 0.1);
    };

    chime(330, 0.0, 0.15); // E4
    chime(440, 0.12, 0.15); // A4
    chime(660, 0.24, 0.35); // E5
  }
}

// ==========================================
// 4. MAIN GAME CONTROLLER
// ==========================================

class Game {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private dirLight!: THREE.DirectionalLight;

  // Physics
  private physicsWorld!: RAPIER.World;
  private carBody!: RAPIER.RigidBody;
  private carCollider!: RAPIER.Collider;

  // Car Meshes
  private carGroup!: THREE.Group;
  private carParts: {
    mesh: THREE.Object3D;
    localPos: THREE.Vector3;
    localRot: THREE.Euler;
  }[] = [];
  private wheelsPivotFrontLeft!: THREE.Group;
  private wheelsPivotFrontRight!: THREE.Group;
  private wheelsRearLeft!: THREE.Mesh;
  private wheelsRearRight!: THREE.Mesh;
  private wheelFrontLeft!: THREE.Mesh;
  private wheelFrontRight!: THREE.Mesh;

  private tailLights: THREE.Mesh[] = [];
  private headLights: THREE.SpotLight[] = [];

  // Procedural landscape
  private chunks = new Map<string, TerrainChunk>();
  private lastChunkX = 99999;
  private lastChunkZ = 99999;

  // Key listeners
  private keys: Record<string, boolean> = {};

  // Game states
  private isStarted = false;
  private isPaused = false;
  private isCrashed = false;
  private currentSpeed = 0;
  private peakSpeed = 0;
  private totalDistance = 0;
  private startPosition = new THREE.Vector2(0, 0);

  // Time tracking
  private prevTime = 0;
  private prevVelocity = new THREE.Vector2(0, 0);
  private carPitch = 0;
  private carRoll = 0;
  private timeRemaining = 60.0;
  private isTimeExpired = false;
  private lastSecBeep = -1;
  private audioController = new AudioController();

  // Debris & Particles
  private debrisList: DebrisPiece[] = [];
  private particleList: Particle[] = [];
  private dustPoints!: THREE.Points;

  // Spin values
  private wheelSpinAngle = 0;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.initThree();
    this.initDust();
    this.setupHUD();
    this.bindEvents();
  }

  private initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    // Dense gritty dark atmospheric fog
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 10, -15);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.12);
    this.scene.add(ambientLight);

    // Low Sun Light (Dawn/Dusk atmosphere casting long dramatic shadows)
    this.dirLight = new THREE.DirectionalLight(0xfff3e0, 0.45);
    this.dirLight.position.set(100, 60, -100);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 300;
    const d = 50;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
  }

  public async initPhysics() {
    // 2D Top-Down physics representation
    const gravity = { x: 0.0, y: 0.0 };
    this.physicsWorld = new RAPIER.World(gravity);

    // Create the car rigid body
    const carBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0.0, 0.0)
      .setLinearDamping(0.0) // No air resistance, allowing infinite acceleration
      .setAngularDamping(4.5) // Rotational dampening
      .setAdditionalMassProperties(
        2.5, // Mass
        { x: 0.0, y: 0.0 }, // Center of mass
        1.5 // Angular inertia
      );
    this.carBody = this.physicsWorld.createRigidBody(carBodyDesc);

    // 2.0 width x 4.2 length cuboid collider (represented as rectangular half-widths)
    const carColliderDesc = RAPIER.ColliderDesc.cuboid(1.0, 2.1);
    this.carCollider = this.physicsWorld.createCollider(
      carColliderDesc,
      this.carBody
    );

    // Generate initial terrain chunks
    this.updateTerrainChunks(0, 0);

    // Construct car mesh
    this.createCarMesh();
  }

  private createCarMesh() {
    this.carGroup = new THREE.Group();

    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x2e352b, // Dark olive green
      roughness: 0.85,
      metalness: 0.2,
      flatShading: true,
    });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x181a1b, // Matte Carbon Black
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111213, // Charcoal tire
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffeaad }); // Lit headlights
    const tailLampMat = new THREE.MeshBasicMaterial({ color: 0x550000 }); // Inactive tail lights

    // Note: Car is built facing local +X axis (Forward = +X, Right = -Z)
    // 1. Chassis Base
    const chassisBase = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.4, 2.0),
      chassisMat
    );
    chassisBase.position.y = 0.2;
    chassisBase.castShadow = true;
    chassisBase.receiveShadow = true;
    this.carGroup.add(chassisBase);

    // 2. Cabin Structure
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.6, 1.8),
      cabinMat
    );
    cabin.position.set(-0.4, 0.7, 0.0);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    this.carGroup.add(cabin);

    // 3. Headlights (Lamps)
    const lampGeom = new THREE.BoxGeometry(0.1, 0.2, 0.3);
    const leftLamp = new THREE.Mesh(lampGeom, lampMat);
    leftLamp.position.set(2.1, 0.2, 0.7);
    const rightLamp = leftLamp.clone();
    rightLamp.position.z = -0.7;
    this.carGroup.add(leftLamp);
    this.carGroup.add(rightLamp);

    // Headlight Spotlights pointing forward (+X)
    const headlightTarget = new THREE.Object3D();
    headlightTarget.position.set(15, 0.2, 0);
    this.carGroup.add(headlightTarget);

    const makeHeadlight = (offsetZ: number) => {
      const spot = new THREE.SpotLight(
        0xffeaad,
        16.0,
        45,
        Math.PI / 5,
        0.6,
        1.0
      );
      spot.position.set(2.1, 0.2, offsetZ);
      spot.target = headlightTarget;
      spot.castShadow = true;
      spot.shadow.mapSize.width = 512;
      spot.shadow.mapSize.height = 512;
      spot.shadow.bias = -0.001;
      this.carGroup.add(spot);
      this.headLights.push(spot);
    };
    makeHeadlight(0.7);
    makeHeadlight(-0.7);

    // 4. Red Brake/Tail lights
    const tailLampGeom = new THREE.BoxGeometry(0.1, 0.2, 0.3);
    const leftTail = new THREE.Mesh(tailLampGeom, tailLampMat);
    leftTail.position.set(-2.1, 0.2, 0.7);
    const rightTail = leftTail.clone();
    rightTail.position.z = -0.7;
    this.carGroup.add(leftTail);
    this.carGroup.add(rightTail);
    this.tailLights.push(leftTail, rightTail);

    // 5. Exhaust tailpipe
    const pipeGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6);
    pipeGeom.rotateZ(Math.PI / 2);
    const pipe = new THREE.Mesh(pipeGeom, cabinMat);
    pipe.position.set(-2.1, 0.05, -0.6);
    this.carGroup.add(pipe);

    // 6. Wheels (Hexagonal Cylinders aligned on Z axis)
    const wheelGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 6);
    wheelGeom.rotateX(Math.PI / 2);

    // Rear Wheels (fixed)
    this.wheelsRearLeft = new THREE.Mesh(wheelGeom, wheelMat);
    this.wheelsRearLeft.position.set(-1.4, 0.0, 1.15);
    this.wheelsRearLeft.castShadow = true;
    this.carGroup.add(this.wheelsRearLeft);

    this.wheelsRearRight = new THREE.Mesh(wheelGeom, wheelMat);
    this.wheelsRearRight.position.set(-1.4, 0.0, -1.15);
    this.wheelsRearRight.castShadow = true;
    this.carGroup.add(this.wheelsRearRight);

    // Front Wheels pivots (to tilt left/right during steering)
    this.wheelsPivotFrontLeft = new THREE.Group();
    this.wheelsPivotFrontLeft.position.set(1.4, 0.0, 1.15);
    this.wheelFrontLeft = new THREE.Mesh(wheelGeom, wheelMat);
    this.wheelFrontLeft.castShadow = true;
    this.wheelsPivotFrontLeft.add(this.wheelFrontLeft);
    this.carGroup.add(this.wheelsPivotFrontLeft);

    this.wheelsPivotFrontRight = new THREE.Group();
    this.wheelsPivotFrontRight.position.set(1.4, 0.0, -1.15);
    this.wheelFrontRight = new THREE.Mesh(wheelGeom, wheelMat);
    this.wheelFrontRight.castShadow = true;
    this.wheelsPivotFrontRight.add(this.wheelFrontRight);
    this.carGroup.add(this.wheelsPivotFrontRight);

    this.scene.add(this.carGroup);

    // Store references to car parts to spawn as debris upon crash
    this.carParts = [
      {
        mesh: chassisBase,
        localPos: chassisBase.position.clone(),
        localRot: chassisBase.rotation.clone(),
      },
      {
        mesh: cabin,
        localPos: cabin.position.clone(),
        localRot: cabin.rotation.clone(),
      },
      {
        mesh: this.wheelsRearLeft,
        localPos: this.wheelsRearLeft.position.clone(),
        localRot: this.wheelsRearLeft.rotation.clone(),
      },
      {
        mesh: this.wheelsRearRight,
        localPos: this.wheelsRearRight.position.clone(),
        localRot: this.wheelsRearRight.rotation.clone(),
      },
      {
        mesh: this.wheelsPivotFrontLeft,
        localPos: this.wheelsPivotFrontLeft.position.clone(),
        localRot: this.wheelsPivotFrontLeft.rotation.clone(),
      },
      {
        mesh: this.wheelsPivotFrontRight,
        localPos: this.wheelsPivotFrontRight.position.clone(),
        localRot: this.wheelsPivotFrontRight.rotation.clone(),
      },
    ];
  }

  private initDust() {
    // Ambient dust blowing through scene
    const count = 300;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9c8b74, // sandy dust
      size: 0.15,
      transparent: true,
      opacity: 0.45,
    });
    this.dustPoints = new THREE.Points(geom, mat);
    this.scene.add(this.dustPoints);
  }

  // ==========================================
  // 4. CONTROL LOOP & INPUT HANDLERS
  // ==========================================

  private bindEvents() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.key.toLowerCase()] = true;

      // Handle direct key triggers
      if (e.key.toLowerCase() === "r" && this.isCrashed) {
        this.restartGame();
      }
      if (e.key.toLowerCase() === "p" && this.isStarted && !this.isCrashed) {
        this.togglePause();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private setupHUD() {
    const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
    const btnResume = document.getElementById(
      "btn-resume"
    ) as HTMLButtonElement;
    const btnRestart = document.getElementById(
      "btn-restart"
    ) as HTMLButtonElement;

    btnStart.addEventListener("click", () => {
      this.audioController.init();
      this.audioController.playStartup();
      this.isStarted = true;
      document.getElementById("screen-start")?.classList.add("hidden");
      document.getElementById("hud")?.classList.remove("hidden");
      this.startPosition.set(
        this.carBody.translation().x,
        this.carBody.translation().y
      );
    });

    btnResume.addEventListener("click", () => {
      this.togglePause();
    });

    btnRestart.addEventListener("click", () => {
      this.restartGame();
    });
  }

  private togglePause() {
    this.isPaused = !this.isPaused;
    const screenPause = document.getElementById("screen-pause");
    if (this.isPaused) {
      screenPause?.classList.remove("hidden");
    } else {
      screenPause?.classList.add("hidden");
      this.prevTime = performance.now(); // reset delta to prevent huge jumps
    }
  }

  // ==========================================
  // 5. PROCEDURAL MAP LOADER
  // ==========================================

  private updateTerrainChunks(playerX: number, playerZ: number) {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);

    if (cx === this.lastChunkX && cz === this.lastChunkZ) return;

    this.lastChunkX = cx;
    this.lastChunkZ = cz;

    const activeKeys = new Set<string>();

    // Load chunks in radius
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
        const ncx = cx + dx;
        const ncz = cz + dz;
        const key = `${ncx},${ncz}`;
        activeKeys.add(key);

        if (!this.chunks.has(key)) {
          const chunk = new TerrainChunk(
            ncx,
            ncz,
            this.scene,
            this.physicsWorld
          );
          this.chunks.set(key, chunk);
        }
      }
    }

    // Dispose of out-of-range chunks
    this.chunks.forEach((chunk, key) => {
      if (!activeKeys.has(key)) {
        chunk.dispose(this.scene, this.physicsWorld);
        this.chunks.delete(key);
      }
    });
  }

  // ==========================================
  // 6. UPDATE ENGINE
  // ==========================================

  public run() {
    const loop = (time: number) => {
      requestAnimationFrame(loop);

      if (!this.prevTime) {
        this.prevTime = time;
        return;
      }
      const dt = Math.min((time - this.prevTime) / 1000, 0.1);
      this.prevTime = time;

      if (this.isStarted && !this.isPaused) {
        this.updatePhysics(dt);
        this.updateDebrisAndParticles(dt);
        this.updateHUD();
      }

      this.renderer.render(this.scene, this.camera);
    };

    requestAnimationFrame(loop);
  }

  private updatePhysics(dt: number) {
    // Countdown timer update
    if (
      this.isStarted &&
      !this.isPaused &&
      !this.isCrashed &&
      !this.isTimeExpired
    ) {
      this.timeRemaining = Math.max(this.timeRemaining - dt, 0.0);
      if (this.timeRemaining <= 0.0) {
        this.triggerTimeExpired();
      }

      const currentSec = Math.floor(this.timeRemaining);
      if (
        currentSec !== this.lastSecBeep &&
        this.timeRemaining < 10.0 &&
        this.timeRemaining > 0
      ) {
        this.lastSecBeep = currentSec;
        this.audioController.playBeep();
      }
    }

    if (this.isCrashed || this.isTimeExpired) {
      // Just step physics without driving input (helps particles/debris fall/car roll to stop)
      this.physicsWorld.step();
      return;
    }

    // --- driving forces ---
    const heading = this.carBody.rotation(); // 2D angle (rad)

    // Direction vectors:
    // +X is forward in local coords, so 2D dir is (cos, sin)
    const dir = new THREE.Vector2(Math.cos(heading), Math.sin(heading));
    const side = new THREE.Vector2(-Math.sin(heading), Math.cos(heading));

    const linVel = this.carBody.linvel();
    const velocity = new THREE.Vector2(linVel.x, linVel.y);
    this.currentSpeed = velocity.dot(dir); // forward speed

    // Peak speed telemetry
    const speedKmh = Math.abs(this.currentSpeed * 3.6);
    if (speedKmh > this.peakSpeed) {
      this.peakSpeed = speedKmh;
    }

    // Keyboard driving actions
    let throttleInput = 0;
    if (this.keys["w"] || this.keys["arrowup"]) throttleInput = 1.0;
    if (this.keys["s"] || this.keys["arrowdown"]) throttleInput = -0.5; // smaller reverse power

    let steerInput = 0;
    if (this.keys["a"] || this.keys["arrowleft"]) steerInput = -1.0; // steer left
    if (this.keys["d"] || this.keys["arrowright"]) steerInput = 1.0; // steer right

    const handbrake = !!this.keys[" "];

    // Constant thrust engine acceleration allowing infinite speed (accelerates forever)
    const baseAccel = 15.0; // High constant acceleration power
    const driveForce = throttleInput * baseAccel * this.carBody.mass();

    if (throttleInput !== 0) {
      // If braking (S pressed while moving forward), apply a stronger braking factor
      const isBraking = throttleInput < 0 && this.currentSpeed > 0.1;
      const brakeMult = isBraking ? 2.5 : 1.0;
      this.carBody.applyImpulse(
        {
          x: dir.x * driveForce * brakeMult * dt,
          y: dir.y * driveForce * brakeMult * dt,
        },
        true
      );
    }

    // Handle brake lighting
    const activeTailMat = new THREE.MeshBasicMaterial({ color: 0xff3333 }); // Bright red
    const inactiveTailMat = new THREE.MeshBasicMaterial({ color: 0x550000 }); // Muted red

    const isBraking =
      (throttleInput < 0 && this.currentSpeed > 0.1) || handbrake;
    this.tailLights.forEach((light) => {
      light.material = isBraking ? activeTailMat : inactiveTailMat;
    });

    // Handle Steering
    // Steering responsiveness scales with speed: no steering at zero speed,
    // maximum steering at mid speeds, and stabilizing at very high speeds.
    const speedRatio = THREE.MathUtils.clamp(
      Math.abs(this.currentSpeed) / 10.0,
      0.0,
      1.0
    );
    const speedStabilizer = THREE.MathUtils.clamp(
      1.2 - Math.abs(this.currentSpeed) / 200.0,
      0.2,
      1.0
    );
    const steerDir = this.currentSpeed >= 0 ? 1 : -1;
    const targetAngularVel =
      steerInput * 2.8 * speedRatio * speedStabilizer * steerDir;

    // Apply steering torque or set velocity directly for responsive low-poly handling
    this.carBody.setAngvel(targetAngularVel, true);

    // Front Wheel Pivot Steering angle
    const targetSteerAngle = steerInput * 0.45;
    this.wheelsPivotFrontLeft.rotation.y = THREE.MathUtils.lerp(
      this.wheelsPivotFrontLeft.rotation.y,
      targetSteerAngle,
      0.15
    );
    this.wheelsPivotFrontRight.rotation.y = THREE.MathUtils.lerp(
      this.wheelsPivotFrontRight.rotation.y,
      targetSteerAngle,
      0.15
    );

    // Wheel Spin animation (rotating along the correct Z axle)
    const spinSpeed = -(this.currentSpeed / 0.5) * dt; // Inverted spin direction
    this.wheelSpinAngle += spinSpeed;
    this.wheelsRearLeft.rotation.z = this.wheelSpinAngle;
    this.wheelsRearRight.rotation.z = this.wheelSpinAngle;
    this.wheelFrontLeft.rotation.z = this.wheelSpinAngle;
    this.wheelFrontRight.rotation.z = this.wheelSpinAngle;

    // --- Lateral tire friction (Cancels out sideslip, handles drifts) ---
    const lateralSpeed = velocity.dot(side);
    // Lower grip when handbrake active = slides longer (satisfying drifts)
    let grip = handbrake ? 0.3 : 0.95;
    // Induce a slight drift (slip) at speed when turning
    if (!handbrake && steerInput !== 0) {
      const slideFactor = THREE.MathUtils.clamp(
        Math.abs(this.currentSpeed) / 55.0,
        0.0,
        1.0
      );
      // Grip decays much lower (down to 0.20) at high speeds, resulting in massive slides/drifts
      grip = THREE.MathUtils.lerp(0.95, 0.2, slideFactor);
    }
    const gripForce = -lateralSpeed * this.carBody.mass() * grip;

    this.carBody.applyImpulse(
      { x: side.x * gripForce, y: side.y * gripForce },
      true
    );

    // Show Handbrake indicator
    const handbrakeIndicator = document.getElementById("hud-handbrake");
    if (handbrake) {
      handbrakeIndicator?.classList.remove("hidden");
    } else {
      handbrakeIndicator?.classList.add("hidden");
    }

    // Trigger drift particles whenever sideslip velocity is active at speed
    const isSliding = Math.abs(lateralSpeed) > 2.8;
    if (isSliding) {
      this.spawnDriftDust(lateralSpeed);
    }

    // Programmatic audio updates
    this.audioController.updateEngineSound(this.currentSpeed, throttleInput);
    this.audioController.updateScreech(lateralSpeed, isBraking);

    // Apply slope gravity force pulling the car downhill (negative gradient of terrain height)
    const translation = this.carBody.translation();
    const gradEps = 0.15;
    const gy_x1 = sampleHeight(translation.x + gradEps, translation.y);
    const gy_x2 = sampleHeight(translation.x - gradEps, translation.y);
    const gy_z1 = sampleHeight(translation.x, translation.y + gradEps);
    const gy_z2 = sampleHeight(translation.x, translation.y - gradEps);

    const df_dx = (gy_x1 - gy_x2) / (2 * gradEps);
    const df_dz = (gy_z1 - gy_z2) / (2 * gradEps);

    const slopeGravityG = 16.0; // gravity acceleration multiplier
    const slopeForceX = -df_dx * this.carBody.mass() * slopeGravityG;
    const slopeForceY = -df_dz * this.carBody.mass() * slopeGravityG;

    this.carBody.applyImpulse(
      { x: slopeForceX * dt, y: slopeForceY * dt },
      true
    );

    // Step the physics engine
    this.physicsWorld.step();

    // --- Ride Heights, Pitch & Roll from Terrain heights ---
    const newTranslation = this.carBody.translation();
    const newHeading = this.carBody.rotation();

    // Sample heights at wheels positions to compute alignment
    const L = 3.6; // wheel-base length
    const W = 2.3; // wheel-base track-width
    const carDir3D = new THREE.Vector3(
      Math.cos(newHeading),
      0,
      Math.sin(newHeading)
    );
    const carSide3D = new THREE.Vector3(
      -Math.sin(newHeading),
      0,
      Math.cos(newHeading)
    );

    const pos3D = new THREE.Vector3(newTranslation.x, 0, newTranslation.y);

    const fl = pos3D
      .clone()
      .addScaledVector(carDir3D, L * 0.5)
      .addScaledVector(carSide3D, W * 0.5);
    const fr = pos3D
      .clone()
      .addScaledVector(carDir3D, L * 0.5)
      .addScaledVector(carSide3D, -W * 0.5);
    const bl = pos3D
      .clone()
      .addScaledVector(carDir3D, -L * 0.5)
      .addScaledVector(carSide3D, W * 0.5);
    const br = pos3D
      .clone()
      .addScaledVector(carDir3D, -L * 0.5)
      .addScaledVector(carSide3D, -W * 0.5);

    const yFl = sampleHeight(fl.x, fl.z);
    const yFr = sampleHeight(fr.x, fr.z);
    const yBl = sampleHeight(bl.x, bl.z);
    const yBr = sampleHeight(br.x, br.z);

    const yFront = (yFl + yFr) * 0.5;
    const yBack = (yBl + yBr) * 0.5;
    const yCenter = (yFront + yBack) * 0.5;

    // Compute geometric normal vector at center using central differences
    const normalEps = 0.15;
    const ny_x1 = sampleHeight(newTranslation.x + normalEps, newTranslation.y);
    const ny_x2 = sampleHeight(newTranslation.x - normalEps, newTranslation.y);
    const ny_z1 = sampleHeight(newTranslation.x, newTranslation.y + normalEps);
    const ny_z2 = sampleHeight(newTranslation.x, newTranslation.y - normalEps);

    const ndf_dx = (ny_x1 - ny_x2) / (2 * normalEps);
    const ndf_dz = (ny_z1 - ny_z2) / (2 * normalEps);

    const normal = new THREE.Vector3(-ndf_dx, 1, -ndf_dz).normalize();

    // Project the 2D forward vector onto the terrain's tangent plane
    const f2D = new THREE.Vector3(
      Math.cos(newHeading),
      0,
      Math.sin(newHeading)
    );
    const forward = f2D
      .clone()
      .sub(normal.clone().multiplyScalar(f2D.dot(normal)))
      .normalize();
    const left = new THREE.Vector3().crossVectors(forward, normal).normalize();

    // Ground the car's 3D mesh resting above the slope
    this.carGroup.position.set(
      newTranslation.x,
      yCenter + 0.55,
      newTranslation.y
    );

    // Build orientation basis matrix
    const basisMatrix = new THREE.Matrix4();
    basisMatrix.makeBasis(forward, normal, left);
    this.carGroup.quaternion.setFromRotationMatrix(basisMatrix);

    // Save pitch & roll for telemetry HUD
    this.carPitch = Math.asin(forward.y);
    this.carRoll = Math.asin(left.y);

    // Track total distance
    const distDelta = new THREE.Vector2(
      newTranslation.x,
      newTranslation.y
    ).distanceTo(this.startPosition);
    this.totalDistance = distDelta;

    // Load/unload chunks based on car position
    this.updateTerrainChunks(newTranslation.x, newTranslation.y);

    // Smoothly follow with camera
    const camTarget = pos3D.clone();
    camTarget.y = yCenter;

    // Camera offset behind vehicle
    const camOffset = carDir3D.clone().multiplyScalar(-13.5);
    camOffset.y = 5.5; // elevated angle looking down

    const desiredCamPos = camTarget.clone().add(camOffset);
    this.camera.position.lerp(desiredCamPos, 0.08);
    this.camera.lookAt(camTarget.clone().addScaledVector(carDir3D, 2.0)); // look slightly ahead of car

    // Dynamic FOV representing velocity speed-stretch
    const targetFov = 58 + Math.min(Math.abs(this.currentSpeed) * 0.32, 18);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.1);
    this.camera.updateProjectionMatrix();

    // Position sun light directly above player to focus shadow map resolution
    this.dirLight.position.set(
      newTranslation.x + 90,
      65,
      newTranslation.y - 90
    );
    this.dirLight.target = this.carGroup;

    // Exhaust particles
    if (throttleInput > 0 && Math.random() < 0.35) {
      this.spawnExhaustSmoke();
    }

    // Wrap ambient dust particles around camera
    const dustPositions = this.dustPoints.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const camZ = this.camera.position.z;
    const dustRange = 50;

    for (let i = 0; i < dustPositions.count; i++) {
      let x = dustPositions.getX(i);
      let y = dustPositions.getY(i);
      let z = dustPositions.getZ(i);

      // Simple wrap-around logic
      if (Math.abs(x - camX) > dustRange) {
        x = camX + (Math.random() - 0.5) * dustRange * 1.8;
      }
      if (y - camY > 15 || y < 0) {
        y = Math.random() * 20;
      }
      if (Math.abs(z - camZ) > dustRange) {
        z = camZ + (Math.random() - 0.5) * dustRange * 1.8;
      }

      // Add a slight wind drift
      x += 1.5 * dt;
      z += 0.5 * dt;

      dustPositions.setXYZ(i, x, y, z);
    }
    dustPositions.needsUpdate = true;

    // --- Crash Detection via sudden Velocity deceleration ---
    let hitStatic = false;
    this.physicsWorld.contactPairsWith(this.carCollider, (otherCollider) => {
      const parentBody = otherCollider.parent();
      if (parentBody && parentBody.bodyType() === RAPIER.RigidBodyType.Fixed) {
        hitStatic = true;
      }
    });

    const dv = new THREE.Vector2(linVel.x, linVel.y)
      .sub(this.prevVelocity)
      .length();
    // Decelerating > 16m/s^2 on static obstacle triggers structural failure
    if (hitStatic && dv > 14.5 && !this.isCrashed) {
      this.triggerCrash(linVel);
    }

    this.prevVelocity.set(linVel.x, linVel.y);
  }

  // ==========================================
  // 7. CRASH & EXPLOSION DYNAMICS
  // ==========================================

  private triggerCrash(linVel: RAPIER.Vector) {
    this.isCrashed = true;
    this.audioController.playExplosion();

    // Hide lights
    this.headLights.forEach((light) => {
      light.visible = false;
    });

    // Show critical HUD danger warning immediately
    const hudAlert = document.getElementById("hud-alert");
    const hudAlertText = document.getElementById("hud-alert-text");
    if (hudAlert && hudAlertText) {
      hudAlertText.innerText = "CRITICAL ENGINE OVERHEAT";
      hudAlert.classList.remove("hidden");
    }

    // 3D velocity vector of vehicle
    const carVel3D = new THREE.Vector3(
      linVel.x,
      this.currentSpeed * 0.2,
      linVel.y
    );

    // Extract car body parts and launch them
    this.carParts.forEach((partInfo) => {
      const mesh = partInfo.mesh;
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      mesh.getWorldPosition(worldPos);
      mesh.getWorldQuaternion(worldQuat);

      // Detach from group and add directly into the main scene
      this.scene.add(mesh);
      mesh.position.copy(worldPos);
      mesh.quaternion.copy(worldQuat);

      // Forceful explosive impulse vectors (outward blast + upward trajectory)
      const blastVel = new THREE.Vector3(
        carVel3D.x + (Math.random() - 0.5) * 14.0,
        Math.max(carVel3D.y, 0) + 12.0 + Math.random() * 10.0,
        carVel3D.z + (Math.random() - 0.5) * 14.0
      );

      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12
      );

      this.debrisList.push({
        mesh,
        vel: blastVel,
        rotVel,
      });
    });

    // Hide original group
    this.carGroup.visible = false;

    // Trigger explosive visual particles
    this.spawnExplosion(carVel3D);

    // Display crash screen after brief delay to watch the wreck roll
    setTimeout(() => {
      const distanceSpan = document.getElementById("stat-dist");
      const speedSpan = document.getElementById("stat-speed");
      if (distanceSpan)
        distanceSpan.innerText = `${this.totalDistance.toFixed(1)}m`;
      if (speedSpan) speedSpan.innerText = `${this.peakSpeed.toFixed(1)} km/h`;

      document.getElementById("screen-crash")?.classList.remove("hidden");
    }, 1800);
  }

  private updateDebrisAndParticles(dt: number) {
    // 1. Debris piece physics (Gravity & bouncing off Perlin Terrain heights)
    this.debrisList.forEach((piece) => {
      const mesh = piece.mesh;

      // Update coordinates
      mesh.position.addScaledVector(piece.vel, dt);

      // Gravity acceleration
      piece.vel.y -= 25.0 * dt; // gravity

      // Rotate debris
      mesh.rotateX(piece.rotVel.x * dt);
      mesh.rotateY(piece.rotVel.y * dt);
      mesh.rotateZ(piece.rotVel.z * dt);

      // Sample ground elevation
      const groundY = sampleHeight(mesh.position.x, mesh.position.z);
      if (mesh.position.y < groundY + 0.3) {
        mesh.position.y = groundY + 0.3;

        // Bounce recoil
        piece.vel.y = -piece.vel.y * 0.45; // vertical energy loss

        // Friction on contact
        piece.vel.x *= 0.7;
        piece.vel.z *= 0.7;

        // Damp rotation
        piece.rotVel.multiplyScalar(0.65);
      }
    });

    // 2. Animated particles
    for (let i = this.particleList.length - 1; i >= 0; i--) {
      const p = this.particleList[i]!;
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach((m) => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
        this.particleList.splice(i, 1);
        continue;
      }

      // Simple position movement
      p.mesh.position.addScaledVector(p.vel, dt);

      // Fade out opacity and scale over lifespan
      const ageRatio = p.life / p.maxLife;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.clamp(1.0 - ageRatio, 0.0, 1.0);

      if (p.type === "smoke" || p.type === "exhaust") {
        // Smoke expands
        const s = THREE.MathUtils.lerp(0.3, 2.5, ageRatio);
        p.mesh.scale.set(s, s, s);
        p.vel.y += 1.0 * dt; // smoke rises
      } else if (p.type === "fire") {
        // Fire fades and shrinks
        const s = THREE.MathUtils.lerp(1.8, 0.2, ageRatio);
        p.mesh.scale.set(s, s, s);
        p.vel.y += 2.0 * dt;
      } else if (p.type === "spark") {
        // Sparks are affected by gravity
        p.vel.y -= 12.0 * dt;
      }
    }
  }

  private spawnExplosion(velocity: THREE.Vector3) {
    // Fireballs
    const fireCount = 45;
    const geomFire = new THREE.DodecahedronGeometry(0.5, 0);

    for (let i = 0; i < fireCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(
          0.04 + Math.random() * 0.06,
          0.95,
          0.55
        ),
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geomFire, mat);
      mesh.position.copy(this.carGroup.position);

      const vel = new THREE.Vector3(
        velocity.x + (Math.random() - 0.5) * 20.0,
        velocity.y + 4.0 + Math.random() * 18.0,
        velocity.z + (Math.random() - 0.5) * 20.0
      );

      this.particleList.push({
        mesh,
        vel,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.8,
        type: "fire",
      });
      this.scene.add(mesh);
    }

    // Black smoke clouds
    const smokeCount = 35;
    const geomSmoke = new THREE.DodecahedronGeometry(0.8, 1);

    for (let i = 0; i < smokeCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1f1f1f,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(geomSmoke, mat);
      mesh.position.copy(this.carGroup.position);

      const vel = new THREE.Vector3(
        velocity.x + (Math.random() - 0.5) * 12.0,
        velocity.y + 6.0 + Math.random() * 12.0,
        velocity.z + (Math.random() - 0.5) * 12.0
      );

      this.particleList.push({
        mesh,
        vel,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.5,
        type: "smoke",
      });
      this.scene.add(mesh);
    }

    // Industrial sparks
    const sparkCount = 60;
    const geomSpark = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const matSpark = new THREE.MeshBasicMaterial({ color: 0xffa500 });

    for (let i = 0; i < sparkCount; i++) {
      const mesh = new THREE.Mesh(geomSpark, matSpark);
      mesh.position.copy(this.carGroup.position);

      const vel = new THREE.Vector3(
        velocity.x + (Math.random() - 0.5) * 25.0,
        velocity.y + 10.0 + Math.random() * 20.0,
        velocity.z + (Math.random() - 0.5) * 25.0
      );

      this.particleList.push({
        mesh,
        vel,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        type: "spark",
      });
      this.scene.add(mesh);
    }
  }

  private spawnExhaustSmoke() {
    const geom = new THREE.DodecahedronGeometry(0.12, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x5a5f66,
      transparent: true,
      opacity: 0.45,
    });
    const mesh = new THREE.Mesh(geom, mat);

    // Get position of exhaust tailpipe
    const pipeWorldPos = new THREE.Vector3(-2.1, 0.05, -0.6);
    pipeWorldPos.applyMatrix4(this.carGroup.matrixWorld);
    mesh.position.copy(pipeWorldPos);

    // Slight drift opposite of car heading direction
    const heading = this.carBody.rotation();
    const backDir = new THREE.Vector3(
      -Math.cos(heading),
      0.5,
      -Math.sin(heading)
    );
    const vel = backDir.multiplyScalar(4.0 + Math.random() * 2.0);

    this.particleList.push({
      mesh,
      vel,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.4,
      type: "exhaust",
    });
    this.scene.add(mesh);
  }

  private spawnDriftDust(lateralSpeed: number) {
    const heading = this.carBody.rotation();
    const backDir = new THREE.Vector3(
      -Math.cos(heading),
      0.15,
      -Math.sin(heading)
    );

    const latSpeedAbs = Math.abs(lateralSpeed);

    // Scale particle count with drift intensity
    const count = Math.min(Math.floor(latSpeedAbs * 0.35) + 1, 6);

    // Scale particle size with vehicle speed
    const baseSpeed = Math.sqrt(
      this.carBody.linvel().x ** 2 + this.carBody.linvel().y ** 2
    );
    const sizeFactor = Math.min(0.2 + baseSpeed * 0.015, 1.8);
    const geomDust = new THREE.DodecahedronGeometry(sizeFactor * 0.18, 0);
    const geomSpark = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    const spawnAtWheel = (localOffsetZ: number) => {
      const wheelLocal = new THREE.Vector3(-1.4, -0.4, localOffsetZ);
      wheelLocal.applyMatrix4(this.carGroup.matrixWorld);

      // 1. Dust Particles
      for (let k = 0; k < count; k++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x7c7264, // dark gritty dust
          transparent: true,
          opacity: 0.25 + Math.random() * 0.25,
        });
        const mesh = new THREE.Mesh(geomDust, mat);
        // Add slight random offset to spawn position
        mesh.position
          .copy(wheelLocal)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              Math.random() * 0.2,
              (Math.random() - 0.5) * 0.5
            )
          );

        // Speed-scaled drift velocity
        const vel = backDir
          .clone()
          .multiplyScalar(baseSpeed * 0.25 + 4.0 + Math.random() * 8.0)
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 4,
              Math.random() * 2.0,
              (Math.random() - 0.5) * 4
            )
          );

        this.particleList.push({
          mesh,
          vel,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.8,
          type: "smoke",
        });
        this.scene.add(mesh);
      }

      // 2. Spark Particles (Only at high speeds, representing tires grinding)
      if (baseSpeed > 25.0 && Math.random() < 0.6) {
        const sparkCount = Math.min(
          Math.floor((baseSpeed - 20.0) * 0.2) + 1,
          4
        );
        const matSpark = new THREE.MeshBasicMaterial({
          color: new THREE.Color(1.0, 0.5 + Math.random() * 0.3, 0.0), // bright orange
          transparent: true,
          opacity: 0.9,
        });

        for (let k = 0; k < sparkCount; k++) {
          const mesh = new THREE.Mesh(geomSpark, matSpark);
          mesh.position.copy(mesh.position.copy(wheelLocal)); // copy wheel coordinates

          const vel = backDir
            .clone()
            .multiplyScalar(baseSpeed * 0.35 + Math.random() * 10.0)
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                3.0 + Math.random() * 6.0,
                (Math.random() - 0.5) * 6
              )
            );

          this.particleList.push({
            mesh,
            vel,
            life: 0,
            maxLife: 0.3 + Math.random() * 0.4,
            type: "spark",
          });
          this.scene.add(mesh);
        }
      }
    };

    spawnAtWheel(1.15);
    spawnAtWheel(-1.15);
  }

  private triggerTimeExpired() {
    this.isTimeExpired = true;
    this.audioController.playShutdown();

    // Shut down headlights
    this.headLights.forEach((light) => {
      light.visible = false;
    });

    // Apply braking resistance
    this.carBody.setLinearDamping(3.5);
    this.carBody.setAngvel(0.0, true);

    // Show HUD red alert styling on the timer element
    const timerBox = document.getElementById("timer-box");
    if (timerBox) {
      timerBox.classList.add("timer-danger");
      timerBox.style.setProperty("--pulse-speed", "0.08s");
      timerBox.style.setProperty("--pulse-scale", "1.25");
    }

    // Trigger overlay display after a short pause
    setTimeout(() => {
      const crashTitle = document.querySelector(
        ".crash-title"
      ) as HTMLHeadingElement;
      const crashSubtitle = document.querySelector(
        ".crash-subtitle"
      ) as HTMLHeadingElement;
      const btnRestart = document.getElementById("btn-restart");

      if (crashTitle) {
        crashTitle.innerText = "MISSION TIME EXPIRED";
        crashTitle.setAttribute("data-text", "MISSION TIME EXPIRED");
      }
      if (crashSubtitle) {
        crashSubtitle.innerText = "TELEMETRY LINK LOST - GENERATOR DRAINED";
      }
      if (btnRestart) {
        btnRestart.innerText = "RECHARGE VEHICLE & RESTART [R]";
      }

      const distanceSpan = document.getElementById("stat-dist");
      const speedSpan = document.getElementById("stat-speed");
      if (distanceSpan)
        distanceSpan.innerText = `${this.totalDistance.toFixed(1)}m`;
      if (speedSpan) speedSpan.innerText = `${this.peakSpeed.toFixed(1)} km/h`;

      document.getElementById("screen-crash")?.classList.remove("hidden");
    }, 1500);
  }

  private restartGame() {
    this.audioController.playStartup();
    this.lastSecBeep = -1;

    // 1. Remove debris pieces from main scene
    this.debrisList.forEach((piece) => {
      this.scene.remove(piece.mesh);
    });
    this.debrisList = [];

    // 2. Remove any remaining particle meshes
    this.particleList.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      if (Array.isArray(p.mesh.material)) {
        p.mesh.material.forEach((m) => m.dispose());
      } else {
        p.mesh.material.dispose();
      }
    });
    this.particleList = [];

    // 3. Re-assemble car parts to original local hierarchy
    this.carParts.forEach((partInfo) => {
      const mesh = partInfo.mesh;
      this.scene.remove(mesh); // clean scene reference
      this.carGroup.add(mesh);
      mesh.position.copy(partInfo.localPos);
      mesh.rotation.copy(partInfo.localRot);
    });

    // Reset headlights
    this.headLights.forEach((light) => {
      light.visible = true;
    });

    // 4. Reset physics body
    this.carBody.setTranslation({ x: 0.0, y: 0.0 }, true);
    this.carBody.setLinvel({ x: 0.0, y: 0.0 }, true);
    this.carBody.setRotation(0.0, true);
    this.carBody.setAngvel(0.0, true);

    this.carGroup.position.set(0, 0, 0);
    this.carGroup.rotation.set(0, 0, 0);
    this.carGroup.visible = true;

    // Reset crash screen titles in case they were modified by Time Out
    const crashTitle = document.querySelector(
      ".crash-title"
    ) as HTMLHeadingElement;
    const crashSubtitle = document.querySelector(
      ".crash-subtitle"
    ) as HTMLHeadingElement;
    const btnRestart = document.getElementById("btn-restart");

    if (crashTitle) {
      crashTitle.innerText = "CRITICAL VEHICLE FAILURE";
      crashTitle.setAttribute("data-text", "CRITICAL VEHICLE FAILURE");
    }
    if (crashSubtitle) {
      crashSubtitle.innerText =
        "STRUCTURAL INTEGRITY COMPROMISED - EXPLOSION DETECTED";
    }
    if (btnRestart) {
      btnRestart.innerText = "REBOOT VEHICLE & RESTART [R]";
    }

    // Reset physics body linear damping to 0 for infinite acceleration
    this.carBody.setLinearDamping(0.0);

    // 5. Reset states
    this.isCrashed = false;
    this.isTimeExpired = false;
    this.timeRemaining = 60.0;
    this.currentSpeed = 0;
    this.peakSpeed = 0;
    this.totalDistance = 0;
    this.startPosition.set(0, 0);
    this.prevVelocity.set(0, 0);
    this.wheelSpinAngle = 0;

    // Hide alerts, crash screens & remove timer danger styles
    document.getElementById("screen-crash")?.classList.add("hidden");
    document.getElementById("hud-alert")?.classList.add("hidden");

    const timerBox = document.getElementById("timer-box");
    if (timerBox) {
      timerBox.classList.remove("timer-danger");
      timerBox.style.removeProperty("--pulse-speed");
      timerBox.style.removeProperty("--pulse-scale");
    }

    // Force chunk reload at origin
    this.lastChunkX = 99999;
    this.lastChunkZ = 99999;
    this.updateTerrainChunks(0, 0);

    this.prevTime = performance.now();
  }

  // ==========================================
  // 8. TELEMETRY & HUD BINDINGS
  // ==========================================

  private updateHUD() {
    const coordsSpan = document.getElementById("hud-coords");
    const altSpan = document.getElementById("hud-alt");
    const distSpan = document.getElementById("hud-dist");
    const tiltSpan = document.getElementById("hud-tilt");
    const speedSpan = document.getElementById("hud-speed");
    const timerSpan = document.getElementById("hud-timer");
    const timerBox = document.getElementById("timer-box");

    const pos = this.carBody.translation();
    const speedKmh = Math.round(Math.abs(this.currentSpeed) * 3.6);

    if (coordsSpan) {
      coordsSpan.innerText = `X: ${pos.x.toFixed(1)} | Z: ${pos.y.toFixed(1)}`;
    }
    if (altSpan) {
      altSpan.innerText = `${this.carGroup.position.y.toFixed(1)}m`;
    }
    if (distSpan) {
      distSpan.innerText = `${this.totalDistance.toFixed(1)}m`;
    }

    // Compute Pitch & Roll degrees for telemetry dashboard
    const pitchDeg = Math.round(THREE.MathUtils.radToDeg(this.carPitch));
    const rollDeg = Math.round(THREE.MathUtils.radToDeg(this.carRoll));
    if (tiltSpan) {
      tiltSpan.innerText = `PITCH: ${pitchDeg}° | ROLL: ${rollDeg}°`;
    }

    if (speedSpan) {
      speedSpan.innerText = speedKmh.toString();
    }

    // Render countdown timer value
    if (timerSpan) {
      timerSpan.innerText = `${this.timeRemaining.toFixed(2)}s`;
    }

    // Dramatic red flashing timer scaling when less than 10 seconds remain
    if (timerBox) {
      if (this.timeRemaining < 10.0 && !this.isTimeExpired && !this.isCrashed) {
        timerBox.classList.add("timer-danger");

        // Scale frequency and amplitude of pulse countdown dynamically
        const ratio = this.timeRemaining / 10.0; // 1.0 down to 0.0
        const pulseSpeed = 0.08 + ratio * 0.42; // oscillates from 0.5s down to 0.08s (faster)
        const pulseScale = 1.0 + (1.0 - ratio) * 0.22; // expands up to 1.22x (larger)

        timerBox.style.setProperty("--pulse-speed", `${pulseSpeed}s`);
        timerBox.style.setProperty("--pulse-scale", `${pulseScale}`);
      } else if (!this.isTimeExpired) {
        timerBox.classList.remove("timer-danger");
        timerBox.style.removeProperty("--pulse-speed");
        timerBox.style.removeProperty("--pulse-scale");
      }
    }
  }
}

// ==========================================
// 9. SYSTEM RUN INITIALIZATION
// ==========================================

async function initialize() {
  const game = new Game();
  await RAPIER.init();
  await game.initPhysics();
  game.run();
}

initialize().catch(console.error);
