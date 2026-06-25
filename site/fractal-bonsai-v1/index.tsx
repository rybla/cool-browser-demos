import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ==========================================
// 1. PROCEDURAL MATH & SEEDED RANDOM & NOISE
// ==========================================

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  // Mulberry32
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

// 3D Simplex-like Perlin Noise
class SimplexNoise {
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

// ==========================================
// 2. PROCEDURAL TEXTURES
// ==========================================

function createBarkTexture(): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;

  // Fill base wood colors
  ctx.fillStyle = "#3e2723";
  ctx.fillRect(0, 0, 512, 512);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 512, 512);

  // Generate vertical ridges
  const tempRng = new SeededRandom(42);
  const tempNoise = new SimplexNoise(tempRng);

  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      // Bark pattern
      const n1 = tempNoise.noise(x * 0.05, y * 0.005, 0) * 0.5 + 0.5;
      const n2 = tempNoise.noise(x * 0.2, y * 0.05, 1) * 0.25 + 0.25;
      const barkVal = (n1 * 0.7 + n2 * 0.3) * 255;

      // Color variation
      const r = Math.floor(62 - (255 - barkVal) * 0.12);
      const g = Math.floor(39 - (255 - barkVal) * 0.09);
      const b = Math.floor(35 - (255 - barkVal) * 0.09);

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, 1, 1);

      // Height bump map (grey scale height map)
      const hVal = Math.floor(128 + (n1 - 0.5) * 100 + (n2 - 0.5) * 40);
      bCtx.fillStyle = `rgb(${hVal}, ${hVal}, ${hVal})`;
      bCtx.fillRect(x, y, 1, 1);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 4);

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1, 4);

  return { map, bump };
}

function createMossTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1e3a1e";
  ctx.fillRect(0, 0, 256, 256);

  const tempRng = new SeededRandom(1337);
  const tempNoise = new SimplexNoise(tempRng);

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const n = tempNoise.noise(x * 0.08, y * 0.08, 0.5) * 0.5 + 0.5;
      const gVal = Math.floor(58 + n * 45);
      const rVal = Math.floor(30 + n * 20);
      const bVal = Math.floor(25 + n * 10);
      ctx.fillStyle = `rgb(${rVal}, ${gVal}, ${bVal})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);
  return map;
}

function createCeramicTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // Matte dark teal ceramic
  ctx.fillStyle = "#15222e";
  ctx.fillRect(0, 0, 512, 512);

  // Add subtle marbling/veining
  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1.5;
  const tempRng = new SeededRandom(777);

  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = tempRng.range(0, 512);
    let y = 0;
    ctx.moveTo(x, y);
    while (y < 512) {
      x += tempRng.range(-8, 8);
      y += tempRng.range(5, 15);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  return map;
}

// ==========================================
// 3. SOUND SYNTHESIZER (WEB AUDIO API)
// ==========================================

class ZenAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainNode: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private windNode: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windLFO: OscillatorNode | null = null;
  private birdsInterval: ReturnType<typeof setInterval> | null = null;
  private isEnabled: boolean = false;
  private volume: number = 0.5;

  init() {
    if (this.ctx) return;
    try {
      const WebkitAudioContext = (
        window as Window & { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext;
      this.ctx = new (window.AudioContext || WebkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.setupRain();
      this.setupWind();
      this.setupBirds();

      this.isEnabled = true;
    } catch (e) {
      console.warn("Failed to initialize audio:", e);
    }
  }

  setVolume(vol: number) {
    this.volume = vol;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
    }
  }

  toggle(forceState?: boolean) {
    const targetState = forceState !== undefined ? forceState : !this.isEnabled;
    if (targetState) {
      if (!this.ctx) {
        this.init();
      } else if (this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      this.isEnabled = true;
    } else {
      if (this.ctx && this.ctx.state === "running") {
        void this.ctx.suspend();
      }
      this.isEnabled = false;
    }
    return this.isEnabled;
  }

  private setupRain() {
    if (!this.ctx || !this.masterGain) return;

    // Create procedural white noise buffer
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate
    );
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.rainNode = this.ctx.createBufferSource();
    this.rainNode.buffer = noiseBuffer;
    this.rainNode.loop = true;

    // Bandpass filter to make it sound like rain
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1000;
    filter.Q.value = 0.8;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0; // Muted initially

    this.rainNode.connect(filter);
    filter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);

    this.rainNode.start();
  }

  private setupWind() {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = 4 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate
    );
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise filter approximation
      output[i] = lastOut * 0.98 + white * 0.02;
      lastOut = output[i]!;
    }

    this.windNode = this.ctx.createBufferSource();
    this.windNode.buffer = noiseBuffer;
    this.windNode.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 2.0;

    // LFO to modulate filter frequency for gusts
    this.windLFO = this.ctx.createOscillator();
    this.windLFO.frequency.value = 0.1; // slow modulation
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 200;

    this.windLFO.connect(lfoGain);
    lfoGain.connect(this.windFilter.frequency);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.05; // Base wind noise

    this.windNode.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    this.windLFO.start();
    this.windNode.start();
  }

  private setupBirds() {
    // Schedule procedural bird chirps in spring/summer
    this.birdsInterval = setInterval(() => {
      if (
        !this.isEnabled ||
        !this.ctx ||
        !this.masterGain ||
        this.ctx.state !== "running"
      )
        return;
      // 30% chance to chirp every 12s
      if (Math.random() > 0.4) {
        this.chirp();
      }
    }, 12000);
  }

  private chirp() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // A series of rapid frequency-swept sine wave chirps
    const chirpCount = Math.floor(Math.random() * 3) + 2;
    let startTime = now;

    for (let c = 0; c < chirpCount; c++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      const startFreq = 2500 + Math.random() * 500;
      const endFreq = 3800 + Math.random() * 500;

      osc.frequency.setValueAtTime(startFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(
        startFreq * 0.8,
        startTime + 0.12
      );

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.04, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0.04, startTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.13);

      startTime += 0.15 + Math.random() * 0.1;
    }
  }

  updateClimateSound(rainVol: number, windVol: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(rainVol * 0.25, now, 1.5);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.04 + windVol * 0.15, now, 1.5);
    }
  }
}

const zenAudio = new ZenAudio();

// ==========================================
// 4. CUSTOM SHADER COMPILING FOR WIND & SNOW
// ==========================================

interface CustomUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
  uSnowAccumulation: { value: number };
}

function customizeMaterial(
  material: THREE.MeshStandardMaterial,
  uniforms: CustomUniforms
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uSnowAccumulation = uniforms.uSnowAccumulation;

    // Inject uniforms in vertex shader
    shader.vertexShader = `
      uniform float uTime;
      uniform float uWindStrength;
      ${shader.vertexShader}
    `;

    // Displace vertices to simulate branch/leaf sway
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      
      // Compute a sway displacement based on vertex height in world space
      float height = position.y;
      
      // Wind oscillation formulas
      float swayX = sin(uTime * 2.2 + height * 0.8) * 0.03 * max(0.0, height) * uWindStrength;
      float swayZ = cos(uTime * 1.8 + height * 0.6) * 0.02 * max(0.0, height) * uWindStrength;
      
      // Apply displacement
      transformed.x += swayX;
      transformed.z += swayZ;
      `
    );

    // Inject uniforms in fragment shader
    shader.fragmentShader = `
      uniform float uSnowAccumulation;
      ${shader.fragmentShader}
    `;

    // Blend color with snow on top-facing surfaces
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
      #include <color_fragment>
      
      #ifdef USE_NORMAL
        // Normal in world space determines snow cover (pointing up)
        float snowFactor = max(0.0, vNormal.y);
        // Sharpen the transition for crisp snow edges
        snowFactor = smoothstep(0.4, 0.75, snowFactor) * uSnowAccumulation;
        
        // Pure crisp white snow color
        vec3 snowColor = vec3(0.96, 0.97, 0.99);
        diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowFactor);
      #endif
      `
    );

    material.userData.shader = shader;
  };
}

// ==========================================
// 5. BONSAI FRACTAL TREE ENGINE
// ==========================================

interface LeafSpawn {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  branchScale: number;
}

class BonsaiTree {
  group: THREE.Group;
  private barkMat: THREE.MeshStandardMaterial;
  private jointMat: THREE.MeshStandardMaterial;
  private leafMat: THREE.MeshStandardMaterial;
  private uniforms: CustomUniforms;
  private rng: SeededRandom;
  private noise: SimplexNoise;

  // Geometry cache to reuse
  private branchGeometries: { [key: string]: THREE.CylinderGeometry } = {};
  private jointGeometry: THREE.SphereGeometry;
  private leafGeometries: { [key: string]: THREE.BufferGeometry } = {};

  private branchNodes: {
    group: THREE.Group;
    depth: number;
    phase: number;
    baseRotX: number;
    baseRotZ: number;
    length: number;
  }[] = [];

  private leafSpawns: LeafSpawn[] = [];
  private leafMesh: THREE.InstancedMesh | null = null;
  private leafMatrices: THREE.Matrix4[] = [];

  constructor(uniforms: CustomUniforms) {
    this.group = new THREE.Group();
    this.uniforms = uniforms;
    this.rng = new SeededRandom(88);
    this.noise = new SimplexNoise(this.rng);

    // Generate procedural textures
    const barkTextures = createBarkTexture();

    this.barkMat = new THREE.MeshStandardMaterial({
      map: barkTextures.map,
      bumpMap: barkTextures.bump,
      bumpScale: 0.06,
      roughness: 0.85,
      metalness: 0.05,
    });
    customizeMaterial(this.barkMat, this.uniforms);

    this.jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#4a312c"),
      roughness: 0.85,
      metalness: 0.05,
    });
    customizeMaterial(this.jointMat, this.uniforms);

    this.leafMat = new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    customizeMaterial(this.leafMat, this.uniforms);

    // Common joint geometry
    this.jointGeometry = new THREE.SphereGeometry(1, 12, 10);
    this.buildLeafGeometries();
  }

  private buildLeafGeometries() {
    // 1. Sakura Diamond Leaf Geometry
    const sakuraGeom = new THREE.BufferGeometry();
    const sakuraVerts = new Float32Array([
      0.0, 0.0, 0.0, -0.08, 0.15, 0.03, 0.0, 0.35, 0.0, 0.08, 0.15, 0.03,
    ]);
    const sakuraIndices = [0, 3, 2, 0, 2, 1];
    sakuraGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(sakuraVerts, 3)
    );
    sakuraGeom.setIndex(sakuraIndices);
    sakuraGeom.computeVertexNormals();
    this.leafGeometries["sakura"] = sakuraGeom;

    // 2. Conifer Pine Needle Geometry
    const pineGeom = new THREE.BufferGeometry();
    const pineVerts: number[] = [];
    const pineIndices: number[] = [];

    // Create 6 needles fanning out radials
    for (let i = 0; i < 6; i++) {
      const angle = (i - 2.5) * 0.22; // Fan angle
      const len = 0.35;
      const x = Math.sin(angle) * len;
      const y = Math.cos(angle) * len;

      const vBase = pineVerts.length / 3;
      pineVerts.push(
        0,
        0,
        0,
        x - 0.008,
        y * 0.5,
        0.008,
        x,
        y,
        0,
        x + 0.008,
        y * 0.5,
        -0.008
      );
      pineIndices.push(
        vBase,
        vBase + 1,
        vBase + 2,
        vBase,
        vBase + 2,
        vBase + 3
      );
    }
    pineGeom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(pineVerts, 3)
    );
    pineGeom.setIndex(pineIndices);
    pineGeom.computeVertexNormals();
    this.leafGeometries["pine"] = pineGeom;
  }

  private getBranchGeometry(
    height: number,
    rStart: number,
    rEnd: number
  ): THREE.CylinderGeometry {
    const key = `${height.toFixed(2)}_${rStart.toFixed(3)}_${rEnd.toFixed(3)}`;
    if (!this.branchGeometries[key]) {
      // 8 radial segments is enough for small branches, 12 for larger base
      const radSegs = rStart > 0.3 ? 12 : 8;
      const geom = new THREE.CylinderGeometry(rEnd, rStart, height, radSegs, 4);
      // Translate cylinder so its base sits at y = 0
      geom.translate(0, height * 0.5, 0);
      this.branchGeometries[key] = geom;
    }
    return this.branchGeometries[key];
  }

  // Clear previous mesh tree
  clear() {
    this.branchNodes = [];
    this.leafSpawns = [];
    if (this.leafMesh) {
      this.group.remove(this.leafMesh);
      this.leafMesh.geometry.dispose();
      this.leafMesh = null;
    }

    while (this.group.children.length > 0) {
      const child = this.group.children[0]!;
      this.group.remove(child);
      this.disposeObject(child);
    }
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry && child.geometry !== this.jointGeometry) {
          (child.geometry as THREE.BufferGeometry).dispose();
        }
      }
    });
  }

  // Root-over-rock layout: procedural rocks sitting inside the pot
  generateDecorationRocks(potGroup: THREE.Group) {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#424b54"),
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true, // gives high-quality organic poly faceted rock look
    });

    const rockRng = new SeededRandom(999);

    // Large center rock that roots will wrap
    const centerRockGeom = new THREE.DodecahedronGeometry(0.8, 1);

    // Displace rock vertices to make it look gnarled
    const pos = centerRockGeom.attributes["position"]!;
    for (let i = 0; i < pos.count; i++) {
      const rx = pos.getX(i);
      const ry = pos.getY(i);
      const rz = pos.getZ(i);
      // Displace slightly based on coordinates
      const scale = 0.15;
      const dx = this.noise.noise(rx * 2, ry * 2, rz * 2) * scale;
      const dy = this.noise.noise(rx * 2, ry * 2 + 1, rz * 2) * scale;
      const dz = this.noise.noise(rx * 2, ry * 2, rz * 2 + 2) * scale;
      pos.setXYZ(i, rx + dx, ry + dy, rz + dz);
    }
    centerRockGeom.computeVertexNormals();

    const centerRock = new THREE.Mesh(centerRockGeom, stoneMat);
    centerRock.position.set(0.1, 0.45, -0.05);
    centerRock.rotation.set(0.5, 0.2, 0.8);
    centerRock.castShadow = true;
    centerRock.receiveShadow = true;
    potGroup.add(centerRock);

    // Couple of smaller helper stones
    for (let i = 0; i < 2; i++) {
      const smallRockGeom = new THREE.DodecahedronGeometry(
        rockRng.range(0.2, 0.35),
        0
      );
      const smallRock = new THREE.Mesh(smallRockGeom, stoneMat);
      smallRock.position.set(
        rockRng.range(-0.8, 0.8),
        0.3,
        rockRng.range(-0.6, 0.6)
      );
      smallRock.rotation.set(
        rockRng.range(0, 3),
        rockRng.range(0, 3),
        rockRng.range(0, 3)
      );
      smallRock.castShadow = true;
      smallRock.receiveShadow = true;
      potGroup.add(smallRock);
    }
  }

  // Primary generate method called by GUI
  generate(
    maxDepth: number,
    baseAngleDeg: number,
    gnarliness: number,
    leafStyle: "sakura" | "pine",
    leafDensityPct: number
  ) {
    this.clear();
    this.rng = new SeededRandom(142); // seed consistent tree shape for parameters

    const rootGroup = new THREE.Group();
    this.group.add(rootGroup);

    // Initial parameters for Trunk
    const baseLength = 1.35;
    const baseRadius = 0.22;
    const startDirection = new THREE.Vector3(0, 1, 0).normalize();
    const startPoint = new THREE.Vector3(0, 0.4, 0); // slightly above moss line

    // Build the trunk and recursive branch structure
    this.buildBranchNode(
      rootGroup,
      startPoint,
      startDirection,
      baseLength,
      baseRadius,
      0,
      maxDepth,
      baseAngleDeg * (Math.PI / 180),
      gnarliness
    );

    // Build decorative roots
    this.buildRoots(rootGroup, startPoint, baseRadius);

    // Force matrix update across the tree hierarchy so matrixWorld is populated
    this.group.updateMatrixWorld(true);

    // Generate leaf spawn targets using correct world matrices
    this.generateLeafSpawns(maxDepth);

    // Instance leaf meshes
    this.buildInstancedLeaves(leafStyle, leafDensityPct);
  }

  private buildBranchNode(
    parentObject: THREE.Object3D,
    startPoint: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    radius: number,
    depth: number,
    maxDepth: number,
    branchAngleRad: number,
    gnarliness: number
  ) {
    const nodeGroup = new THREE.Group();
    nodeGroup.position.copy(startPoint);

    // Apply gnarliness bend (organic twist)
    const twistNoiseX =
      this.noise.noise(startPoint.x * 2, startPoint.y * 2, depth) *
      gnarliness *
      0.15;
    const twistNoiseZ =
      this.noise.noise(startPoint.x * 2 + 10, startPoint.y * 2, depth + 10) *
      gnarliness *
      0.15;

    // Direct orientation rotation
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(up, direction);
    nodeGroup.quaternion.copy(quaternion);

    // Add extra organic warp
    nodeGroup.rotateX(twistNoiseX);
    nodeGroup.rotateZ(twistNoiseZ);

    parentObject.add(nodeGroup);

    // Calculate end radius
    const endRadius = radius * (depth === 0 ? 0.75 : 0.68);

    // Create Cylinder mesh representing this branch
    const branchGeom = this.getBranchGeometry(length, radius, endRadius);
    const branchMesh = new THREE.Mesh(branchGeom, this.barkMat);
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    nodeGroup.add(branchMesh);

    // Add spherical joint covering at the pivot base
    const jointScale = radius * 1.05;
    const jointMesh = new THREE.Mesh(this.jointGeometry, this.jointMat);
    jointMesh.scale.set(jointScale, jointScale, jointScale);
    nodeGroup.add(jointMesh);

    // Track for branch swaying
    this.branchNodes.push({
      group: nodeGroup,
      depth,
      phase: this.rng.range(0, Math.PI * 2),
      baseRotX: nodeGroup.rotation.x,
      baseRotZ: nodeGroup.rotation.z,
      length,
    });

    // Recursion base case
    if (depth < maxDepth) {
      // Split into 2 or 3 branches
      const branchCount = depth === 0 ? 2 : this.rng.next() > 0.4 ? 3 : 2;

      for (let i = 0; i < branchCount; i++) {
        // Child branch configurations
        const childLength = length * this.rng.range(0.68, 0.78);
        const childRadius = endRadius;

        // Spread angles outwards
        const angleOffset = branchAngleRad * this.rng.range(0.8, 1.25);
        const spreadAngle =
          (i * (Math.PI * 2)) / branchCount + this.rng.range(-0.3, 0.3);

        const childDir = new THREE.Vector3(0, 1, 0);
        // Tilt branch away from main vector
        childDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), angleOffset);
        // Rotate around Y to distribute radial splits
        childDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngle);
        // Align child direction relative to current branch frame
        childDir.applyQuaternion(nodeGroup.quaternion);

        // Compute local position of start point (relative to nodeGroup frame = 0, length, 0)
        // Let's pass the end position (in local coordinates)
        const childStartLocal = new THREE.Vector3(0, length, 0);

        this.buildBranchNode(
          nodeGroup,
          childStartLocal,
          new THREE.Vector3(0, 1, 0)
            .copy(childDir)
            .applyQuaternion(nodeGroup.quaternion.clone().invert()),
          childLength,
          childRadius,
          depth + 1,
          maxDepth,
          branchAngleRad,
          gnarliness
        );
      }
    }
  }

  // Roots growing down wrapping central rock
  private buildRoots(
    parentObject: THREE.Object3D,
    basePoint: THREE.Vector3,
    baseRadius: number
  ) {
    const rootCount = 5;
    const rootAngleSpread = (Math.PI * 2) / rootCount;

    // Central rock position to guide root wrap
    const rockCenter = new THREE.Vector3(0.1, 0.45, -0.05);
    const rockRadius = 0.8;

    for (let r = 0; r < rootCount; r++) {
      const rootAngle = r * rootAngleSpread + this.rng.range(-0.2, 0.2);

      // Grow outwards and downwards
      const currPos = basePoint.clone();
      let currRadius = baseRadius * 0.8;

      const segments = 8;
      const segLength = 0.22;

      for (let s = 0; s < segments; s++) {
        // Base grow direction
        const dir = new THREE.Vector3(
          Math.cos(rootAngle),
          -0.3,
          Math.sin(rootAngle)
        ).normalize();

        // Wrap rock check: pull root towards the rock surface, but prevent clipping
        const toRock = new THREE.Vector3().subVectors(currPos, rockCenter);
        const distToRock = toRock.length();

        if (distToRock < rockRadius + 0.15) {
          // Push outward along the rock normal to wrap it
          const normal = toRock.clone().normalize();
          dir.addScaledVector(normal, 0.55).normalize();

          // Force sliding down the rock surface
          dir.y -= 0.15;
          dir.normalize();
        }

        // Apply organic noise wiggle
        dir.x += this.noise.noise(currPos.x * 3, currPos.y * 3, r) * 0.15;
        dir.z +=
          this.noise.noise(currPos.x * 3 + 5, currPos.y * 3, r + 5) * 0.15;
        dir.normalize();

        const nextPos = currPos.clone().addScaledVector(dir, segLength);

        // Keep roots above pot floor (y = 0.25)
        if (nextPos.y < 0.25) {
          nextPos.y = 0.25;
          // spread horizontal once hitting soil
          dir.y = 0;
          dir.normalize();
        }

        // Render root cylinder segment
        const segmentGroup = new THREE.Group();
        segmentGroup.position.copy(currPos);

        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir
        );
        segmentGroup.quaternion.copy(q);
        parentObject.add(segmentGroup);

        const nextRadius = currRadius * 0.8;
        const geom = this.getBranchGeometry(segLength, currRadius, nextRadius);
        const mesh = new THREE.Mesh(geom, this.barkMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        segmentGroup.add(mesh);

        // Spherical connector joint
        const jointScale = currRadius * 1.05;
        const joint = new THREE.Mesh(this.jointGeometry, this.jointMat);
        joint.scale.set(jointScale, jointScale, jointScale);
        segmentGroup.add(joint);

        currPos.copy(nextPos);
        currRadius = nextRadius;
      }
    }
  }

  private generateLeafSpawns(maxDepth: number) {
    this.leafSpawns = [];
    const localRng = new SeededRandom(2026);

    for (let i = 0; i < this.branchNodes.length; i++) {
      const node = this.branchNodes[i]!;
      if (node.depth >= maxDepth - 2) {
        const leafCount = Math.floor(localRng.range(3, 8));
        for (let l = 0; l < leafCount; l++) {
          const tOffset = localRng.range(0.4, 1.0);
          const lPos = new THREE.Vector3(
            0,
            node.length * tOffset,
            0
          ).applyMatrix4(node.group.matrixWorld);

          const lDir = new THREE.Vector3(
            localRng.range(-1, 1),
            localRng.range(0.2, 1),
            localRng.range(-1, 1)
          ).normalize();

          this.leafSpawns.push({
            position: lPos,
            direction: lDir,
            branchScale: (1.0 - node.depth / maxDepth) * 0.8 + 0.2,
          });
        }
      }
    }
  }

  // Highly optimized InstancedMesh for leaves
  private buildInstancedLeaves(
    leafStyle: "sakura" | "pine",
    densityPct: number
  ) {
    // Filter leaves based on density setting
    const activeSpawns = this.leafSpawns.filter(
      () => this.rng.range(0, 100) < densityPct
    );

    if (activeSpawns.length === 0) return;

    const leafGeom = this.leafGeometries[leafStyle]!;

    this.leafMesh = new THREE.InstancedMesh(
      leafGeom,
      this.leafMat,
      activeSpawns.length
    );
    this.leafMesh.castShadow = true;
    this.leafMesh.receiveShadow = true;

    this.leafMatrices = []; // Reset matrices cache

    const dummy = new THREE.Object3D();

    // Default leaf color base
    const baseCol = new THREE.Color();

    for (let i = 0; i < activeSpawns.length; i++) {
      const spawn = activeSpawns[i]!;
      dummy.position.copy(spawn.position);

      // Orient leaf along its direction vector
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, spawn.direction);
      dummy.quaternion.copy(q);

      // Random spin rotation on all three axes for organic volumetric layout
      dummy.rotateY(this.rng.range(0, Math.PI * 2));
      dummy.rotateX(this.rng.range(-0.5, 0.5));
      dummy.rotateZ(this.rng.range(-0.5, 0.5));

      // Set scale based on recursion depth - make them significantly larger
      const baseScale = leafStyle === "pine" ? 1.6 : 2.5;
      const scale = spawn.branchScale * this.rng.range(0.65, 1.8) * baseScale;
      dummy.scale.set(scale, scale, scale);

      dummy.updateMatrix();
      this.leafMesh.setMatrixAt(i, dummy.matrix);
      this.leafMatrices.push(dummy.matrix.clone()); // cache original matrix

      // Vary leaf colors with multiple rich color channels
      if (leafStyle === "sakura") {
        // High variation cherry blossom colors (lavender-rose, bright sakura, coral-pink)
        const hue = this.rng.choice([
          this.rng.range(0.92, 0.96),
          this.rng.range(0.96, 1.0),
          this.rng.range(0.0, 0.04),
        ]);
        baseCol.setHSL(
          hue,
          this.rng.range(0.65, 0.95),
          this.rng.range(0.72, 0.92)
        );
      } else {
        // High variation conifer needle colors (emerald, dark conifer, lime pine needles)
        const hue = this.rng.choice([
          this.rng.range(0.24, 0.31),
          this.rng.range(0.31, 0.37),
          this.rng.range(0.37, 0.43),
        ]);
        baseCol.setHSL(
          hue,
          this.rng.range(0.55, 0.85),
          this.rng.range(0.14, 0.34)
        );
      }
      this.leafMesh.setColorAt(i, baseCol);
    }

    if (this.leafMesh.instanceColor) {
      this.leafMesh.instanceColor.needsUpdate = true;
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;

    this.group.add(this.leafMesh);
  }

  // Update leaf colors dynamically during season transitions
  updateLeafColors(
    colorRange: [THREE.Color, THREE.Color][],
    leafRatio: number
  ) {
    if (!this.leafMesh || !this.leafMesh.instanceColor) return;

    const localRng = new SeededRandom(5555);
    const tempCol = new THREE.Color();
    const count = this.leafMesh.count;

    for (let i = 0; i < count; i++) {
      // If leafRatio is lower than current index ratio, hide it (simulate falling)
      const instanceRatio = i / count;
      if (instanceRatio > leafRatio) {
        // Scale to 0 matrix to hide it
        const mat = new THREE.Matrix4();
        mat.makeScale(0, 0, 0);
        this.leafMesh.setMatrixAt(i, mat);
      } else {
        // Restore original size and location matrix
        const originalMat = this.leafMatrices[i];
        if (originalMat) {
          this.leafMesh.setMatrixAt(i, originalMat);
        }
      }

      // Choose a color range and lerp inside it
      const range = localRng.choice(colorRange);
      tempCol.copy(range[0]).lerp(range[1], localRng.next());

      this.leafMesh.setColorAt(i, tempCol);
    }

    this.leafMesh.instanceColor.needsUpdate = true;
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  // Hierarchical branch wind sway update
  updateBranchSway(time: number, windStrength: number) {
    // Traverse branch nodes and apply a small swaying rotation
    for (let i = 0; i < this.branchNodes.length; i++) {
      const node = this.branchNodes[i]!;
      // Higher branches sway more
      const swayFactor = (node.depth + 1) * 0.002 * windStrength;
      const speed = 1.6 + node.depth * 0.25;

      const oscX = Math.sin(time * speed + node.phase) * swayFactor;
      const oscZ = Math.cos(time * (speed * 0.85) + node.phase) * swayFactor;

      node.group.rotation.x = node.baseRotX + oscX;
      node.group.rotation.z = node.baseRotZ + oscZ;
    }
  }
}

// ==========================================
// 6. ATMOSPHERIC & WEATHER PARTICLE SYSTEMS
// ==========================================

class WeatherSystem {
  scene: THREE.Scene;
  private uniforms: CustomUniforms;

  // Particle systems
  private rainPoints: THREE.Points | null = null;
  private snowPoints: THREE.Points | null = null;
  private petalPoints: THREE.Points | null = null;
  private leafPoints: THREE.Points | null = null;

  // Particle positions/velocities caches
  private rainCoords: Float32Array = new Float32Array();
  private snowCoords: Float32Array = new Float32Array();
  private petalCoords: Float32Array = new Float32Array();
  private leafCoords: Float32Array = new Float32Array();

  private petalStates: { velocity: THREE.Vector3; rotSpeed: THREE.Vector3 }[] =
    [];
  private leafStates: { velocity: THREE.Vector3; rotSpeed: THREE.Vector3 }[] =
    [];

  // Procedural sky background dome
  private skyDome: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, uniforms: CustomUniforms) {
    this.scene = scene;
    this.uniforms = uniforms;

    // Create sky dome
    const skyGeom = new THREE.SphereGeometry(15, 32, 15);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uColorTop: { value: new THREE.Color("#111827") },
        uColorBottom: { value: new THREE.Color("#374151") },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        uniform vec3 uColorTop;
        uniform vec3 uColorBottom;
        void main() {
          // Normalize height to [0,1]
          float h = normalize(vPosition).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(uColorBottom, uColorTop, h), 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeom, this.skyMaterial);
    this.scene.add(this.skyDome);

    this.initRain();
    this.initSnow();
    this.initCherryBlossoms();
    this.initAutumnLeaves();
  }

  // Procedurally generate circular alpha map for particles
  private createCircleTexture(color: string): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    return new THREE.CanvasTexture(canvas);
  }

  // Procedurally draw a petal shape texture
  private createPetalTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffb7c5";

    // Draw cherry blossom petal
    ctx.beginPath();
    ctx.moveTo(16, 4);
    ctx.bezierCurveTo(8, 0, 0, 12, 16, 28);
    ctx.bezierCurveTo(32, 12, 24, 0, 16, 4);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  private createBlowingLeafTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#d35400";

    // Draw leaf shape
    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.quadraticCurveTo(4, 16, 16, 30);
    ctx.quadraticCurveTo(28, 16, 16, 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  private initRain() {
    const count = 1500;
    const geom = new THREE.BufferGeometry();
    this.rainCoords = new Float32Array(count * 3);

    const rng = new SeededRandom(111);
    for (let i = 0; i < count; i++) {
      this.rainCoords[i * 3] = rng.range(-6, 6);
      this.rainCoords[i * 3 + 1] = rng.range(0.2, 8);
      this.rainCoords[i * 3 + 2] = rng.range(-6, 6);
    }

    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(this.rainCoords, 3)
    );

    // Stretched blueish points
    const mat = new THREE.PointsMaterial({
      color: "#7fb5ff",
      size: 0.05,
      transparent: true,
      opacity: 0.0, // starts hidden
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.rainPoints = new THREE.Points(geom, mat);
    this.scene.add(this.rainPoints);
  }

  private initSnow() {
    const count = 1500;
    const geom = new THREE.BufferGeometry();
    this.snowCoords = new Float32Array(count * 3);

    const rng = new SeededRandom(222);
    for (let i = 0; i < count; i++) {
      this.snowCoords[i * 3] = rng.range(-6, 6);
      this.snowCoords[i * 3 + 1] = rng.range(0.2, 8);
      this.snowCoords[i * 3 + 2] = rng.range(-6, 6);
    }

    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(this.snowCoords, 3)
    );

    const mat = new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.07,
      map: this.createCircleTexture("#ffffff"),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.snowPoints = new THREE.Points(geom, mat);
    this.scene.add(this.snowPoints);
  }

  private initCherryBlossoms() {
    const count = 200;
    const geom = new THREE.BufferGeometry();
    this.petalCoords = new Float32Array(count * 3);

    const rng = new SeededRandom(333);
    for (let i = 0; i < count; i++) {
      this.petalCoords[i * 3] = rng.range(-3, 3);
      this.petalCoords[i * 3 + 1] = rng.range(0.2, 5);
      this.petalCoords[i * 3 + 2] = rng.range(-3, 3);

      this.petalStates.push({
        velocity: new THREE.Vector3(
          rng.range(-0.3, 0.3),
          rng.range(-0.2, -0.6),
          rng.range(-0.3, 0.3)
        ),
        rotSpeed: new THREE.Vector3(
          rng.range(1, 4),
          rng.range(1, 4),
          rng.range(1, 4)
        ),
      });
    }

    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(this.petalCoords, 3)
    );

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      map: this.createPetalTexture(),
      transparent: true,
      opacity: 0.0,
      alphaTest: 0.1,
      depthWrite: false,
    });

    this.petalPoints = new THREE.Points(geom, mat);
    this.scene.add(this.petalPoints);
  }

  private initAutumnLeaves() {
    const count = 200;
    const geom = new THREE.BufferGeometry();
    this.leafCoords = new Float32Array(count * 3);

    const rng = new SeededRandom(444);
    for (let i = 0; i < count; i++) {
      this.leafCoords[i * 3] = rng.range(-3, 3);
      this.leafCoords[i * 3 + 1] = rng.range(0.2, 5);
      this.leafCoords[i * 3 + 2] = rng.range(-3, 3);

      this.leafStates.push({
        velocity: new THREE.Vector3(
          rng.range(-0.4, 0.4),
          rng.range(-0.3, -0.7),
          rng.range(-0.4, 0.4)
        ),
        rotSpeed: new THREE.Vector3(
          rng.range(1, 4),
          rng.range(1, 4),
          rng.range(1, 4)
        ),
      });
    }

    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(this.leafCoords, 3)
    );

    const mat = new THREE.PointsMaterial({
      size: 0.15,
      map: this.createBlowingLeafTexture(),
      transparent: true,
      opacity: 0.0,
      alphaTest: 0.1,
      depthWrite: false,
    });

    this.leafPoints = new THREE.Points(geom, mat);
    this.scene.add(this.leafPoints);
  }

  updateSkyColors(top: THREE.Color, bottom: THREE.Color) {
    (this.skyMaterial.uniforms["uColorTop"]!.value as THREE.Color).copy(top);
    (this.skyMaterial.uniforms["uColorBottom"]!.value as THREE.Color).copy(
      bottom
    );
  }

  updateParticles(
    time: number,
    delta: number,
    weather: "sunny" | "rainy" | "snowy" | "windy",
    windStrength: number
  ) {
    const activeRain = weather === "rainy";
    const activeSnow = weather === "snowy";
    const activePetals = weather === "sunny" || weather === "windy"; // Petals blow in spring sunny/windy
    const activeAutumnLeaves = weather === "windy"; // Autumn leaves blow in heavy wind

    // Interpolate opacity of particle groups
    if (this.rainPoints) {
      const mat = this.rainPoints.material as THREE.PointsMaterial;
      mat.opacity += ((activeRain ? 0.8 : 0.0) - mat.opacity) * 0.04;
      if (mat.opacity > 0.01) {
        this.animateRain(delta, windStrength);
      }
    }

    if (this.snowPoints) {
      const mat = this.snowPoints.material as THREE.PointsMaterial;
      mat.opacity += ((activeSnow ? 0.9 : 0.0) - mat.opacity) * 0.04;
      if (mat.opacity > 0.01) {
        this.animateSnow(time, delta, windStrength);
      }
    }

    if (this.petalPoints) {
      const mat = this.petalPoints.material as THREE.PointsMaterial;
      // Sakura petals only during spring (sunny/windy)
      const visible = activePetals;
      mat.opacity += ((visible ? 0.85 : 0.0) - mat.opacity) * 0.04;
      if (mat.opacity > 0.01) {
        this.animatePetals(time, delta, windStrength);
      }
    }

    if (this.leafPoints) {
      const mat = this.leafPoints.material as THREE.PointsMaterial;
      mat.opacity += ((activeAutumnLeaves ? 0.75 : 0.0) - mat.opacity) * 0.04;
      if (mat.opacity > 0.01) {
        this.animateAutumnLeaves(time, delta, windStrength);
      }
    }
  }

  private animateRain(delta: number, windStrength: number) {
    if (!this.rainPoints) return;
    const pos = this.rainPoints.geometry.attributes["position"]!;
    const coords = pos.array as Float32Array;

    for (let i = 0; i < coords.length / 3; i++) {
      // Rain drops fall fast
      coords[i * 3 + 1]! -= delta * 12.0;
      // Stretched by wind
      coords[i * 3]! += delta * windStrength * 0.8;

      // Reset when hitting pot plane
      if (coords[i * 3 + 1]! < 0.25) {
        coords[i * 3 + 1] = 8.0;
        coords[i * 3] = (Math.random() - 0.5) * 12;
        coords[i * 3 + 2] = (Math.random() - 0.5) * 12;
      }
    }
    pos.needsUpdate = true;
  }

  private animateSnow(time: number, delta: number, windStrength: number) {
    if (!this.snowPoints) return;
    const pos = this.snowPoints.geometry.attributes["position"]!;
    const coords = pos.array as Float32Array;

    for (let i = 0; i < coords.length / 3; i++) {
      coords[i * 3 + 1]! -= delta * 1.2;
      // Swaying horizontal drift
      coords[i * 3]! +=
        delta * (Math.sin(time * 2.0 + i) * 0.25 + windStrength * 0.2);

      if (coords[i * 3 + 1]! < 0.25) {
        coords[i * 3 + 1] = 8.0;
        coords[i * 3] = (Math.random() - 0.5) * 12;
        coords[i * 3 + 2] = (Math.random() - 0.5) * 12;
      }
    }
    pos.needsUpdate = true;
  }

  private animatePetals(time: number, delta: number, windStrength: number) {
    if (!this.petalPoints) return;
    const pos = this.petalPoints.geometry.attributes["position"]!;
    const coords = pos.array as Float32Array;

    for (let i = 0; i < coords.length / 3; i++) {
      const state = this.petalStates[i]!;
      // Fall slowly
      coords[i * 3 + 1]! += state.velocity.y * delta;

      // Wind pushes sideways
      coords[i * 3]! +=
        (state.velocity.x + windStrength * 0.8) * delta +
        Math.sin(time + i) * 0.05 * delta;
      coords[i * 3 + 2]! += state.velocity.z * delta;

      if (coords[i * 3 + 1]! < 0.25) {
        coords[i * 3 + 1] = 5.0;
        coords[i * 3] = (Math.random() - 0.5) * 6;
        coords[i * 3 + 2] = (Math.random() - 0.5) * 6;
      }
    }
    pos.needsUpdate = true;
  }

  private animateAutumnLeaves(
    time: number,
    delta: number,
    windStrength: number
  ) {
    if (!this.leafPoints) return;
    const pos = this.leafPoints.geometry.attributes["position"]!;
    const coords = pos.array as Float32Array;

    for (let i = 0; i < coords.length / 3; i++) {
      const state = this.leafStates[i]!;
      coords[i * 3 + 1]! += state.velocity.y * delta;

      // Strong wind vector + sin wobbles
      coords[i * 3]! +=
        (state.velocity.x + windStrength * 1.2) * delta +
        Math.sin(time * 1.5 + i) * 0.08 * delta;
      coords[i * 3 + 2]! += state.velocity.z * delta;

      if (coords[i * 3 + 1]! < 0.25) {
        coords[i * 3 + 1] = 5.0;
        coords[i * 3] = (Math.random() - 0.5) * 6;
        coords[i * 3 + 2] = (Math.random() - 0.5) * 6;
      }
    }
    pos.needsUpdate = true;
  }
}

// ==========================================
// 7. SEASON & WEATHER CLIMATE MANAGER
// ==========================================

interface ClimateVisuals {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPitch: number; // angle of sun
  snowUniform: number;
  wetUniform: number;
  windUniform: number;
}

const CLIMATE_PRESETS: { [key: string]: ClimateVisuals } = {
  spring_sunny_day: {
    skyTop: new THREE.Color("#68b3c8"),
    skyBottom: new THREE.Color("#c9e5ec"),
    fogColor: new THREE.Color("#dceef3"),
    fogDensity: 0.02,
    sunColor: new THREE.Color("#fffbe0"),
    sunIntensity: 2.2,
    sunPitch: Math.PI / 4,
    snowUniform: 0.0,
    wetUniform: 0.1,
    windUniform: 0.35,
  },
  summer_sunny_day: {
    skyTop: new THREE.Color("#1e88e5"),
    skyBottom: new THREE.Color("#90caf9"),
    fogColor: new THREE.Color("#b3e5fc"),
    fogDensity: 0.015,
    sunColor: new THREE.Color("#ffffff"),
    sunIntensity: 3.0,
    sunPitch: Math.PI / 3,
    snowUniform: 0.0,
    wetUniform: 0.0,
    windUniform: 0.2,
  },
  autumn_sunny_day: {
    skyTop: new THREE.Color("#8e44ad"),
    skyBottom: new THREE.Color("#e67e22"),
    fogColor: new THREE.Color("#fce4ec"),
    fogDensity: 0.025,
    sunColor: new THREE.Color("#ffe0b2"),
    sunIntensity: 2.0,
    sunPitch: Math.PI / 5,
    snowUniform: 0.0,
    wetUniform: 0.05,
    windUniform: 0.5,
  },
  winter_sunny_day: {
    skyTop: new THREE.Color("#2c3e50"),
    skyBottom: new THREE.Color("#bdc3c7"),
    fogColor: new THREE.Color("#eaeded"),
    fogDensity: 0.03,
    sunColor: new THREE.Color("#f4f6f7"),
    sunIntensity: 1.4,
    sunPitch: Math.PI / 6,
    snowUniform: 1.0,
    wetUniform: 0.0,
    windUniform: 0.3,
  },
  // Weather modifiers overlayed during transition
  rainy: {
    skyTop: new THREE.Color("#2c3e50"),
    skyBottom: new THREE.Color("#4a5568"),
    fogColor: new THREE.Color("#2d3748"),
    fogDensity: 0.08,
    sunColor: new THREE.Color("#a0aec0"),
    sunIntensity: 0.4,
    sunPitch: Math.PI / 4,
    snowUniform: 0.0,
    wetUniform: 1.0,
    windUniform: 0.9,
  },
  snowy: {
    skyTop: new THREE.Color("#374151"),
    skyBottom: new THREE.Color("#708090"),
    fogColor: new THREE.Color("#eceff1"),
    fogDensity: 0.06,
    sunColor: new THREE.Color("#dcdcdc"),
    sunIntensity: 0.6,
    sunPitch: Math.PI / 5,
    snowUniform: 1.0,
    wetUniform: 0.0,
    windUniform: 0.5,
  },
  windy: {
    skyTop: new THREE.Color("#1f2937"),
    skyBottom: new THREE.Color("#4b5563"),
    fogColor: new THREE.Color("#4b5563"),
    fogDensity: 0.04,
    sunColor: new THREE.Color("#cbd5e1"),
    sunIntensity: 0.8,
    sunPitch: Math.PI / 4,
    snowUniform: 0.0,
    wetUniform: 0.2,
    windUniform: 1.8,
  },
};

// Time of day overrides
const TIME_PRESETS: {
  [key: string]: {
    skyTop: string;
    skyBottom: string;
    sunIntensity: number;
    colorVal: string;
  };
} = {
  dawn: {
    skyTop: "#5b2c6f",
    skyBottom: "#f5b041",
    sunIntensity: 0.8,
    colorVal: "#f5b041",
  },
  day: { skyTop: "", skyBottom: "", sunIntensity: 1.0, colorVal: "" }, // uses default
  dusk: {
    skyTop: "#1f2937",
    skyBottom: "#e056fd",
    sunIntensity: 0.6,
    colorVal: "#ff7979",
  },
  night: {
    skyTop: "#050608",
    skyBottom: "#111827",
    sunIntensity: 0.15,
    colorVal: "#8c7ae6",
  },
};

// ==========================================
// 8. MAIN ENGINE CLASS
// ==========================================

class App {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  // Climate settings
  private currentSeason: "spring" | "summer" | "autumn" | "winter" = "spring";
  private currentWeather: "sunny" | "rainy" | "snowy" | "windy" = "sunny";
  private currentTime: "dawn" | "day" | "dusk" | "night" = "day";
  private autoCycle: boolean = true;
  private seasonCycleTime: number = 0;
  private transitionTimer: number = 1.0; // 0 to 1 transition

  // Ambient lights
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private bounceLight: THREE.PointLight;

  // Custom materials refs
  private uniforms: CustomUniforms;
  private tree: BonsaiTree;
  private weatherSystem: WeatherSystem;

  // Current interpolated values
  private currentVisuals: ClimateVisuals;
  private targetVisuals: ClimateVisuals;
  private startVisuals: ClimateVisuals;

  // Foliage state
  private leafStyle: "sakura" | "pine" = "sakura";
  private leafDensity: number = 70;
  private recursionDepth: number = 4;
  private branchingAngle: number = 28;
  private gnarliness: number = 0.6;

  private clock: THREE.Clock;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.clock = new THREE.Clock();

    // 1. Initialize WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    // Default start target settings
    this.currentVisuals = { ...CLIMATE_PRESETS["spring_sunny_day"]! };
    this.targetVisuals = { ...CLIMATE_PRESETS["spring_sunny_day"]! };
    this.startVisuals = { ...CLIMATE_PRESETS["spring_sunny_day"]! };

    this.scene.background = new THREE.Color(this.currentVisuals.skyBottom);
    this.scene.fog = new THREE.FogExp2(
      this.currentVisuals.fogColor,
      this.currentVisuals.fogDensity
    );

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 3.2, 5.5);

    // 3. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // lock ground clip
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 10.0;
    this.controls.target.set(0, 1.2, 0);

    // 4. Initial Light Rig
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 15;
    this.dirLight.shadow.camera.left = -3;
    this.dirLight.shadow.camera.right = 3;
    this.dirLight.shadow.camera.top = 3;
    this.dirLight.shadow.camera.bottom = -3;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Soft yellow spotlight glow near the base
    this.bounceLight = new THREE.PointLight(0xffe57f, 1.5, 5);
    this.bounceLight.position.set(0, 1.0, 0);
    this.scene.add(this.bounceLight);

    // 5. Setup Shaders Uniforms
    this.uniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: 0.25 },
      uSnowAccumulation: { value: 0.0 },
    };

    // 6. Generate Pot, Table, Soil Base
    const potGroup = new THREE.Group();
    this.scene.add(potGroup);

    this.tree = new BonsaiTree(this.uniforms);
    this.scene.add(this.tree.group);

    this.weatherSystem = new WeatherSystem(this.scene, this.uniforms);

    this.buildPotAndSoil(potGroup);
    this.tree.generateDecorationRocks(potGroup);

    // Initial Tree Construction
    this.tree.generate(
      this.recursionDepth,
      this.branchingAngle,
      this.gnarliness,
      this.leafStyle,
      this.leafDensity
    );

    // 7. Bind Listeners
    this.setupUI();
    window.addEventListener("resize", this.onWindowResize.bind(this));

    // Hide Loader
    const loader = document.getElementById("loader")!;
    loader.classList.add("fade-out");
    setTimeout(() => {
      loader.remove();
      document.getElementById("hud")!.classList.remove("hidden");
    }, 1200);

    // 8. Start loop
    this.animate();
  }

  private buildPotAndSoil(potGroup: THREE.Group) {
    // 1. Ceramic Pot (glossy finish dark glaze)
    const potMap = createCeramicTexture();
    const potMat = new THREE.MeshStandardMaterial({
      map: potMap,
      roughness: 0.15,
      metalness: 0.8,
    });

    // Oval ceramic pot shape
    const potGeom = new THREE.CylinderGeometry(1.6, 1.4, 0.5, 32);
    // Scale pot oval
    potGeom.scale(1.2, 1.0, 1.0);

    const pot = new THREE.Mesh(potGeom, potMat);
    pot.position.set(0, 0.25, 0);
    pot.castShadow = true;
    pot.receiveShadow = true;
    potGroup.add(pot);

    // Rim of the pot
    const rimGeom = new THREE.CylinderGeometry(1.7, 1.7, 0.08, 32);
    rimGeom.scale(1.2, 1.0, 1.0);
    const rim = new THREE.Mesh(rimGeom, potMat);
    rim.position.set(0, 0.5, 0);
    rim.castShadow = true;
    rim.receiveShadow = true;
    potGroup.add(rim);

    // 2. Soil/Moss Fill
    const mossMap = createMossTexture();
    const soilMat = new THREE.MeshStandardMaterial({
      map: mossMap,
      roughness: 0.95,
      bumpMap: mossMap,
      bumpScale: 0.08,
    });
    customizeMaterial(soilMat, this.uniforms);

    const soilGeom = new THREE.SphereGeometry(
      1.6,
      32,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );
    soilGeom.scale(1.18, 0.12, 0.98);
    const soil = new THREE.Mesh(soilGeom, soilMat);
    soil.position.set(0, 0.38, 0);
    soil.receiveShadow = true;
    potGroup.add(soil);

    // 3. Wooden stand (Table)
    const tableMat = new THREE.MeshStandardMaterial({
      color: "#1a0f0d",
      roughness: 0.4,
      metalness: 0.1,
    });

    const standTopGeom = new THREE.BoxGeometry(4.4, 0.15, 3.4);
    const standTop = new THREE.Mesh(standTopGeom, tableMat);
    standTop.position.set(0, 0.08, 0);
    standTop.castShadow = true;
    standTop.receiveShadow = true;
    potGroup.add(standTop);

    // Short table legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.18, 0.2);
    const offsets = [
      [-2.0, 2.0],
      [2.0, 2.0],
      [-2.0, -2.0],
      [2.0, -2.0],
    ];
    for (const off of offsets) {
      const leg = new THREE.Mesh(legGeom, tableMat);
      leg.position.set(off[0]! * 0.9, -0.01, off[1]! * 0.7);
      leg.castShadow = true;
      leg.receiveShadow = true;
      potGroup.add(leg);
    }
  }

  // Setup event binds and GUI triggers
  private setupUI() {
    // 1. Tab toggles
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const tabId = btn.getAttribute("data-tab")!;
        document
          .querySelectorAll(".tab-content")
          .forEach((tc) => tc.classList.remove("active"));
        document.getElementById(tabId)!.classList.add("active");
      });
    });

    // 2. Select Buttons (Seasons, Weather, Time, Style)
    const bindSelectBtn = (
      selector: string,
      callback: (val: string) => void
    ) => {
      const btns = document.querySelectorAll(selector);
      btns.forEach((btn) => {
        btn.addEventListener("click", () => {
          btns.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          callback(btn.getAttribute("data-val") || "");
        });
      });
    };

    bindSelectBtn("[id^='btn-season-']", (val) => {
      this.triggerTransition(
        val as "spring" | "summer" | "autumn" | "winter",
        this.currentWeather,
        this.currentTime
      );
      // Disable auto cycle on manual press
      const chk = document.getElementById("chk-auto-cycle") as HTMLInputElement;
      chk.checked = false;
      this.autoCycle = false;
    });

    bindSelectBtn("[id^='btn-weather-']", (val) => {
      this.triggerTransition(
        this.currentSeason,
        val as "sunny" | "rainy" | "snowy" | "windy",
        this.currentTime
      );
    });

    bindSelectBtn("[id^='btn-time-']", (val) => {
      this.triggerTransition(
        this.currentSeason,
        this.currentWeather,
        val as "dawn" | "day" | "dusk" | "night"
      );
    });

    bindSelectBtn("[id^='btn-style-']", (val) => {
      this.leafStyle = val as "sakura" | "pine";
      this.regenerateTree();
    });

    // Auto cycle toggle
    document
      .getElementById("chk-auto-cycle")!
      .addEventListener("change", (e) => {
        this.autoCycle = (e.target as HTMLInputElement).checked;
        this.seasonCycleTime = 0;
      });

    // Sliders
    const setupSlider = (
      id: string,
      lblId: string,
      callback: (v: number) => void,
      suffix: string = ""
    ) => {
      const input = document.getElementById(id) as HTMLInputElement;
      const lbl = document.getElementById(lblId)!;
      input.addEventListener("input", () => {
        lbl.innerText = input.value + suffix;
        callback(parseFloat(input.value));
      });
    };

    setupSlider("rng-depth", "lbl-depth", (v) => {
      this.recursionDepth = v;
    });
    setupSlider(
      "rng-angle",
      "lbl-angle",
      (v) => {
        this.branchingAngle = v;
      },
      "°"
    );
    setupSlider("rng-gnarl", "lbl-gnarl", (v) => {
      this.gnarliness = v;
    });
    setupSlider(
      "rng-leaf-density",
      "lbl-leaf-density",
      (v) => {
        this.leafDensity = v;
      },
      "%"
    );

    // Prune Action
    document.getElementById("btn-prune")!.addEventListener("click", () => {
      this.regenerateTree();
    });

    // Reset View Action
    document.getElementById("btn-reset-cam")!.addEventListener("click", () => {
      this.camera.position.set(0, 3.2, 5.5);
      this.controls.target.set(0, 1.2, 0);
    });

    // Audio Prompt overlay & volume
    const audioPrompt = document.getElementById("audio-prompt")!;
    // Check local storage or just show prompt
    setTimeout(() => {
      audioPrompt.classList.remove("hidden");
    }, 1800);

    const closeAudioPrompt = (enable: boolean) => {
      audioPrompt.classList.add("fade-out");
      setTimeout(() => audioPrompt.remove(), 600);
      zenAudio.toggle(enable);
      this.updateAudioButtonState();
    };

    document
      .getElementById("btn-prompt-yes")!
      .addEventListener("click", () => closeAudioPrompt(true));
    document
      .getElementById("btn-prompt-no")!
      .addEventListener("click", () => closeAudioPrompt(false));

    // Audio button trigger
    const audioBtn = document.getElementById("btn-audio-toggle")!;
    audioBtn.addEventListener("click", () => {
      zenAudio.toggle();
      this.updateAudioButtonState();
    });

    // Audio slider
    const volInput = document.getElementById(
      "rng-audio-vol"
    ) as HTMLInputElement;
    volInput.addEventListener("input", () => {
      zenAudio.setVolume(parseFloat(volInput.value));
    });
  }

  private updateAudioButtonState() {
    const audioBtn = document.getElementById("btn-audio-toggle")!;
    if (zenAudio.toggle(true)) {
      // It is active
      audioBtn.innerText = "🔊 Sound On";
      audioBtn.style.borderColor = "#d4af37";
    } else {
      audioBtn.innerText = "🔇 Sound Off";
      audioBtn.style.borderColor = "";
      zenAudio.toggle(false); // keep synced
    }
  }

  private regenerateTree() {
    // Force a re-gen with parameters
    this.tree.generate(
      this.recursionDepth,
      this.branchingAngle,
      this.gnarliness,
      this.leafStyle,
      this.leafDensity
    );
    // Force direct update of seasonal leaf colors/ratios
    this.updateSeasonalLeaves(1.0);
  }

  // Prepares climate state shift interpolations
  private triggerTransition(
    season: "spring" | "summer" | "autumn" | "winter",
    weather: "sunny" | "rainy" | "snowy" | "windy",
    timeVal: "dawn" | "day" | "dusk" | "night"
  ) {
    this.currentSeason = season;
    this.currentWeather = weather;
    this.currentTime = timeVal;

    // 1. Resolve Season & Weather Base Configs
    const presetKey = `${season}_sunny_day`;
    const basePreset =
      CLIMATE_PRESETS[presetKey] || CLIMATE_PRESETS["spring_sunny_day"]!;
    const weatherPreset = CLIMATE_PRESETS[weather];

    // Compute blended targets
    const target = { ...basePreset };

    if (weatherPreset && weather !== "sunny") {
      // Rain, snow, wind modify fog, light, sky, etc.
      target.skyTop = weatherPreset.skyTop;
      target.skyBottom = weatherPreset.skyBottom;
      target.fogColor = weatherPreset.fogColor;
      target.fogDensity = weatherPreset.fogDensity;
      target.sunColor = weatherPreset.sunColor;
      target.sunIntensity = weatherPreset.sunIntensity;
      target.wetUniform = weatherPreset.wetUniform;
      target.windUniform = weatherPreset.windUniform;

      // Keep snow active in winter/snowy
      if (weather === "snowy") {
        target.snowUniform = 1.0;
      } else {
        target.snowUniform = 0.0;
      }
    }

    // Adjust winter snow cover even when sunny
    if (season === "winter") {
      target.snowUniform = 1.0;
    }

    // 2. Apply Time of Day Overrides
    const timeOverride = TIME_PRESETS[timeVal];
    if (timeOverride) {
      if (timeOverride.skyTop) {
        target.skyTop = new THREE.Color(timeOverride.skyTop);
      }
      if (timeOverride.skyBottom) {
        target.skyBottom = new THREE.Color(timeOverride.skyBottom);
      }
      target.sunIntensity *= timeOverride.sunIntensity;

      if (timeOverride.colorVal) {
        const todCol = new THREE.Color(timeOverride.colorVal);
        target.sunColor = target.sunColor.clone().multiply(todCol);
        target.fogColor = target.fogColor.clone().multiply(todCol);
      }
    }

    // 3. Initiate interpolation
    this.startVisuals = {
      skyTop: this.currentVisuals.skyTop.clone(),
      skyBottom: this.currentVisuals.skyBottom.clone(),
      fogColor: this.currentVisuals.fogColor.clone(),
      fogDensity: this.currentVisuals.fogDensity,
      sunColor: this.currentVisuals.sunColor.clone(),
      sunIntensity: this.currentVisuals.sunIntensity,
      sunPitch: this.currentVisuals.sunPitch,
      snowUniform: this.currentVisuals.snowUniform,
      wetUniform: this.currentVisuals.wetUniform,
      windUniform: this.currentVisuals.windUniform,
    };

    this.targetVisuals = target;
    this.transitionTimer = 0.0;

    // Update HUD status labels
    const formatLabel = (txt: string) =>
      txt.charAt(0).toUpperCase() + txt.slice(1);
    document.getElementById("current-season-lbl")!.innerText = formatLabel(
      this.currentSeason
    );

    let weatherTxt = formatLabel(this.currentWeather);
    if (this.currentWeather === "sunny") {
      weatherTxt = this.currentTime === "night" ? "Clear Sky" : "Sunny & Warm";
    } else if (this.currentWeather === "windy") {
      weatherTxt = "Breezy Gale";
    }
    document.getElementById("current-weather-lbl")!.innerText = weatherTxt;
    document.getElementById("current-time-lbl")!.innerText = formatLabel(
      this.currentTime
    );

    // Sync Audio
    const rainVol = weather === "rainy" ? 1.0 : 0.0;
    const windVol =
      weather === "windy"
        ? 1.0
        : weather === "rainy" || weather === "snowy"
          ? 0.4
          : 0.1;
    zenAudio.updateClimateSound(rainVol, windVol);
  }

  // Updates seasonal leaf colors and branch-shed ratio
  private updateSeasonalLeaves(_progress: number) {
    // Fetch target colors based on season
    let colorRanges: [THREE.Color, THREE.Color][];
    let leafRatio: number;

    const c = (hex: string) => new THREE.Color(hex);

    if (this.leafStyle === "sakura") {
      if (this.currentSeason === "spring") {
        // Cherry blossom pinks
        colorRanges = [
          [c("#ffb7c5"), c("#ffd1dc")],
          [c("#ffd1dc"), c("#fff0f5")],
          [c("#ffb7c5"), c("#e8a7b5")],
        ];
        leafRatio = 1.0;
      } else if (this.currentSeason === "summer") {
        // Transition to lush green
        colorRanges = [
          [c("#2ecc71"), c("#27ae60")],
          [c("#1b4d3e"), c("#2e7d32")],
        ];
        leafRatio = 1.0;
      } else if (this.currentSeason === "autumn") {
        // Rich amber/gold
        colorRanges = [
          [c("#e67e22"), c("#d35400")],
          [c("#f1c40f"), c("#f39c12")],
          [c("#c0392b"), c("#962d22")],
        ];
        leafRatio = 0.75;
      } else {
        // Winter: Bare branches
        colorRanges = [[c("#4a3728"), c("#5c4033")]];
        leafRatio = 0.02; // leaves fall off
      }
    } else {
      // Pine foliage (Evergreen: stays green, gets darker and gets snow overlay)
      leafRatio = 1.0;
      if (this.currentSeason === "spring") {
        colorRanges = [[c("#27ae60"), c("#1e8449")]];
      } else if (this.currentSeason === "summer") {
        colorRanges = [[c("#1e824c"), c("#196f3d")]];
      } else if (this.currentSeason === "autumn") {
        colorRanges = [[c("#145a32"), c("#1b4f72")]];
      } else {
        // Cold greyish deep conifer green
        colorRanges = [[c("#113f26"), c("#1f2d3d")]];
      }
    }

    this.tree.updateLeafColors(colorRanges, leafRatio);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Linear interpolates colors/values
  private updateTransitions(delta: number) {
    if (this.transitionTimer < 1.0) {
      this.transitionTimer += delta * 0.5; // 2 seconds transition
      if (this.transitionTimer > 1.0) this.transitionTimer = 1.0;

      const t = this.transitionTimer;

      // Color LERPs
      this.currentVisuals.skyTop
        .copy(this.startVisuals.skyTop)
        .lerp(this.targetVisuals.skyTop, t);
      this.currentVisuals.skyBottom
        .copy(this.startVisuals.skyBottom)
        .lerp(this.targetVisuals.skyBottom, t);
      this.currentVisuals.fogColor
        .copy(this.startVisuals.fogColor)
        .lerp(this.targetVisuals.fogColor, t);
      this.currentVisuals.sunColor
        .copy(this.startVisuals.sunColor)
        .lerp(this.targetVisuals.sunColor, t);

      // Floats LERPs
      this.currentVisuals.fogDensity = THREE.MathUtils.lerp(
        this.startVisuals.fogDensity,
        this.targetVisuals.fogDensity,
        t
      );
      this.currentVisuals.sunIntensity = THREE.MathUtils.lerp(
        this.startVisuals.sunIntensity,
        this.targetVisuals.sunIntensity,
        t
      );
      this.currentVisuals.sunPitch = THREE.MathUtils.lerp(
        this.startVisuals.sunPitch,
        this.targetVisuals.sunPitch,
        t
      );
      this.currentVisuals.snowUniform = THREE.MathUtils.lerp(
        this.startVisuals.snowUniform,
        this.targetVisuals.snowUniform,
        t
      );
      this.currentVisuals.wetUniform = THREE.MathUtils.lerp(
        this.startVisuals.wetUniform,
        this.targetVisuals.wetUniform,
        t
      );
      this.currentVisuals.windUniform = THREE.MathUtils.lerp(
        this.startVisuals.windUniform,
        this.targetVisuals.windUniform,
        t
      );

      // Apply changes to scene environment
      this.scene.background = this.currentVisuals.skyBottom;
      const fog = this.scene.fog as THREE.FogExp2;
      fog.color.copy(this.currentVisuals.fogColor);
      fog.density = this.currentVisuals.fogDensity;

      this.dirLight.color.copy(this.currentVisuals.sunColor);
      this.dirLight.intensity = this.currentVisuals.sunIntensity;

      // Move Sun angle
      const pitch = this.currentVisuals.sunPitch;
      this.dirLight.position.set(Math.cos(pitch) * 4, Math.sin(pitch) * 6, 2.0);

      // Apply custom uniforms for shaders
      this.uniforms.uSnowAccumulation.value = this.currentVisuals.snowUniform;
      this.uniforms.uWindStrength.value = this.currentVisuals.windUniform;

      // Slowly update leaf colors during season transitions
      this.updateSeasonalLeaves(t);
    }
  }

  // Animation render loop
  private animate() {
    requestAnimationFrame(this.animate.bind(this));

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Process automated season cycling
    if (this.autoCycle) {
      this.seasonCycleTime += delta;
      if (this.seasonCycleTime > 30.0) {
        // Cycle every 30 seconds
        this.seasonCycleTime = 0;
        const seasonsList: ("spring" | "summer" | "autumn" | "winter")[] = [
          "spring",
          "summer",
          "autumn",
          "winter",
        ];
        const currIdx = seasonsList.indexOf(this.currentSeason);
        const nextSeason = seasonsList[(currIdx + 1) % 4]!;

        // Auto update button styling in UI
        document
          .querySelectorAll("[id^='btn-season-']")
          .forEach((b) => b.classList.remove("active"));
        document
          .getElementById(`btn-season-${nextSeason}`)!
          .classList.add("active");

        this.triggerTransition(
          nextSeason,
          this.currentWeather,
          this.currentTime
        );
      }
    }

    // 2. Interpolate visuals
    this.updateTransitions(delta);

    // 3. Update uniforms
    this.uniforms.uTime.value = time;

    // 4. Sway tree trunk/branches hierarchically
    this.tree.updateBranchSway(time, this.currentVisuals.windUniform);

    // 5. Update SkyDome shaders
    this.weatherSystem.updateSkyColors(
      this.currentVisuals.skyTop,
      this.currentVisuals.skyBottom
    );

    // 6. Update particle generators
    this.weatherSystem.updateParticles(
      time,
      delta,
      this.currentWeather,
      this.currentVisuals.windUniform
    );

    // 7. Update rendering frame
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate engine when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  new App();
});
