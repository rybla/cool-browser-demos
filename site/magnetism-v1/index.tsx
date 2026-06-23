import * as THREE from "three";

// ============================================================================
// 1. SEEDED RANDOM GENERATOR (For deterministic filings & grids)
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

// ============================================================================
// 2. MAGNET CLASS (Rigid Body State & Magnetic Properties)
// ============================================================================
class Magnet {
  id: string;
  type: "bar" | "sphere" | "compass" | "electromagnet" | "filing";

  // Physical State
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angularVelocity: THREE.Vector3;

  // Physical Parameters
  mass: number;
  momentOfInertia: number;
  strength: number; // Magnetic dipole moment magnitude
  current: number = 1.0; // For electromagnets, controls strength & direction

  radius: number;
  length: number;

  isPositionFrozen: boolean = false;
  isRotationFrozen: boolean = false;

  // Visual meshes
  group: THREE.Group;
  mesh: THREE.Object3D | null = null;
  forceArrow: THREE.ArrowHelper | null = null;
  torqueArrow: THREE.ArrowHelper | null = null;

  // Solver accumulators
  force = new THREE.Vector3();
  torque = new THREE.Vector3();

  // Maze specific properties
  isMazeBall: boolean = false;

  constructor(options: {
    type: "bar" | "sphere" | "compass" | "electromagnet" | "filing";
    position: THREE.Vector3;
    quaternion?: THREE.Quaternion;
    isPositionFrozen?: boolean;
    isRotationFrozen?: boolean;
    strength?: number;
    current?: number;
    isMazeBall?: boolean;
  }) {
    this.id = Math.random().toString(36).substring(2, 9);
    this.type = options.type;
    this.position = options.position.clone();
    this.velocity = new THREE.Vector3();
    this.quaternion = options.quaternion
      ? options.quaternion.clone()
      : new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3();

    this.isPositionFrozen = options.isPositionFrozen || false;
    this.isRotationFrozen = options.isRotationFrozen || false;
    this.isMazeBall = options.isMazeBall || false;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.quaternion);

    // Differentiate types
    if (this.type === "bar") {
      this.mass = 2.0;
      this.radius = 0.35;
      this.length = 1.8;
      this.momentOfInertia =
        (1 / 12) *
        this.mass *
        (3 * this.radius * this.radius + this.length * this.length);
      this.strength = options.strength !== undefined ? options.strength : 12.0;
    } else if (this.type === "sphere") {
      this.mass = 1.0;
      this.radius = 0.45;
      this.length = 0;
      this.momentOfInertia = (2 / 5) * this.mass * this.radius * this.radius;
      this.strength = options.strength !== undefined ? options.strength : 8.0;
    } else if (this.type === "compass") {
      this.mass = 0.2;
      this.radius = 0.3;
      this.length = 0.8;
      this.momentOfInertia = 0.05;
      this.strength = options.strength !== undefined ? options.strength : 0.8;
      this.isPositionFrozen = true;
      this.isRotationFrozen = false; // Needle spins
    } else if (this.type === "electromagnet") {
      this.mass = 4.0;
      this.radius = 0.5;
      this.length = 2.0;
      this.momentOfInertia =
        (1 / 12) *
        this.mass *
        (3 * this.radius * this.radius + this.length * this.length);
      this.strength = 5.0; // Base strength per Ampere
      this.current = options.current !== undefined ? options.current : 2.0;
    } else {
      // filing
      this.mass = 0.02;
      this.radius = 0.05;
      this.length = 0.35;
      this.momentOfInertia = 0.001;
      this.strength = 0; // Induced
    }
  }

  // Calculates the magnetic moment vector in global coordinates
  getMagneticMoment(): THREE.Vector3 {
    let mag = this.strength;
    if (this.type === "electromagnet") {
      mag = this.strength * this.current;
    }
    // Dipole points along the local Y axis
    return new THREE.Vector3(0, mag, 0).applyQuaternion(this.quaternion);
  }
}

// ============================================================================
// 3. VISUAL ASSETS GENERATORS
// ============================================================================

// Programmatic glow texture for flux flow particles and sparks
function createGlowTexture(colorHex: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.2, colorHex);
  gradient.addColorStop(0.5, "rgba(0, 242, 254, 0.35)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Materials Cache
const materials = {
  north: new THREE.MeshBasicMaterial({ color: 0xff4757, toneMapped: false }),
  south: new THREE.MeshBasicMaterial({ color: 0x2e86de, toneMapped: false }),
  iron: new THREE.MeshStandardMaterial({
    color: 0x5c6875,
    roughness: 0.5,
    metalness: 0.8,
  }),
  copper: new THREE.MeshStandardMaterial({
    color: 0xd35400,
    roughness: 0.3,
    metalness: 0.9,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xf1c40f,
    roughness: 0.2,
    metalness: 0.9,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0x7f8c8d,
    roughness: 0.4,
    metalness: 0.8,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    transmission: 0.9,
    roughness: 0.1,
    thickness: 0.5,
    depthWrite: false,
  }),
  glowLine: new THREE.LineBasicMaterial({
    color: 0x00f2fe,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
  }),
  spark: new THREE.PointsMaterial({
    size: 0.35,
    map: createGlowTexture("#ff9f43"),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  fluxParticle: new THREE.PointsMaterial({
    size: 0.2,
    map: createGlowTexture("#00f2fe"),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
};

// ============================================================================
// 4. MAIN APPLICATION SYSTEM
// ============================================================================
class MagnetismApp {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Custom Camera Controller (Orbit alternative)
  private cameraTheta = Math.PI / 4;
  private cameraPhi = Math.PI / 3;
  private cameraDistance = 14.0;
  private cameraTarget = new THREE.Vector3(0, 0, 0);

  // Lighting
  private ambientLight!: THREE.AmbientLight;
  private dirLight1!: THREE.DirectionalLight;
  private dirLight2!: THREE.DirectionalLight;

  // Physics Config & Entities
  private magnets: Magnet[] = [];
  private gravity = new THREE.Vector3(0, 0, 0);
  private globalDamping = 0.02;
  private globalMagnetScale = 1.0;
  private isPaused = false;
  private maxBounds = new THREE.Vector3(8.0, 6.0, 8.0); // Bounding box for sandbox

  // Interactive Grabbing Physics
  private grabbedMagnet: Magnet | null = null;
  private grabPlane = new THREE.Plane();
  private grabOffset = new THREE.Vector3();
  private mousePos = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private grabDepthOffset = 0.0; // Modulate depth with scroll wheel
  private hoveredMagnet: Magnet | null = null;

  // Visualizations Toggles
  private showFieldLines = true;
  private showFluxParticles = true;
  private showHeatmap = false;
  private showCompassGrid = false;
  private showForces = true;

  // Traced Visual Assets
  private fieldLineSegments: THREE.LineSegments | null = null;
  private fluxParticleSystem: THREE.Points | null = null;
  private fluxParticles: Array<{
    magnetId: string;
    pathIndex: number;
    stepIndex: number;
    t: number; // Progress along the segment
    speed: number;
  }> = [];
  private tracedPaths: THREE.Vector3[][] = [];

  // Heatmap Slice Plane
  private heatmapSlice: THREE.Mesh | null = null;

  // Compass Grid
  private compassGridGroup = new THREE.Group();
  private compassGridMesh: THREE.InstancedMesh | null = null;

  // Spark Particles System
  private sparkParticles: Array<{
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    age: number;
    maxAge: number;
  }> = [];
  private sparkSystem: THREE.Points | null = null;

  // Presets & Challenges State
  private currentPresetName = "sandbox";
  private timeInLevitationZone = 0.0;
  private mazeTargetMesh: THREE.Mesh | null = null;
  private mazeObstacles: THREE.Mesh[] = [];
  private mazeBall: Magnet | null = null;
  private isLevelComplete = false;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;

    // Init WebGL Renderer
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
    this.scene.background = new THREE.Color(0x07090e);
    this.scene.fog = new THREE.FogExp2(0x07090e, 0.025);

    // Camera Init
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.updateCameraPosition();

    // Setup visual components
    this.initLights();
    this.initBoundariesVisuals();
    this.initHeatmapSlice();
    this.initEventHandlers();

    // Set first Preset
    this.loadPreset("sandbox");

    // Start Loops
    this.animate();
  }

  // ============================================================================
  // SCENE CREATION & RENDER INIT
  // ============================================================================
  private initLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambientLight);

    this.dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    this.dirLight1.position.set(10, 18, 12);
    this.dirLight1.castShadow = true;
    this.dirLight1.shadow.mapSize.width = 1024;
    this.dirLight1.shadow.mapSize.height = 1024;
    this.dirLight1.shadow.bias = -0.0005;
    this.scene.add(this.dirLight1);

    this.dirLight2 = new THREE.DirectionalLight(0x4facfe, 0.45);
    this.dirLight2.position.set(-10, -5, -10);
    this.scene.add(this.dirLight2);

    // Subtle blue point light for the grid glow
    const pointLight = new THREE.PointLight(0x00f2fe, 1.2, 30);
    pointLight.position.set(0, 0, 0);
    this.scene.add(pointLight);
  }

  // Draw boundary grid box representing sandbox walls
  private initBoundariesVisuals() {
    const boxGeo = new THREE.BoxGeometry(
      this.maxBounds.x * 2,
      this.maxBounds.y * 2,
      this.maxBounds.z * 2
    );
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
    });
    const boxLines = new THREE.LineSegments(edges, lineMat);
    this.scene.add(boxLines);

    // Floor Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x00f2fe, 0x222a36);
    gridHelper.position.y = -this.maxBounds.y;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.25;
    this.scene.add(gridHelper);
  }

  // Heatmap Slice (Evaluates field intensity at Y=0)
  private initHeatmapSlice() {
    const geo = new THREE.PlaneGeometry(
      this.maxBounds.x * 2.2,
      this.maxBounds.z * 2.2,
      100,
      100
    );

    // Shader Material evaluating field density dynamically
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMagnetCount: { value: 0 },
        uMagnetPositions: { value: Array(16).fill(new THREE.Vector3()) },
        uMagnetMoments: { value: Array(16).fill(new THREE.Vector3()) },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        uniform int uMagnetCount;
        uniform vec3 uMagnetPositions[16];
        uniform vec3 uMagnetMoments[16];
        uniform float uTime;

        void main() {
          vec3 Bnet = vec3(0.0);
          
          for (int i = 0; i < 16; i++) {
            if (i >= uMagnetCount) break;
            
            vec3 p_mag = uMagnetPositions[i];
            vec3 m_mag = uMagnetMoments[i];
            vec3 r = vWorldPosition - p_mag;
            float rLen = length(r);
            
            // Soften to prevent pole singularities
            float rSoft = max(rLen, 0.45);
            vec3 rHat = r / rLen;
            
            // Dipole field formula: B = 3*(m.rHat)*rHat - m / r^3
            float mDotR = dot(m_mag, rHat);
            vec3 B_i = (3.0 * mDotR * rHat - m_mag) / (rSoft * rSoft * rSoft);
            
            Bnet += B_i;
          }
          
          float B_strength = length(Bnet);
          
          // Logarithmic scale for color maps
          float logStrength = log(1.0 + B_strength * 2.5);
          
          vec3 colIndigo = vec3(0.02, 0.04, 0.12);
          vec3 colCyan = vec3(0.0, 0.75, 1.0);
          vec3 colYellow = vec3(1.0, 0.65, 0.2);
          vec3 colWhite = vec3(1.0, 0.95, 0.8);
          
          vec3 color = colIndigo;
          if (logStrength < 0.8) {
            color = mix(colIndigo, colCyan, logStrength / 0.8);
          } else if (logStrength < 1.8) {
            color = mix(colCyan, colYellow, (logStrength - 0.8) / 1.0);
          } else {
            color = mix(colYellow, colWhite, min((logStrength - 1.8) / 1.2, 1.0));
          }
          
          // Animate glowing lines showing vector wavefront contour
          float waves = sin(logStrength * 16.0 - uTime * 2.8) * 0.5 + 0.5;
          waves = smoothstep(0.82, 0.98, waves) * 0.22;
          color += vec3(waves * 0.4, waves * 0.8, waves);
          
          // Transparency gradient to fade at sandbox borders
          float distFromCenter = length(vWorldPosition.xz);
          float borderFade = smoothstep(16.0, 8.0, distFromCenter);
          
          float alpha = smoothstep(0.02, 0.4, logStrength) * 0.6 * borderFade;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.heatmapSlice = new THREE.Mesh(geo, material);
    this.heatmapSlice.rotation.x = -Math.PI / 2;
    this.heatmapSlice.position.y = 0.0;
    this.heatmapSlice.visible = this.showHeatmap;
    this.scene.add(this.heatmapSlice);
  }

  // ============================================================================
  // GEOMETRY GENERATION FOR MAGNET TYPES
  // ============================================================================
  private buildMagnetMesh(magnet: Magnet) {
    const parentGroup = magnet.group;

    if (magnet.type === "bar") {
      // Cylindrical Bar magnet. North (Red) + South (Blue) hemispheres
      const r = magnet.radius;
      const h = magnet.length / 2;

      // North cylinder
      const geoN = new THREE.CylinderGeometry(r, r, h, 20);
      geoN.translate(0, h / 2, 0);
      const meshN = new THREE.Mesh(geoN, materials.north);
      meshN.castShadow = true;
      meshN.receiveShadow = true;
      parentGroup.add(meshN);

      // South cylinder
      const geoS = new THREE.CylinderGeometry(r, r, h, 20);
      geoS.translate(0, -h / 2, 0);
      const meshS = new THREE.Mesh(geoS, materials.south);
      meshS.castShadow = true;
      meshS.receiveShadow = true;
      parentGroup.add(meshS);

      // Center silver seam
      const seamGeo = new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.08, 20);
      const seamMesh = new THREE.Mesh(seamGeo, materials.iron);
      parentGroup.add(seamMesh);
    } else if (magnet.type === "sphere") {
      // Sphere: North half Red, South half Blue.
      const r = magnet.radius;
      const groupSph = new THREE.Group();

      const geoN = new THREE.SphereGeometry(
        r,
        24,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      );
      const meshN = new THREE.Mesh(geoN, materials.north);
      meshN.castShadow = true;
      meshN.receiveShadow = true;
      groupSph.add(meshN);

      const geoS = new THREE.SphereGeometry(
        r,
        24,
        12,
        0,
        Math.PI * 2,
        Math.PI / 2,
        Math.PI / 2
      );
      const meshS = new THREE.Mesh(geoS, materials.south);
      meshS.castShadow = true;
      meshS.receiveShadow = true;
      groupSph.add(meshS);

      // Rotated group so polar axis aligns with Y
      groupSph.rotation.x = Math.PI / 2;

      // Special metallic overlay if it's the maze ball
      if (magnet.isMazeBall) {
        const ringGeo = new THREE.TorusGeometry(r + 0.02, 0.04, 8, 24);
        const ring = new THREE.Mesh(ringGeo, materials.gold);
        ring.rotation.x = Math.PI / 2;
        groupSph.add(ring);
      }

      parentGroup.add(groupSph);
    } else if (magnet.type === "compass") {
      // Dial needle
      const l = magnet.length;

      // Stand
      const standGeo = new THREE.CylinderGeometry(0.06, 0.15, 0.5, 12);
      standGeo.translate(0, -0.25, 0);
      const standMesh = new THREE.Mesh(standGeo, materials.iron);
      standMesh.castShadow = true;
      parentGroup.add(standMesh);

      const pinGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8);
      pinGeo.translate(0, 0.1, 0);
      const pinMesh = new THREE.Mesh(pinGeo, materials.iron);
      parentGroup.add(pinMesh);

      // Needle group (which rotates physically)
      const needleGroup = new THREE.Group();
      needleGroup.position.set(0, 0.25, 0);
      needleGroup.name = "needle";

      // Double cone needle (North Red, South Blue)
      const nGeo = new THREE.ConeGeometry(0.12, l / 2, 8);
      nGeo.translate(0, l / 4, 0);
      nGeo.rotateX(Math.PI / 2); // Align along local Y
      const nMesh = new THREE.Mesh(nGeo, materials.north);
      nMesh.castShadow = true;
      needleGroup.add(nMesh);

      const sGeo = new THREE.ConeGeometry(0.12, l / 2, 8);
      sGeo.translate(0, -l / 4, 0);
      sGeo.rotateX(-Math.PI / 2);
      const sMesh = new THREE.Mesh(sGeo, materials.south);
      sMesh.castShadow = true;
      needleGroup.add(sMesh);

      // Center pivot cap
      const capGeo = new THREE.SphereGeometry(0.08, 12, 12);
      const capMesh = new THREE.Mesh(capGeo, materials.gold);
      needleGroup.add(capMesh);

      parentGroup.add(needleGroup);
    } else if (magnet.type === "electromagnet") {
      const r = magnet.radius;
      const h = magnet.length;

      // Iron Core (center cylinder)
      const coreGeo = new THREE.CylinderGeometry(
        r * 0.6,
        r * 0.6,
        h * 1.05,
        20
      );
      const coreMesh = new THREE.Mesh(coreGeo, materials.iron);
      coreMesh.castShadow = true;
      parentGroup.add(coreMesh);

      // Copper Coil wrappings
      const coilGroup = new THREE.Group();
      const turns = 10;
      for (let i = 0; i < turns; i++) {
        const yOffset = -h / 2 + (h / (turns - 1)) * i;
        const windingGeo = new THREE.TorusGeometry(r * 0.9, 0.08, 10, 24);
        const winding = new THREE.Mesh(windingGeo, materials.copper);
        winding.rotation.x = Math.PI / 2;
        winding.position.y = yOffset;
        winding.castShadow = true;
        coilGroup.add(winding);
      }
      parentGroup.add(coilGroup);

      // Terminals structure
      const termGeo = new THREE.BoxGeometry(0.2, 0.3, 0.4);
      termGeo.translate(0, 0, -r * 1.1);
      const terminal = new THREE.Mesh(termGeo, materials.iron);
      parentGroup.add(terminal);

      // Direction indicator arrow glow representing active currents
      const currentArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, r + 0.1),
        0.6,
        0xffa500,
        0.2,
        0.15
      );
      currentArrow.name = "currentIndicator";
      parentGroup.add(currentArrow);
    } else if (magnet.type === "filing") {
      // Iron Filings - tiny cylinders
      const r = magnet.radius;
      const l = magnet.length;

      const geo = new THREE.CylinderGeometry(r, r, l, 6);
      const mesh = new THREE.Mesh(geo, materials.iron);
      parentGroup.add(mesh);
    }

    // Add glowing halo indicator to illustrate locking states
    const glowGeo = new THREE.RingGeometry(
      magnet.radius * 1.1,
      magnet.radius * 1.25,
      16
    );
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0, // Hidden initially
      blending: THREE.AdditiveBlending,
    });
    const selectionRing = new THREE.Mesh(glowGeo, glowMat);
    selectionRing.name = "selectionRing";
    selectionRing.rotation.x = Math.PI / 2;
    parentGroup.add(selectionRing);

    // Forces visualization arrows
    if (this.showForces && magnet.type !== "filing") {
      const forceArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        0x00ff00,
        0.3,
        0.2
      );
      forceArrow.name = "forceArrow";
      parentGroup.add(forceArrow);
      magnet.forceArrow = forceArrow;

      const torqueArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        0xff00ff,
        0.3,
        0.2
      );
      torqueArrow.name = "torqueArrow";
      parentGroup.add(torqueArrow);
      magnet.torqueArrow = torqueArrow;
    }

    this.scene.add(parentGroup);
    magnet.mesh = parentGroup;
  }

  // ============================================================================
  // PHYSICS SIMULATION ENGINE
  // ============================================================================
  private updatePhysics(dt: number) {
    if (this.magnets.length === 0) return;

    // 1. Reset forces & torques, apply gravity
    for (const m of this.magnets) {
      m.force.set(0, 0, 0);
      m.torque.set(0, 0, 0);

      if (!m.isPositionFrozen) {
        m.force.copy(this.gravity).multiplyScalar(m.mass);
      }
    }

    // 2. Induced Magnetism for Iron Filings
    // filings acquire dipole moment proportional to external B-field
    for (const m of this.magnets) {
      if (m.type !== "filing") continue;

      const pos = m.position;
      const B = this.computeTotalBFieldAt(pos, m); // B-field excluding itself

      const bLen = B.length();
      if (bLen > 1e-4) {
        // Aligns dipole along the field
        m.strength = bLen * 1.5; // Induction susceptibility scale
        if (m.strength > 4.0) m.strength = 4.0; // Cap saturation

        // Align needle mesh instantly
        const targetQuat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          B.clone().normalize()
        );
        m.quaternion.slerp(targetQuat, 0.3); // Smooth alignment
      } else {
        m.strength = 0;
      }
    }

    // 3. Compute Dipole-Dipole interactions
    const mu0_4pi = 1.2 * this.globalMagnetScale; // Scaled magnetism constant
    const count = this.magnets.length;

    for (let i = 0; i < count; i++) {
      const m1 = this.magnets[i]!;
      const moment1 = m1.getMagneticMoment();
      if (moment1.lengthSq() < 1e-6) continue;

      for (let j = i + 1; j < count; j++) {
        const m2 = this.magnets[j]!;
        const moment2 = m2.getMagneticMoment();
        if (moment2.lengthSq() < 1e-6) continue;

        // Separation vector from 1 to 2
        const r = new THREE.Vector3().subVectors(m2.position, m1.position);
        const rLen = r.length();
        if (rLen < 0.05) continue;

        // Soften distance slightly based on size to avoid infinite force singularities
        const minTouch = m1.radius + m2.radius;
        const rSoft = Math.max(rLen, minTouch * 0.95);

        const rHat = r.clone().normalize();

        const m1DotR = moment1.dot(rHat);
        const m2DotR = moment2.dot(rHat);
        const m1DotM2 = moment1.dot(moment2);

        // a. Calculate Field of 1 at 2's position: B = (3*(m1.rHat)*rHat - m1) / r^3
        const B1 = rHat
          .clone()
          .multiplyScalar(3 * m1DotR)
          .sub(moment1)
          .multiplyScalar(mu0_4pi / Math.pow(rSoft, 3));

        // b. Calculate Field of 2 at 1's position: B = (3*(m2.-rHat)*-rHat - m2) / r^3
        const negRHat = rHat.clone().negate();
        const m2DotNegR = moment2.dot(negRHat);
        const B2 = negRHat
          .clone()
          .multiplyScalar(3 * m2DotNegR)
          .sub(moment2)
          .multiplyScalar(mu0_4pi / Math.pow(rSoft, 3));

        // c. Torques: tau = m x B (Cap maximum torque to avoid rotation explode)
        const maxTorqueVal = 50.0;
        if (!m2.isRotationFrozen && m2.type !== "filing") {
          const t2 = new THREE.Vector3().crossVectors(moment2, B1);
          if (t2.lengthSq() > maxTorqueVal * maxTorqueVal) {
            t2.normalize().multiplyScalar(maxTorqueVal);
          }
          m2.torque.add(t2);
        }
        if (!m1.isRotationFrozen && m1.type !== "filing") {
          const t1 = new THREE.Vector3().crossVectors(moment1, B2);
          if (t1.lengthSq() > maxTorqueVal * maxTorqueVal) {
            t1.normalize().multiplyScalar(maxTorqueVal);
          }
          m1.torque.add(t1);
        }

        // d. Force exerted on 2 by 1: analytical gradient of dipole potential
        // F = 3 * mu / r^4 * [ (m1.rHat)m2 + (m2.rHat)m1 + (m1.m2)rHat - 5(m1.rHat)(m2.rHat)rHat ]
        const term1 = moment2.clone().multiplyScalar(m1DotR);
        const term2 = moment1.clone().multiplyScalar(m2DotR);
        const term3 = rHat.clone().multiplyScalar(m1DotM2);
        const term4 = rHat.clone().multiplyScalar(5 * m1DotR * m2DotR);

        const F = term1
          .add(term2)
          .add(term3)
          .sub(term4)
          .multiplyScalar((3 * mu0_4pi) / Math.pow(rSoft, 4));

        // Cap maximum pairwise magnetic force to prevent extreme acceleration kicks
        const maxPairForce = 120.0;
        if (F.lengthSq() > maxPairForce * maxPairForce) {
          F.normalize().multiplyScalar(maxPairForce);
        }

        m2.force.add(F);
        m1.force.sub(F); // Equal and opposite action-reaction
      }
    }

    // 4. Contact Collisions Resolution (Penalty spring-damper method)
    const kSpring = 700.0;
    const cDamp = 15.0;
    const kFriction = 3.0;

    for (let i = 0; i < count; i++) {
      const m1 = this.magnets[i]!;
      for (let j = i + 1; j < count; j++) {
        const m2 = this.magnets[j]!;

        // Handle collision shape overlap (mostly spheres or representative capsule cylinder diameters)
        const separation = new THREE.Vector3().subVectors(
          m2.position,
          m1.position
        );
        const d = separation.length();
        const contactDist = m1.radius + m2.radius;

        if (d < contactDist && d > 1e-4) {
          const overlap = contactDist - d;
          const normal = separation.clone().normalize();

          // Normal relative velocity
          const relVel = new THREE.Vector3().subVectors(
            m2.velocity,
            m1.velocity
          );
          const vNormal = relVel.dot(normal);

          // Spring pushback + damper damping
          let forceMag = kSpring * overlap - cDamp * vNormal;
          if (forceMag < 0) forceMag = 0; // Repulsive only

          const contactF = normal.clone().multiplyScalar(forceMag);

          if (!m2.isPositionFrozen) m2.force.add(contactF);
          if (!m1.isPositionFrozen) m1.force.sub(contactF);

          // Tangential sliding friction
          const vTangential = relVel
            .clone()
            .sub(normal.clone().multiplyScalar(vNormal));
          if (vTangential.lengthSq() > 1e-6) {
            const frictionF = vTangential
              .clone()
              .normalize()
              .multiplyScalar(
                -kFriction * Math.min(vTangential.length() * 5, forceMag)
              );
            if (!m2.isPositionFrozen) m2.force.add(frictionF);
            if (!m1.isPositionFrozen) m1.force.sub(frictionF);
          }

          // Contact rotational alignment locking torque
          // Emulates magnetic friction and prevents spaghetti hinges in neodymium chains
          if (m1.type === "sphere" && m2.type === "sphere") {
            const relOmega = new THREE.Vector3().subVectors(
              m2.angularVelocity,
              m1.angularVelocity
            );
            const lockTorque = relOmega.clone().multiplyScalar(-18.0 * overlap);
            if (!m2.isRotationFrozen) m2.torque.add(lockTorque);
            if (!m1.isRotationFrozen) m1.torque.sub(lockTorque);
          }

          // Collision spark generation for energetic contacts
          if (-vNormal > 1.8) {
            const contactPoint = m1.position
              .clone()
              .addScaledVector(normal, m1.radius);
            this.spawnSparks(contactPoint, normal, Math.floor(-vNormal * 4));
          }
        }
      }
    }

    // 5. Grabbing Spring Forces (pulls grabbed object to mouse projection)
    if (this.grabbedMagnet) {
      const targetPos = this.raycastMouseToGrabPlane();
      if (targetPos) {
        const error = new THREE.Vector3().subVectors(
          targetPos,
          this.grabbedMagnet.position
        );

        // Dynamic spring joint
        const kGrab = 150.0;
        const cGrab = 10.0;
        const fSpring = error
          .multiplyScalar(kGrab)
          .addScaledVector(this.grabbedMagnet.velocity, -cGrab);

        // Cap grab spring force to avoid faints
        const maxGrabForce = 180.0;
        if (fSpring.lengthSq() > maxGrabForce * maxGrabForce) {
          fSpring.normalize().multiplyScalar(maxGrabForce);
        }

        this.grabbedMagnet.force.add(fSpring);
      }
    }

    // 6. Integrate Equations of Motion (Euler-Cromer)
    for (const m of this.magnets) {
      // Wall limits (Keep in bounds)
      this.resolveBoundaryCollisions(m);

      // Linear motion
      if (!m.isPositionFrozen) {
        m.velocity.addScaledVector(m.force, dt / m.mass);
        m.velocity.multiplyScalar(1.0 - this.globalDamping); // Air resistance

        // Cap linear speed to keep movement contained and stable
        const maxSpeed = 10.0;
        if (m.velocity.lengthSq() > maxSpeed * maxSpeed) {
          m.velocity.normalize().multiplyScalar(maxSpeed);
        }

        m.position.addScaledVector(m.velocity, dt);
      } else {
        m.velocity.set(0, 0, 0);
      }

      // Rotational motion
      if (!m.isRotationFrozen) {
        // Angular acc: alpha = torque / inertia
        m.angularVelocity.addScaledVector(m.torque, dt / m.momentOfInertia);
        m.angularVelocity.multiplyScalar(1.0 - this.globalDamping * 1.5); // Rotational friction

        // Cap angular speed to prevent hyper-spinning
        const maxSpin = 20.0;
        if (m.angularVelocity.lengthSq() > maxSpin * maxSpin) {
          m.angularVelocity.normalize().multiplyScalar(maxSpin);
        }

        const deltaRotAngle = m.angularVelocity.length() * dt;
        if (deltaRotAngle > 1e-6) {
          const rotAxis = m.angularVelocity.clone().normalize();
          const qRot = new THREE.Quaternion().setFromAxisAngle(
            rotAxis,
            deltaRotAngle
          );
          m.quaternion.premultiply(qRot).normalize();
        }
      } else {
        m.angularVelocity.set(0, 0, 0);
      }

      // Sync graphic mesh position & orientation
      if (m.mesh) {
        m.mesh.position.copy(m.position);
        m.mesh.quaternion.copy(m.quaternion);

        // Handle inner compass needles independently
        if (m.type === "compass") {
          const needle = m.mesh.getObjectByName("needle") as THREE.Group;
          if (needle) {
            // needle spins relative to base.
            // In physical space compass stand is position frozen, but needles rotate.
            // Sync needle orientation
            needle.quaternion.copy(m.quaternion);
            // Stand group orientation keeps level
            m.mesh.quaternion.set(0, 0, 0, 1);
          }
        }
      }
    }
  }

  // Soft elastic boundary box collider
  private resolveBoundaryCollisions(m: Magnet) {
    const kWall = 500.0;
    const cWall = 8.0;

    const walls = [
      { axis: "x", sign: -1, limit: -this.maxBounds.x },
      { axis: "x", sign: 1, limit: this.maxBounds.x },
      { axis: "y", sign: -1, limit: -this.maxBounds.y },
      { axis: "y", sign: 1, limit: this.maxBounds.y },
      { axis: "z", sign: -1, limit: -this.maxBounds.z },
      { axis: "z", sign: 1, limit: this.maxBounds.z },
    ];

    for (const w of walls) {
      const mPosVal = m.position[w.axis as "x" | "y" | "z"];
      const overlap =
        w.sign === 1
          ? mPosVal + m.radius - w.limit
          : w.limit - (mPosVal - m.radius);

      if (overlap > 0) {
        // Wall normal points back inside
        const normalVal = -w.sign;
        const vVal = m.velocity[w.axis as "x" | "y" | "z"];
        const fWallMag = kWall * overlap - cWall * (vVal * normalVal);

        if (fWallMag > 0) {
          m.force[w.axis as "x" | "y" | "z"] += fWallMag * normalVal;
        }

        // Hard clamping to guarantee containment inside boundary box
        if (w.sign === 1) {
          m.position[w.axis as "x" | "y" | "z"] = w.limit - m.radius;
        } else {
          m.position[w.axis as "x" | "y" | "z"] = w.limit + m.radius;
        }

        // Dampen and bounce velocity component
        if (vVal * w.sign > 0) {
          m.velocity[w.axis as "x" | "y" | "z"] = -vVal * 0.25;
        }
      }
    }
  }

  // Calculates net external magnetic field vector at position `pos`, excluding a specified target magnet
  private computeTotalBFieldAt(
    pos: THREE.Vector3,
    excludeMagnet: Magnet | null = null
  ): THREE.Vector3 {
    const Bnet = new THREE.Vector3();
    const mu0_4pi = 1.2 * this.globalMagnetScale;

    for (const other of this.magnets) {
      if (other === excludeMagnet) continue;

      const mMom = other.getMagneticMoment();
      if (mMom.lengthSq() < 1e-6) continue;

      const r = new THREE.Vector3().subVectors(pos, other.position);
      const rLen = r.length();
      if (rLen < 0.05) continue;

      // Soften pole calculation to prevent infinite math
      const rSoft = Math.max(
        rLen,
        (other.radius + (excludeMagnet?.radius || 0.1)) * 0.7
      );
      const rHat = r.clone().normalize();
      const mDotR = mMom.dot(rHat);

      const B_i = rHat
        .clone()
        .multiplyScalar(3 * mDotR)
        .sub(mMom)
        .multiplyScalar(mu0_4pi / Math.pow(rSoft, 3));
      Bnet.add(B_i);
    }
    return Bnet;
  }

  // ============================================================================
  // DYNAMIC FIELD LINES TRACER (CPU integration path finder)
  // ============================================================================
  private updateFieldLinesAndParticles() {
    if (!this.showFieldLines && !this.showFluxParticles) {
      if (this.fieldLineSegments) this.fieldLineSegments.visible = false;
      if (this.fluxParticleSystem) this.fluxParticleSystem.visible = false;
      return;
    }

    const maxLineSteps = 70;
    const stepSize = 0.35;
    const lineVertices: THREE.Vector3[] = [];
    this.tracedPaths = [];

    // Filter magnets capable of outputting a magnetic field
    const activeMagnets = this.magnets.filter(
      (m) => m.type !== "filing" && m.getMagneticMoment().length() > 0.05
    );

    for (const m of activeMagnets) {
      for (const polSign of [1, -1]) {
        // Start from north (+Y local) or south (-Y local)
        const poleLocal = new THREE.Vector3(
          0,
          (m.length / 2 + 0.1) * polSign,
          0
        );
        if (m.type === "sphere") {
          poleLocal.set(0, m.radius * 1.05 * polSign, 0);
        }

        const poleGlobal = poleLocal
          .clone()
          .applyQuaternion(m.quaternion)
          .add(m.position);

        // Generate lines emanating out from poles
        const linesAtPole = 10;
        for (let i = 0; i < linesAtPole; i++) {
          const theta = (i / linesAtPole) * Math.PI * 2;
          const spread = 0.3; // outward flare
          const localDir = new THREE.Vector3(
            Math.cos(theta) * spread,
            polSign,
            Math.sin(theta) * spread
          ).normalize();

          const dirGlobal = localDir.applyQuaternion(m.quaternion);
          const startPt = poleGlobal.clone().addScaledVector(dirGlobal, 0.1);

          // Trace field path
          const path: THREE.Vector3[] = [startPt];
          const currPt = startPt.clone();
          const stepSign = polSign; // Integrate forward for North, backward for South

          for (let step = 0; step < maxLineSteps; step++) {
            const B = this.computeTotalBFieldAt(currPt);
            const bLen = B.length();
            if (bLen < 0.005) break;

            const nextPt = currPt
              .clone()
              .addScaledVector(B.normalize(), stepSize * stepSign);

            // Boundary limits
            if (
              Math.abs(nextPt.x) > this.maxBounds.x * 1.5 ||
              Math.abs(nextPt.y) > this.maxBounds.y * 1.5 ||
              Math.abs(nextPt.z) > this.maxBounds.z * 1.5
            ) {
              break;
            }

            // Did we hit another magnet?
            let hitMagnet = false;
            for (const other of this.magnets) {
              if (other === m) continue;
              if (nextPt.distanceTo(other.position) < other.radius * 0.95) {
                hitMagnet = true;
                break;
              }
            }

            path.push(nextPt);
            currPt.copy(nextPt);
            if (hitMagnet) break;
          }

          if (path.length > 2) {
            this.tracedPaths.push(path);

            // Build segment pairs for LineSegments
            if (this.showFieldLines) {
              for (let j = 0; j < path.length - 1; j++) {
                lineVertices.push(path[j]!, path[j + 1]!);
              }
            }
          }
        }
      }
    }

    // Update LineSegments Geometry
    if (this.showFieldLines && lineVertices.length > 0) {
      if (!this.fieldLineSegments) {
        const lineGeo = new THREE.BufferGeometry();
        this.fieldLineSegments = new THREE.LineSegments(
          lineGeo,
          materials.glowLine
        );
        this.scene.add(this.fieldLineSegments);
      }

      this.fieldLineSegments.geometry.setFromPoints(lineVertices);
      this.fieldLineSegments.visible = true;
    } else if (this.fieldLineSegments) {
      this.fieldLineSegments.visible = false;
    }

    // Spawn / Manage Flux flowing particles
    this.updateFluxParticles(activeMagnets);
  }

  // Animates micro-particles travel along the simulated vector field paths
  private updateFluxParticles(activeMagnets: Magnet[]) {
    if (!this.showFluxParticles || this.tracedPaths.length === 0) {
      if (this.fluxParticleSystem) this.fluxParticleSystem.visible = false;
      return;
    }

    // Maintain particle arrays
    const targetCount = this.tracedPaths.length * 2;

    // Cleanup orphaned particle tracks
    this.fluxParticles = this.fluxParticles.filter((p) => {
      // Does magnet still exist?
      return (
        this.magnets.some((m) => m.id === p.magnetId) &&
        p.pathIndex < this.tracedPaths.length
      );
    });

    // Populate particles if list depleted
    while (this.fluxParticles.length < targetCount) {
      const pathIdx = Math.floor(Math.random() * this.tracedPaths.length);
      const path = this.tracedPaths[pathIdx]!;
      this.fluxParticles.push({
        magnetId: activeMagnets[0]?.id || "", // placeholder tracker
        pathIndex: pathIdx,
        stepIndex: Math.floor(Math.random() * (path.length - 1)),
        t: Math.random(),
        speed: 8.0 + Math.random() * 6.0, // ticks speed
      });
    }

    // Step positions of active flow particles
    const particlePositions: THREE.Vector3[] = [];

    for (const p of this.fluxParticles) {
      const path = this.tracedPaths[p.pathIndex];
      if (!path || path.length < 2) continue;

      // Update progress
      p.t += p.speed * 0.003; // increment
      if (p.t >= 1.0) {
        p.t = 0.0;
        p.stepIndex++;
        if (p.stepIndex >= path.length - 1) {
          p.stepIndex = 0;
          p.pathIndex = Math.floor(Math.random() * this.tracedPaths.length);
        }
      }

      // Interpolate 3D point between segment nodes
      const nodeA = this.tracedPaths[p.pathIndex]![p.stepIndex]!;
      const nodeB = this.tracedPaths[p.pathIndex]![p.stepIndex + 1]!;
      const p3D = new THREE.Vector3().lerpVectors(nodeA, nodeB, p.t);
      particlePositions.push(p3D);
    }

    // Render Point Cloud
    if (particlePositions.length > 0) {
      if (!this.fluxParticleSystem) {
        const geo = new THREE.BufferGeometry();
        this.fluxParticleSystem = new THREE.Points(geo, materials.fluxParticle);
        this.scene.add(this.fluxParticleSystem);
      }
      this.fluxParticleSystem.geometry.setFromPoints(particlePositions);
      this.fluxParticleSystem.visible = true;
    }
  }

  // ============================================================================
  // VECTOR GRID FIELDS (Mini 3D compass needles)
  // ============================================================================
  private updateCompassGrid() {
    if (!this.showCompassGrid) {
      this.compassGridGroup.visible = false;
      return;
    }

    this.compassGridGroup.visible = true;

    // Define size of Vector Array Grid
    const gw = 12,
      gh = 3,
      gd = 12;
    const spacing = 1.35;
    const totalInstances = gw * gh * gd;

    if (!this.compassGridMesh) {
      // Build instanced compass needle
      const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6);
      stemGeo.translate(0, 0, 0);
      stemGeo.rotateX(Math.PI / 2); // Align along Z

      this.compassGridMesh = new THREE.InstancedMesh(
        stemGeo,
        materials.north,
        totalInstances
      );
      this.compassGridGroup.add(this.compassGridMesh);
      this.scene.add(this.compassGridGroup);
    }

    // Evaluate B-field at grid points and orient instances
    let index = 0;
    const dummyObj = new THREE.Object3D();
    const originOffset = new THREE.Vector3(
      -((gw - 1) * spacing) / 2,
      -((gh - 1) * spacing) / 2,
      -((gd - 1) * spacing) / 2
    );

    for (let x = 0; x < gw; x++) {
      for (let y = 0; y < gh; y++) {
        for (let z = 0; z < gd; z++) {
          const gridPos = new THREE.Vector3(
            x * spacing,
            y * spacing,
            z * spacing
          ).add(originOffset);

          const B = this.computeTotalBFieldAt(gridPos);
          const strength = B.length();

          dummyObj.position.copy(gridPos);

          if (strength > 0.005) {
            // Rotate arrow instance to align with field line direction
            const dir = B.normalize();
            const quat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              dir
            );
            dummyObj.quaternion.copy(quat);

            // Scale length/thickness of compass needle representation based on field intensity
            const magScale = Math.min(0.2 + strength * 0.35, 1.25);
            dummyObj.scale.set(magScale, magScale, magScale);
          } else {
            dummyObj.scale.set(0.1, 0.1, 0.1);
          }

          dummyObj.updateMatrix();
          this.compassGridMesh.setMatrixAt(index++, dummyObj.matrix);
        }
      }
    }
    this.compassGridMesh.instanceMatrix.needsUpdate = true;
  }

  // ============================================================================
  // SPARK EXPLOSION GENERATOR (On collision)
  // ============================================================================
  private spawnSparks(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    count: number
  ) {
    const numSparks = Math.min(count, 15);
    for (let i = 0; i < numSparks; i++) {
      // Hemispherical bounce direction
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.0,
        (Math.random() - 0.5) * 2.0,
        (Math.random() - 0.5) * 2.0
      ).add(normal.clone().multiplyScalar(1.5));

      vel.normalize().multiplyScalar(1.0 + Math.random() * 4.0);

      this.sparkParticles.push({
        pos: position.clone(),
        vel: vel,
        age: 0.0,
        maxAge: 0.2 + Math.random() * 0.35,
      });
    }
  }

  private updateSparks(dt: number) {
    // Integrate sparks position
    this.sparkParticles = this.sparkParticles.filter((s) => {
      s.age += dt;
      s.vel.y -= 9.8 * dt; // Gravity effect on sparks
      s.pos.addScaledVector(s.vel, dt);
      return s.age < s.maxAge;
    });

    // Populate THREE.Points buffers
    if (this.sparkParticles.length > 0) {
      if (!this.sparkSystem) {
        const geo = new THREE.BufferGeometry();
        this.sparkSystem = new THREE.Points(geo, materials.spark);
        this.scene.add(this.sparkSystem);
      }

      const points = this.sparkParticles.map((s) => s.pos);
      this.sparkSystem.geometry.setFromPoints(points);
      this.sparkSystem.visible = true;
    } else if (this.sparkSystem) {
      this.sparkSystem.visible = false;
    }
  }

  // ============================================================================
  // LEVEL PRESETS AND PUZZLE DEFINITIONS
  // ============================================================================
  public loadPreset(name: string) {
    this.currentPresetName = name;
    this.clearScene();

    // Hide UI specific electromagnet group by default
    document.getElementById("electromagnet-current-group")!.style.display =
      "none";
    document.getElementById("instruction-panel")!.classList.add("hidden");

    this.isLevelComplete = false;
    this.timeInLevitationZone = 0.0;

    // Reset camera state values
    this.cameraDistance = 14.0;
    this.cameraTheta = Math.PI / 4;
    this.cameraPhi = Math.PI / 3;
    this.cameraTarget.set(0, 0, 0);

    const rnd = new SeededRandom(12345);

    if (name === "sandbox") {
      this.gravity.set(0, 0, 0);

      // Place two bar magnets in center
      this.spawnMagnet(
        "bar",
        new THREE.Vector3(-2.2, 0, 0),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          Math.PI / 2
        )
      );
      this.spawnMagnet(
        "bar",
        new THREE.Vector3(2.2, 0, 0),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          -Math.PI / 2
        )
      );
    } else if (name === "filings") {
      this.gravity.set(0, 0, 0);

      // Create flat glass tray plate
      const trayGeo = new THREE.BoxGeometry(11, 0.1, 11);
      const tray = new THREE.Mesh(trayGeo, materials.glass);
      tray.position.set(0, -0.05, 0);
      tray.name = "staticEnvironment";
      this.scene.add(tray);

      // Place central Bar magnet (Frozen)
      const centerMag = this.spawnMagnet(
        "bar",
        new THREE.Vector3(0, 0.6, 0),
        new THREE.Quaternion()
      );
      centerMag.isPositionFrozen = true;
      centerMag.isRotationFrozen = true;

      // Spawn large amount of filings on sheet
      const numFilings = 320;
      for (let i = 0; i < numFilings; i++) {
        // Random layout on grid tray
        const px = rnd.range(-5.0, 5.0);
        const pz = rnd.range(-5.0, 5.0);

        // Prevent filing landing straight inside magnet
        if (Math.abs(px) < 1.0 && Math.abs(pz) < 1.0) continue;

        const filing = this.spawnMagnet(
          "filing",
          new THREE.Vector3(px, 0.0, pz),
          new THREE.Quaternion()
        );
        filing.isPositionFrozen = true; // They rotate only
      }
    } else if (name === "compass") {
      this.gravity.set(0, 0, 0);

      // Place a heavy dynamic center magnet
      this.spawnMagnet(
        "bar",
        new THREE.Vector3(0, 0, 0),
        new THREE.Quaternion()
      );

      // Grid of surrounding compass stands
      const cols = 7,
        rows = 5;
      const xSpacing = 2.0,
        zSpacing = 2.0;
      for (let x = 0; x < cols; x++) {
        for (let z = 0; z < rows; z++) {
          const px = (x - (cols - 1) / 2) * xSpacing;
          const pz = (z - (rows - 1) / 2) * zSpacing;

          if (Math.abs(px) < 1.0 && Math.abs(pz) < 1.0) continue; // skip center magnet slot

          this.spawnMagnet(
            "compass",
            new THREE.Vector3(px, -0.2, pz),
            new THREE.Quaternion()
          );
        }
      }
    } else if (name === "levitation") {
      this.gravity.set(0, -9.8, 0);
      this.cameraDistance = 11.0;
      this.cameraTheta = Math.PI / 2.2;
      this.cameraPhi = Math.PI / 2.1;

      // Visual glass tube
      const tubeGeo = new THREE.CylinderGeometry(0.8, 0.8, 6.0, 24, 1, true);
      const tube = new THREE.Mesh(tubeGeo, materials.glass);
      tube.position.set(0, 0.5, 0);
      tube.name = "staticEnvironment";
      this.scene.add(tube);

      // Bottom support ring
      const baseRingGeo = new THREE.TorusGeometry(0.85, 0.1, 10, 24);
      const baseRing = new THREE.Mesh(baseRingGeo, materials.iron);
      baseRing.position.set(0, -2.5, 0);
      baseRing.name = "staticEnvironment";
      this.scene.add(baseRing);

      // Levitating bead magnet inside tube
      const bead = this.spawnMagnet(
        "sphere",
        new THREE.Vector3(0, -1.5, 0),
        new THREE.Quaternion()
      );
      bead.isRotationFrozen = true; // Constrained movement

      // Fixed base repeller magnets
      // Point polar moment UP to repel the bead (which is also pointing up)
      // Wait, let's create a ring of 4 base repellers to make it structurally stable!
      const radius = 1.3;
      for (let i = 0; i < 4; i++) {
        const theta = (i / 4) * Math.PI * 2;
        const px = Math.cos(theta) * radius;
        const pz = Math.sin(theta) * radius;
        const baseMag = this.spawnMagnet(
          "bar",
          new THREE.Vector3(px, -2.6, pz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0)
        );
        baseMag.isPositionFrozen = true;
        baseMag.isRotationFrozen = true;
      }

      // Display HUD instructions
      this.showLevelHUD(
        "LEVITY CRADLE CHALLENGE",
        "Hover the Neodymium Bead inside the glowing green target zone by spawning repelling magnets or adjusting parameters."
      );

      // Glowing zone target cylinder
      const zoneGeo = new THREE.CylinderGeometry(0.78, 0.78, 1.2, 24);
      const zoneMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
      });
      const targetZone = new THREE.Mesh(zoneGeo, zoneMat);
      targetZone.position.set(0, 0.8, 0);
      targetZone.name = "levelTarget";
      this.scene.add(targetZone);
    } else if (name === "chain") {
      this.gravity.set(0, -9.8, 0);
      this.cameraDistance = 12.0;

      // Two metal pillars acting as terminals
      const p1 = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 4.0, 1.2),
        materials.steel
      );
      p1.position.set(-4.0, -1.0, 0);
      p1.name = "staticEnvironment";
      this.scene.add(p1);

      const p2 = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 4.0, 1.2),
        materials.steel
      );
      p2.position.set(4.0, -1.0, 0);
      p2.name = "staticEnvironment";
      this.scene.add(p2);

      // Create permanent bar magnet inside pillars to magnetize them
      const pillarMag1 = this.spawnMagnet(
        "bar",
        new THREE.Vector3(-4.0, 0.2, 0),
        new THREE.Quaternion()
      );
      pillarMag1.isPositionFrozen = true;
      pillarMag1.isRotationFrozen = true;

      const pillarMag2 = this.spawnMagnet(
        "bar",
        new THREE.Vector3(4.0, 0.2, 0),
        new THREE.Quaternion()
      );
      pillarMag2.isPositionFrozen = true;
      pillarMag2.isRotationFrozen = true;

      // Spawn a container tray at bottom to hold raw bead elements
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.2, 3),
        materials.glass
      );
      plate.position.set(0, -2.8, 0);
      plate.name = "staticEnvironment";
      this.scene.add(plate);

      // Place 9 dynamic magnetic beads in inventory list
      for (let i = 0; i < 9; i++) {
        this.spawnMagnet(
          "sphere",
          new THREE.Vector3(-1.8 + i * 0.45, -2.4, 0),
          new THREE.Quaternion()
        );
      }

      this.showLevelHUD(
        "COHESIVE CHAIN BRIDGE",
        "Draw magnetic spheres together to form a hanging bridge spanning the magnetized steel pillars."
      );
    } else if (name === "maze") {
      this.gravity.set(0, 0, 0); // Flat maze board, simulate rolling via manual forces or tilt
      this.cameraDistance = 15.0;
      this.cameraTheta = Math.PI / 2;
      this.cameraPhi = Math.PI / 2; // Look straight down

      // Floor plane
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 12),
        materials.iron
      );
      board.rotation.x = -Math.PI / 2;
      board.position.y = -0.5;
      board.receiveShadow = true;
      board.name = "staticEnvironment";
      this.scene.add(board);

      // Walls / Obstacles (Steel blocks)
      const obstacleGeoms = [
        { w: 0.4, h: 1.0, d: 5.0, x: -3.0, z: 1.5 },
        { w: 0.4, h: 1.0, d: 5.0, x: 3.0, z: -1.5 },
        { w: 5.0, h: 1.0, d: 0.4, x: 0.0, z: -1.0 },
        { w: 5.0, h: 1.0, d: 0.4, x: -2.0, z: -3.5 },
        { w: 5.0, h: 1.0, d: 0.4, x: 2.0, z: 3.5 },
      ];

      for (const ob of obstacleGeoms) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(ob.w, ob.h, ob.d),
          materials.steel
        );
        mesh.position.set(ob.x, 0, ob.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = "staticEnvironment";
        this.scene.add(mesh);
        this.mazeObstacles.push(mesh);
      }

      // Add portal targets
      const targetGeo = new THREE.TorusGeometry(0.8, 0.15, 8, 30);
      this.mazeTargetMesh = new THREE.Mesh(
        targetGeo,
        new THREE.MeshBasicMaterial({ color: 0x2ed573, toneMapped: false })
      );
      this.mazeTargetMesh.rotation.x = Math.PI / 2;
      this.mazeTargetMesh.position.set(6.0, -0.4, -3.8);
      this.scene.add(this.mazeTargetMesh);

      // Place rolling magnet marble ball
      this.mazeBall = this.spawnMagnet(
        "sphere",
        new THREE.Vector3(-6.2, -0.1, 3.8),
        new THREE.Quaternion()
      );
      this.mazeBall.isMazeBall = true;
      this.mazeBall.mass = 0.5;
      this.mazeBall.strength = 14.0; // High force sensitivity

      // Lock its rotation around Z so it rolls nicely or spins freely
      this.mazeBall.isRotationFrozen = false;

      this.showLevelHUD(
        "QUANTUM MAZE DEFLECTION",
        "Spawn electromagnets and tune their currents to steer the rolling golden bead into the green portal target."
      );

      // Spawn two Electromagnets to help
      const coil1 = this.spawnMagnet(
        "electromagnet",
        new THREE.Vector3(-3.5, 0, -2.5),
        new THREE.Quaternion()
      );
      coil1.current = 3.0;
      coil1.isPositionFrozen = true;

      const coil2 = this.spawnMagnet(
        "electromagnet",
        new THREE.Vector3(2.5, 0, 1.8),
        new THREE.Quaternion()
      );
      coil2.current = -3.0;
      coil2.isPositionFrozen = true;
    }

    this.updateCameraPosition();
    this.updateHUDStats();

    // Trigger visual list update
    const buttons = document.querySelectorAll(".preset-btn");
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-preset") === name);
    });
  }

  // Helper: Spawns and structures new Magnet entity
  private spawnMagnet(
    type: "bar" | "sphere" | "compass" | "electromagnet" | "filing",
    position: THREE.Vector3,
    quaternion?: THREE.Quaternion
  ): Magnet {
    const mag = new Magnet({ type, position, quaternion });
    this.buildMagnetMesh(mag);
    this.magnets.push(mag);
    this.updateHUDStats();
    return mag;
  }

  // Clear workspace clean-up
  private clearScene() {
    // Delete all dynamic bodies meshes
    for (const m of this.magnets) {
      if (m.group) this.scene.remove(m.group);
    }
    this.magnets = [];

    // Delete static environment structures (glass plates, tube, target indicator)
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((node) => {
      if (
        node.name === "staticEnvironment" ||
        node.name === "levelTarget" ||
        node.name === "currentIndicator"
      ) {
        toRemove.push(node);
      }
    });
    for (const n of toRemove) {
      this.scene.remove(n);
    }

    if (this.mazeTargetMesh) {
      this.scene.remove(this.mazeTargetMesh);
      this.mazeTargetMesh = null;
    }

    this.mazeObstacles = [];
    this.mazeBall = null;
    this.grabbedMagnet = null;
    this.hoveredMagnet = null;
    this.tracedPaths = [];
    this.fluxParticles = [];

    if (this.fieldLineSegments)
      this.fieldLineSegments.geometry.setFromPoints([]);
    if (this.fluxParticleSystem)
      this.fluxParticleSystem.geometry.setFromPoints([]);

    this.updateHUDStats();
  }

  // ============================================================================
  // CAMERA VECTOR MANAGEMENT
  // ============================================================================
  private updateCameraPosition() {
    // Prevent polar singularity flip
    this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));

    const x =
      this.cameraDistance *
      Math.sin(this.cameraPhi) *
      Math.sin(this.cameraTheta);
    const y = this.cameraDistance * Math.cos(this.cameraPhi);
    const z =
      this.cameraDistance *
      Math.sin(this.cameraPhi) *
      Math.cos(this.cameraTheta);

    this.camera.position.set(x, y, z).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  // ============================================================================
  // INPUT INTERACTION & POINTER EVENTS
  // ============================================================================
  private initEventHandlers() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Track mouse coordinates
    const updateMouse = (e: MouseEvent) => {
      this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    let isLeftDown = false;
    let isRightDown = false;
    let isOrbitMode = false;
    let prevMouseX = 0,
      prevMouseY = 0;

    // Mouse Down
    this.canvas.addEventListener("mousedown", (e) => {
      updateMouse(e);

      isLeftDown = e.button === 0;
      isRightDown = e.button === 2 || (e.button === 0 && e.shiftKey);

      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      // Raycast selection
      this.raycaster.setFromCamera(this.mousePos, this.camera);

      // Filter meshes belonging to our magnets
      const intersectableGroups: THREE.Object3D[] = [];
      for (const m of this.magnets) {
        if (m.mesh && m.type !== "filing") {
          intersectableGroups.push(m.mesh);
        }
      }

      const intersects = this.raycaster.intersectObjects(
        intersectableGroups,
        true
      );

      if (intersects.length > 0) {
        // Find which magnet owns this intersected mesh node
        let parent: THREE.Object3D | null = intersects[0]!.object;
        while (
          parent &&
          !(
            parent instanceof THREE.Group &&
            this.magnets.some((m) => m.group === parent)
          )
        ) {
          parent = parent.parent;
        }

        if (parent) {
          const match = this.magnets.find((m) => m.group === parent);
          if (match) {
            if (isLeftDown && !e.shiftKey) {
              this.grabbedMagnet = match;

              // Set up projection plane for dragging
              const normal = new THREE.Vector3();
              this.camera.getWorldDirection(normal);
              normal.negate(); // plane faces camera

              this.grabPlane.setFromNormalAndCoplanarPoint(
                normal,
                match.position
              );

              const intersectPt = new THREE.Vector3();
              this.raycaster.ray.intersectPlane(this.grabPlane, intersectPt);
              this.grabOffset.copy(match.position).sub(intersectPt);
              this.grabDepthOffset = 0.0;

              // Visually highlight selection
              const ring = match.group.getObjectByName(
                "selectionRing"
              ) as THREE.Mesh;
              if (ring)
                (ring.material as THREE.MeshBasicMaterial).opacity = 0.45;

              // Bind settings details to Sidebar
              this.selectMagnetSettings(match);
            }
          }
        }
      }

      // If nothing grabbed, trigger camera Orbit rotation mode
      if (!this.grabbedMagnet) {
        isOrbitMode = true;
      }
    });

    // Mouse Move
    this.canvas.addEventListener("mousemove", (e) => {
      updateMouse(e);

      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;

      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      // Hover checks
      if (!this.grabbedMagnet) {
        this.raycaster.setFromCamera(this.mousePos, this.camera);
        const intersectable: THREE.Object3D[] = [];
        for (const m of this.magnets) {
          if (m.mesh && m.type !== "filing") intersectable.push(m.mesh);
        }

        const intersects = this.raycaster.intersectObjects(intersectable, true);
        if (intersects.length > 0) {
          let parent: THREE.Object3D | null = intersects[0]!.object;
          while (
            parent &&
            !(
              parent instanceof THREE.Group &&
              this.magnets.some((m) => m.group === parent)
            )
          ) {
            parent = parent.parent;
          }
          if (parent) {
            const m = this.magnets.find((mag) => mag.group === parent);
            if (m && m !== this.hoveredMagnet) {
              this.hoveredMagnet = m;
              this.canvas.style.cursor = "grab";
            }
          }
        } else {
          this.hoveredMagnet = null;
          this.canvas.style.cursor = "default";
        }
      }

      // Action: Drag grabbed magnet
      if (this.grabbedMagnet) {
        if (isRightDown) {
          // Action: Rotate grabbed magnet
          const rotSpeed = 0.007;

          // Construct rotation axis perpendicular to camera
          const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(
            this.camera.quaternion
          );
          const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
            this.camera.quaternion
          );

          const qX = new THREE.Quaternion().setFromAxisAngle(
            camRight,
            -dy * rotSpeed
          );
          const qY = new THREE.Quaternion().setFromAxisAngle(
            camUp,
            dx * rotSpeed
          );

          this.grabbedMagnet.quaternion
            .premultiply(qX)
            .premultiply(qY)
            .normalize();
          this.grabbedMagnet.angularVelocity.set(0, 0, 0); // Dampen spins
        }
      } else if (isOrbitMode) {
        // Orbit camera view angle around center
        const orbitSpeed = 0.005;
        this.cameraTheta -= dx * orbitSpeed;
        this.cameraPhi -= dy * orbitSpeed;
        this.updateCameraPosition();
      }
    });

    // Mouse Up
    window.addEventListener("mouseup", () => {
      if (this.grabbedMagnet) {
        // Remove highlight ring
        const ring = this.grabbedMagnet.group.getObjectByName(
          "selectionRing"
        ) as THREE.Mesh;
        if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = 0.0;
        this.grabbedMagnet = null;
      }
      isLeftDown = false;
      isRightDown = false;
      isOrbitMode = false;
    });

    // Scroll wheel zooms camera, or pushes/pulls grabbed magnet depth
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.grabbedMagnet) {
          // Push/pull dragged object along camera view axis
          const zoomDelta = e.deltaY * 0.008;
          this.grabDepthOffset += zoomDelta;

          const normal = new THREE.Vector3();
          this.camera.getWorldDirection(normal);

          // Displace the grab plane
          this.grabPlane.translate(normal.clone().multiplyScalar(zoomDelta));
        } else {
          // Zoom Camera
          const zoomSpeed = 0.005;
          this.cameraDistance += e.deltaY * zoomSpeed;
          this.cameraDistance = Math.max(
            3.0,
            Math.min(this.cameraDistance, 30.0)
          );
          this.updateCameraPosition();
        }
      },
      { passive: false }
    );

    // Double-click anchors/freezes magnets
    this.canvas.addEventListener("dblclick", () => {
      if (this.hoveredMagnet) {
        const target = this.hoveredMagnet;
        target.isPositionFrozen = !target.isPositionFrozen;
        target.isRotationFrozen = target.isPositionFrozen; // Freeze rotation as well
        target.velocity.set(0, 0, 0);
        target.angularVelocity.set(0, 0, 0);

        // Visual flash indication of state swap
        const ring = target.group.getObjectByName(
          "selectionRing"
        ) as THREE.Mesh;
        if (ring) {
          const originalColor = (
            ring.material as THREE.MeshBasicMaterial
          ).color.getHex();
          (ring.material as THREE.MeshBasicMaterial).color.setHex(
            target.isPositionFrozen ? 0xff0055 : 0x00f2fe
          );
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;

          setTimeout(() => {
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.0;
            (ring.material as THREE.MeshBasicMaterial).color.setHex(
              originalColor
            );
          }, 400);
        }
      }
    });

    // Delete keys deletes hovered object
    window.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.hoveredMagnet) {
          const idx = this.magnets.indexOf(this.hoveredMagnet);
          if (idx !== -1) {
            this.scene.remove(this.hoveredMagnet.group);
            this.magnets.splice(idx, 1);
            this.hoveredMagnet = null;
            this.updateHUDStats();
          }
        }
      } else if (e.key === " ") {
        // Space bar: Play/Pause simulation
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.key === "s" || e.key === "S") {
        // Step Tick
        this.stepSimulation();
      } else if (e.key === "r" || e.key === "R") {
        // Reset Preset
        this.loadPreset(this.currentPresetName);
      }
    });

    // Context menu prevent
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // -------------------------------------------------------------
    // HUD & SIMULATION CONTROLS WIRING
    // -------------------------------------------------------------

    // Play/Pause Playback Control
    const playPauseBtn = document.getElementById("btn-play-pause")!;
    playPauseBtn.addEventListener("click", () => this.togglePlayPause());

    // Step button
    const stepBtn = document.getElementById("btn-step")!;
    stepBtn.addEventListener("click", () => this.stepSimulation());

    // Reset button
    const resetBtn = document.getElementById("btn-reset")!;
    resetBtn.addEventListener("click", () =>
      this.loadPreset(this.currentPresetName)
    );

    // Preset selection grid loader
    const presetsList = document.getElementById("presets-list")!;
    const presetDefinitions = [
      {
        id: "sandbox",
        name: "Free Sandbox",
        meta: "Gravity-free magnetic lab",
      },
      {
        id: "filings",
        name: "Iron Filings Tray",
        meta: "Visualize lines of force",
      },
      {
        id: "compass",
        name: "Compass Wave Grid",
        meta: "Fluid compass ripples",
      },
      {
        id: "levitation",
        name: "Levitation Tube",
        meta: "Anti-gravity balance",
      },
      { id: "chain", name: "Chain Bridge", meta: "Sticky neodymium beads" },
      { id: "maze", name: "Magnet Maze", meta: "Puzzle: Steer the marble" },
    ];

    presetDefinitions.forEach((def) => {
      const btn = document.createElement("button");
      btn.className = "preset-btn";
      btn.setAttribute("data-preset", def.id);
      btn.innerHTML = `
        <div class="preset-title">${def.name}</div>
        <div class="preset-meta">${def.meta}</div>
      `;
      btn.addEventListener("click", () => this.loadPreset(def.id));
      presetsList.appendChild(btn);
    });

    // Spawning toolbox buttons
    const toolBtns = document.querySelectorAll(".tool-btn");
    toolBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.getAttribute("data-type") as
          | "bar"
          | "sphere"
          | "compass"
          | "electromagnet"
          | "filings";

        // Spawn object in front of camera
        const normalVec = new THREE.Vector3();
        this.camera.getWorldDirection(normalVec);
        const spawnPos = this.cameraTarget
          .clone()
          .addScaledVector(normalVec, 1.0);

        // Add random scatter offsets so they don't pile up
        spawnPos.x += (Math.random() - 0.5) * 1.5;
        spawnPos.y += (Math.random() - 0.5) * 1.5;
        spawnPos.z += (Math.random() - 0.5) * 1.5;

        // Clip to boundary limit
        spawnPos.clamp(
          this.maxBounds.clone().multiplyScalar(-0.8),
          this.maxBounds.clone().multiplyScalar(0.8)
        );

        if (type === "filings") {
          // Spray a small array cluster of 25 filings in a box
          for (let i = 0; i < 25; i++) {
            const spread = 1.2;
            const fx = spawnPos.x + (Math.random() - 0.5) * spread;
            const fy = spawnPos.y + (Math.random() - 0.5) * spread;
            const fz = spawnPos.z + (Math.random() - 0.5) * spread;

            const filing = this.spawnMagnet(
              "filing",
              new THREE.Vector3(fx, fy, fz)
            );
            filing.isPositionFrozen = true;
          }
        } else {
          this.spawnMagnet(type, spawnPos);
        }
      });
    });

    // Clear Workspace
    document
      .getElementById("clear-scene-btn")!
      .addEventListener("click", () => this.clearScene());

    // Visualization checkboxes
    const chkLines = document.getElementById(
      "vis-field-lines"
    ) as HTMLInputElement;
    chkLines.addEventListener("change", () => {
      this.showFieldLines = chkLines.checked;
    });

    const chkPart = document.getElementById(
      "vis-particles"
    ) as HTMLInputElement;
    chkPart.addEventListener("change", () => {
      this.showFluxParticles = chkPart.checked;
    });

    const chkHeat = document.getElementById("vis-heatmap") as HTMLInputElement;
    chkHeat.addEventListener("change", () => {
      this.showHeatmap = chkHeat.checked;
      if (this.heatmapSlice) this.heatmapSlice.visible = this.showHeatmap;
    });

    const chkComp = document.getElementById(
      "vis-compass-grid"
    ) as HTMLInputElement;
    chkComp.addEventListener("change", () => {
      this.showCompassGrid = chkComp.checked;
    });

    const chkForces = document.getElementById("vis-forces") as HTMLInputElement;
    chkForces.addEventListener("change", () => {
      this.showForces = chkForces.checked;

      // Update existing magnets
      for (const m of this.magnets) {
        if (m.forceArrow) m.forceArrow.visible = this.showForces;
        if (m.torqueArrow) m.torqueArrow.visible = this.showForces;
      }
    });

    // Sliders
    const sStrength = document.getElementById(
      "slider-strength"
    ) as HTMLInputElement;
    sStrength.addEventListener("input", () => {
      this.globalMagnetScale = parseFloat(sStrength.value);
      document.getElementById("val-strength")!.innerText =
        this.globalMagnetScale.toFixed(1) + "x";
    });

    const sDamping = document.getElementById(
      "slider-damping"
    ) as HTMLInputElement;
    sDamping.addEventListener("input", () => {
      this.globalDamping = parseFloat(sDamping.value);
      const valStr =
        this.globalDamping < 0.015
          ? "Off"
          : this.globalDamping < 0.05
            ? "Low"
            : "High";
      document.getElementById("val-damping")!.innerText = valStr;
    });

    const toggleGravity = document.getElementById(
      "toggle-gravity"
    ) as HTMLInputElement;
    toggleGravity.addEventListener("change", () => {
      this.gravity.set(0, toggleGravity.checked ? -9.8 : 0, 0);
    });

    // Electromagnet Current slider
    const sCurrent = document.getElementById(
      "slider-current"
    ) as HTMLInputElement;
    sCurrent.addEventListener("input", () => {
      const val = parseFloat(sCurrent.value);
      document.getElementById("val-current")!.innerText = val.toFixed(1) + " A";

      // Apply current to all active electromagnets in scene
      for (const m of this.magnets) {
        if (m.type === "electromagnet") {
          m.current = val;
          // Scale arrow representation inside mesh
          const arrow = m.group.getObjectByName(
            "currentIndicator"
          ) as THREE.ArrowHelper;
          if (arrow) {
            arrow.setDirection(new THREE.Vector3(0, val >= 0 ? 1 : -1, 0));
            arrow.setLength(
              Math.min(0.2 + Math.abs(val) * 0.2, 1.2),
              0.2,
              0.15
            );
          }
        }
      }
    });

    // Restart puzzle level button
    document
      .getElementById("restart-level-btn")!
      .addEventListener("click", () => {
        this.loadPreset(this.currentPresetName);
      });

    // Help Modals
    const helpModal = document.getElementById("help-modal")!;
    document.getElementById("btn-help")!.addEventListener("click", () => {
      helpModal.classList.remove("hidden");
    });
    document.getElementById("close-help-btn")!.addEventListener("click", () => {
      helpModal.classList.add("hidden");
    });

    // Level success buttons
    const winModal = document.getElementById("win-modal")!;
    document.getElementById("win-retry-btn")!.addEventListener("click", () => {
      winModal.classList.add("hidden");
      this.loadPreset(this.currentPresetName);
    });

    const nextBtn = document.getElementById("win-next-btn")!;
    nextBtn.addEventListener("click", () => {
      winModal.classList.add("hidden");

      // Loop sequence
      const nextSequence: Record<string, string> = {
        levitation: "chain",
        chain: "maze",
        maze: "sandbox",
      };
      const nextId = nextSequence[this.currentPresetName] || "sandbox";
      this.loadPreset(nextId);
    });
  }

  // Bind sidebar settings to selected/dragged electromagnet parameters
  private selectMagnetSettings(m: Magnet) {
    const coilGroup = document.getElementById("electromagnet-current-group")!;
    if (m.type === "electromagnet") {
      coilGroup.style.display = "block";
      const sCurrent = document.getElementById(
        "slider-current"
      ) as HTMLInputElement;
      sCurrent.value = m.current.toString();
      document.getElementById("val-current")!.innerText =
        m.current.toFixed(1) + " A";
    }
  }

  // Projection coordinate conversion for mouse drag physics
  private raycastMouseToGrabPlane(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mousePos, this.camera);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.grabPlane, target)) {
      return target.add(this.grabOffset);
    }
    return null;
  }

  // Toggles simulator execution
  private togglePlayPause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById("btn-play-pause")!;
    btn.classList.toggle("playing", !this.isPaused);
    btn.querySelector(".icon")!.innerHTML = this.isPaused ? "▶" : "⏸";
  }

  private stepSimulation() {
    this.updatePhysics(0.015);
    this.updateFieldLinesAndParticles();
    this.updateCompassGrid();
  }

  // Level HUD display
  private showLevelHUD(title: string, desc: string) {
    const panel = document.getElementById("instruction-panel")!;
    panel.classList.remove("hidden");
    document.getElementById("level-title")!.innerText = title;
    document.getElementById("level-desc")!.innerText = desc;
  }

  // ============================================================================
  // STATISTICS & WIN EVALUATION METRICS
  // ============================================================================
  private updateHUDStats() {
    // Sum total magnetic field energy
    let energySum = 0;
    const count = this.magnets.length;
    const mu0_4pi = 1.2 * this.globalMagnetScale;

    // Field energy index of system configuration
    for (let i = 0; i < count; i++) {
      const m1 = this.magnets[i]!;
      const mom1 = m1.getMagneticMoment();
      if (m1.type === "filing") continue;

      for (let j = i + 1; j < count; j++) {
        const m2 = this.magnets[j]!;
        const mom2 = m2.getMagneticMoment();
        if (m2.type === "filing") continue;

        const r = m1.position.distanceTo(m2.position);
        if (r > 0.1) {
          // U = -m2 . B1
          // Dipole energy scale approximation
          energySum +=
            (mu0_4pi * mom1.length() * mom2.length()) / Math.pow(r, 3);
        }
      }
    }

    document.getElementById("stat-energy")!.innerText =
      (energySum * 0.05).toFixed(2) + " J";
    document.getElementById("stat-count")!.innerText = count.toString();
  }

  // Triggers winning visual overlays
  private triggerWin(msg: string) {
    if (this.isLevelComplete) return;
    this.isLevelComplete = true;

    // Play/Pause simulation
    this.isPaused = true;
    document
      .getElementById("btn-play-pause")!
      .querySelector(".icon")!.innerHTML = "▶";
    document.getElementById("btn-play-pause")!.classList.remove("playing");

    const winModal = document.getElementById("win-modal")!;
    document.getElementById("win-message")!.innerText = msg;
    winModal.classList.remove("hidden");
  }

  // Evaluate Level specific win criteria
  private evaluateLevelGoals(dt: number) {
    if (this.isLevelComplete) return;

    if (this.currentPresetName === "levitation") {
      // Find Levitating Bead
      const bead = this.magnets.find(
        (m) => m.type === "sphere" && !m.isPositionFrozen
      );
      if (bead) {
        // Height check inside target zone geometry center (Y = 0.8, range: 0.8 +/- 0.6)
        const targetY = 0.8;
        const halfHeight = 0.6;

        // Bead must be within vertical range and not colliding/touching base or top wall
        if (
          Math.abs(bead.position.y - targetY) < halfHeight &&
          Math.abs(bead.position.x) < 0.6 &&
          Math.abs(bead.position.z) < 0.6 &&
          bead.velocity.length() < 1.2
        ) {
          this.timeInLevitationZone += dt;

          // Flash target zones to display progress
          const target = this.scene.getObjectByName(
            "levelTarget"
          ) as THREE.Mesh;
          if (target) {
            (target.material as THREE.MeshBasicMaterial).opacity =
              0.12 + (this.timeInLevitationZone / 3.0) * 0.28;
          }

          if (this.timeInLevitationZone >= 3.0) {
            this.triggerWin(
              "Anti-Gravity Stabilization Achieved! You balanced the neodymium bead for 3 seconds."
            );
          }
        } else {
          this.timeInLevitationZone = Math.max(
            0,
            this.timeInLevitationZone - dt * 2.0
          );
          const target = this.scene.getObjectByName(
            "levelTarget"
          ) as THREE.Mesh;
          if (target)
            (target.material as THREE.MeshBasicMaterial).opacity = 0.12;
        }
      }
    } else if (this.currentPresetName === "chain") {
      // Chain bridge check
      // Find if bridge spans from left pillar (X=-4.0) to right pillar (X=4.0)
      // We can trace connectivity: start at X=-4.0, find close sphere, jump to next close sphere,
      // until reaching X=4.0
      const spheres = this.magnets.filter(
        (m) => m.type === "sphere" && !m.isPositionFrozen
      );
      const visited = new Set<string>();

      const checkConnection = (startPos: THREE.Vector3): boolean => {
        const currentPos = startPos.clone();

        // Traverse chains
        for (let step = 0; step < 16; step++) {
          let nextSph: Magnet | null = null;
          let minDist = 1.15; // Max chain contact distance

          for (const s of spheres) {
            if (visited.has(s.id)) continue;
            const d = s.position.distanceTo(currentPos);
            if (d < minDist) {
              minDist = d;
              nextSph = s;
            }
          }

          if (nextSph) {
            visited.add(nextSph.id);
            currentPos.copy(nextSph.position);

            // Check proximity to target pillar at X = 4.0
            if (currentPos.distanceTo(new THREE.Vector3(4.0, 1.0, 0)) < 1.4) {
              return true;
            }
          } else {
            break;
          }
        }
        return false;
      };

      if (checkConnection(new THREE.Vector3(-4.0, 1.0, 0))) {
        // Extra condition: must be stable (low average speeds)
        const avgSpeed =
          spheres.reduce((sum, s) => sum + s.velocity.length(), 0) /
          spheres.length;
        if (avgSpeed < 0.25) {
          this.triggerWin(
            "Stable Magnetic Bridge Formed! You successfully bridged the steel pillars."
          );
        }
      }
    } else if (
      this.currentPresetName === "maze" &&
      this.mazeBall &&
      this.mazeTargetMesh
    ) {
      // Maze target check
      const dToTarget = this.mazeBall.position.distanceTo(
        this.mazeTargetMesh.position
      );

      // Portal zone boundary overlap
      if (dToTarget < 0.9) {
        this.triggerWin(
          "Golden Bead Deflected into the Quantum Target Portal!"
        );
      }
    }
  }

  // ============================================================================
  // ANIMATION LOOP & RUNTIME
  // ============================================================================
  private frameCount = 0;
  private lastFpsUpdate = 0;

  private animate = () => {
    requestAnimationFrame(this.animate);

    // Frame counter
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      document.getElementById("stat-fps")!.innerText =
        this.frameCount.toString();
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    const dt = 0.016; // Standard fixed time step (60fps)

    // Run Physics Engine
    if (!this.isPaused) {
      this.updatePhysics(dt);
      this.evaluateLevelGoals(dt);
    }

    // Update graphical vectors/elements
    this.updateFieldLinesAndParticles();
    this.updateCompassGrid();
    this.updateSparks(dt);

    // Update Force indicator arrows
    if (this.showForces) {
      const forceScale = 0.07;
      const torqueScale = 0.08;

      for (const m of this.magnets) {
        if (m.forceArrow && m.torqueArrow) {
          const fLen = m.force.length();
          if (fLen > 0.02 && !m.isPositionFrozen) {
            m.forceArrow.setDirection(m.force.clone().normalize());
            m.forceArrow.setLength(
              Math.min(fLen * forceScale, 2.5),
              0.25,
              0.15
            );
            m.forceArrow.visible = true;
          } else {
            m.forceArrow.visible = false;
          }

          const tLen = m.torque.length();
          if (tLen > 0.02 && !m.isRotationFrozen) {
            m.torqueArrow.setDirection(m.torque.clone().normalize());
            m.torqueArrow.setLength(
              Math.min(tLen * torqueScale, 2.5),
              0.25,
              0.15
            );
            m.torqueArrow.visible = true;
          } else {
            m.torqueArrow.visible = false;
          }
        }
      }
    }

    // Update heatmap uniforms
    if (this.showHeatmap && this.heatmapSlice) {
      const mat = this.heatmapSlice.material as THREE.ShaderMaterial;
      const activeMags = this.magnets.filter((m) => m.type !== "filing");

      mat.uniforms.uTime!.value = now * 0.001;
      mat.uniforms.uMagnetCount!.value = Math.min(activeMags.length, 16);

      const positions = mat.uniforms.uMagnetPositions!.value as THREE.Vector3[];
      const moments = mat.uniforms.uMagnetMoments!.value as THREE.Vector3[];

      for (let i = 0; i < 16; i++) {
        if (i < activeMags.length) {
          positions[i]!.copy(activeMags[i]!.position);
          moments[i]!.copy(activeMags[i]!.getMagneticMoment());
        } else {
          positions[i]!.set(0, -999, 0); // Hide off-screen
          moments[i]!.set(0, 0, 0);
        }
      }
    }

    // Render viewport camera
    this.renderer.render(this.scene, this.camera);
  };
}

// Instantiate
new MagnetismApp();
