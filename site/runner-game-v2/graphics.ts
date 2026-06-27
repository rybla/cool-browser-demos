// Three.js Graphics Engine for Scribble Roll
import * as THREE from "three";

export class GraphicsEngine {
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;

  // Procedurally generated textures
  public hatchTexture!: THREE.Texture;
  public paperTexture!: THREE.Texture;
  public marbleTexture!: THREE.Texture;
  public cloudTexture!: THREE.Texture;
  public starTexture!: THREE.Texture;

  // Active mesh mapping: physical handle -> ThreeJS Group/Mesh
  private meshMap = new Map<number, THREE.Object3D>();

  // Custom sketchy lines we want to animate (vibrate)
  private vibratingLines: Array<{
    line: THREE.LineLoop;
    geometries: THREE.BufferGeometry[]; // 2 frames of jittered line geometry
    frameRate: number; // updates per sec
    elapsed: number;
    currentFrame: number;
  }> = [];

  // Particle systems
  private particles: Array<{
    mesh: THREE.Sprite;
    velocity: THREE.Vector3;
    life: number; // 0 to 1
    decay: number;
    spin: number;
  }> = [];

  constructor() {}

  public init(canvas: HTMLCanvasElement) {
    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfbfaf7); // Warm paper background

    // 2. Create Camera (Orthogonal-like Perspective for 2.5D)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    // Position camera looking down Z axis at X-Y plane
    this.camera.position.set(0, 4, 25);

    // 3. Create WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false; // Minimalist flat/sketch feel, no standard 3D shadows

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.15);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);

    // 5. Generate Procedural Textures
    this.generateTextures();
  }

  // Handle window resizing
  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public getObjectMesh(id: number): THREE.Object3D | undefined {
    return this.meshMap.get(id);
  }

  public setObjectMesh(id: number, mesh: THREE.Object3D) {
    this.meshMap.set(id, mesh);
  }

  // PROCEDURAL CANVAS TEXTURE GENERATOR
  private generateTextures() {
    // --- 1. PENCIL CROSS-HATCHING TEXTURE ---
    const hatchCanvas = document.createElement("canvas");
    hatchCanvas.width = 256;
    hatchCanvas.height = 256;
    const ctxHatch = hatchCanvas.getContext("2d")!;
    ctxHatch.fillStyle = "#fdfbf7"; // Match card paper background
    ctxHatch.fillRect(0, 0, 256, 256);

    ctxHatch.strokeStyle = "rgba(43, 43, 42, 0.28)"; // Charcoal color
    ctxHatch.lineWidth = 1.2;

    // Draw sketchy diagonal lines
    for (let i = -256; i < 256; i += 16) {
      // Diagonal Down-Right
      ctxHatch.beginPath();
      ctxHatch.moveTo(i, 0);
      ctxHatch.lineTo(i + 256, 256);
      ctxHatch.stroke();

      // Add a bit of random offset to make it look hand-shaded
      if (Math.random() < 0.4) {
        ctxHatch.beginPath();
        ctxHatch.moveTo(i + 4, 0);
        ctxHatch.lineTo(i + 260, 256);
        ctxHatch.stroke();
      }
    }

    // Secondary cross hatch (perpendicular, lighter)
    ctxHatch.strokeStyle = "rgba(43, 43, 42, 0.12)";
    for (let i = 0; i < 512; i += 24) {
      ctxHatch.beginPath();
      ctxHatch.moveTo(i, 0);
      ctxHatch.lineTo(i - 256, 256);
      ctxHatch.stroke();
    }

    this.hatchTexture = new THREE.CanvasTexture(hatchCanvas);
    this.hatchTexture.wrapS = THREE.RepeatWrapping;
    this.hatchTexture.wrapT = THREE.RepeatWrapping;
    this.hatchTexture.repeat.set(1.5, 1.5);

    // --- 2. NOTEBOOK PAPER GRAIN TEXTURE ---
    const paperCanvas = document.createElement("canvas");
    paperCanvas.width = 512;
    paperCanvas.height = 512;
    const ctxPaper = paperCanvas.getContext("2d")!;
    ctxPaper.fillStyle = "#faf8f4";
    ctxPaper.fillRect(0, 0, 512, 512);

    // Add noise grain
    const imgData = ctxPaper.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 8; // Subtle noise
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r !== undefined && g !== undefined && b !== undefined) {
        data[i] = Math.max(0, Math.min(255, r + noise)); // R
        data[i + 1] = Math.max(0, Math.min(255, g + noise)); // G
        data[i + 2] = Math.max(0, Math.min(255, b + noise)); // B
      }
    }
    ctxPaper.putImageData(imgData, 0, 0);

    // Draw notebook line grids
    ctxPaper.strokeStyle = "rgba(100, 160, 230, 0.08)"; // Notebook lines
    ctxPaper.lineWidth = 1;
    for (let y = 32; y < 512; y += 32) {
      ctxPaper.beginPath();
      ctxPaper.moveTo(0, y);
      ctxPaper.lineTo(512, y);
      ctxPaper.stroke();
    }

    this.paperTexture = new THREE.CanvasTexture(paperCanvas);
    this.paperTexture.wrapS = THREE.RepeatWrapping;
    this.paperTexture.wrapT = THREE.RepeatWrapping;

    // --- 3. SKETCHED MARBLE SHADING TEXTURE ---
    const marbleCanvas = document.createElement("canvas");
    marbleCanvas.width = 256;
    marbleCanvas.height = 256;
    const ctxMarble = marbleCanvas.getContext("2d")!;
    ctxMarble.fillStyle = "#ffffff";
    ctxMarble.fillRect(0, 0, 256, 256);

    // Shading: Draw concentric/curved sketchy pencil lines to simulate spherical depth
    ctxMarble.strokeStyle = "#3c3c3a";
    ctxMarble.lineWidth = 1.5;
    ctxMarble.beginPath();
    ctxMarble.arc(128, 128, 120, 0, Math.PI * 2);
    ctxMarble.stroke();

    // Draw internal details (shading lines, cross-hatches, swirly core)
    ctxMarble.strokeStyle = "rgba(43, 43, 42, 0.6)";
    ctxMarble.lineWidth = 1.0;

    // Draw marble swirls
    ctxMarble.beginPath();
    ctxMarble.arc(128, 128, 60, 0, Math.PI, false);
    ctxMarble.stroke();

    ctxMarble.beginPath();
    ctxMarble.arc(128, 128, 80, Math.PI * 0.5, Math.PI * 1.5, true);
    ctxMarble.stroke();

    // Shading cross hatch inside the sphere
    ctxMarble.strokeStyle = "rgba(43, 43, 42, 0.2)";
    for (let x = 32; x < 224; x += 12) {
      ctxMarble.beginPath();
      ctxMarble.moveTo(x, 128 - Math.sqrt(90 * 90 - (x - 128) * (x - 128)));
      ctxMarble.lineTo(
        x + 10,
        128 + Math.sqrt(90 * 90 - (x - 128) * (x - 128))
      );
      ctxMarble.stroke();
    }

    this.marbleTexture = new THREE.CanvasTexture(marbleCanvas);

    // --- 4. DUST CLOUD PARTICLE TEXTURE ---
    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width = 64;
    cloudCanvas.height = 64;
    const ctxCloud = cloudCanvas.getContext("2d")!;
    ctxCloud.clearRect(0, 0, 64, 64);

    ctxCloud.fillStyle = "rgba(220, 215, 205, 0.6)";
    ctxCloud.strokeStyle = "rgba(60, 60, 58, 0.7)";
    ctxCloud.lineWidth = 1.5;

    // Draw bumpy cloud outline
    ctxCloud.beginPath();
    ctxCloud.arc(32, 32, 16, 0, Math.PI * 2);
    ctxCloud.arc(22, 28, 12, 0, Math.PI * 2);
    ctxCloud.arc(42, 28, 12, 0, Math.PI * 2);
    ctxCloud.arc(32, 42, 12, 0, Math.PI * 2);
    ctxCloud.fill();
    ctxCloud.stroke();

    this.cloudTexture = new THREE.CanvasTexture(cloudCanvas);

    // --- 5. SPARKLING STAR/CHIME TEXTURE ---
    const starCanvas = document.createElement("canvas");
    starCanvas.width = 64;
    starCanvas.height = 64;
    const ctxStar = starCanvas.getContext("2d")!;
    ctxStar.clearRect(0, 0, 64, 64);

    ctxStar.strokeStyle = "#d4af37"; // Golden pencil
    ctxStar.fillStyle = "rgba(253, 235, 175, 0.85)";
    ctxStar.lineWidth = 2.0;

    // Draw 4-point sketchy star
    ctxStar.beginPath();
    ctxStar.moveTo(32, 8);
    ctxStar.quadraticCurveTo(32, 32, 56, 32);
    ctxStar.quadraticCurveTo(32, 32, 32, 56);
    ctxStar.quadraticCurveTo(32, 32, 8, 32);
    ctxStar.quadraticCurveTo(32, 32, 32, 8);
    ctxStar.closePath();
    ctxStar.fill();
    ctxStar.stroke();

    this.starTexture = new THREE.CanvasTexture(starCanvas);
  }

  // ==========================================
  // OBJECT INGESTION (SURFACES & ENGINES)
  // ==========================================

  // Create a 2.5D visual mesh for static convex surfaces
  public createStaticSurfaceMesh(handle: number, points: number[]) {
    // 1. Create flat shape
    const shape = new THREE.Shape();

    if (points.length < 2) return;
    const p0 = points[0];
    const p1 = points[1];
    if (p0 === undefined || p1 === undefined) return;
    shape.moveTo(p0, p1);
    for (let i = 2; i < points.length; i += 2) {
      const px = points[i];
      const py = points[i + 1];
      if (px !== undefined && py !== undefined) {
        shape.lineTo(px, py);
      }
    }
    shape.closePath();

    // 2. Extrude slightly to give a 2.5D look (thickness = 1.5 units)
    const extrudeSettings = {
      steps: 1,
      depth: 1.5,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 2,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Shift geometry so extrusion is centered along Z=0
    geometry.translate(0, 0, -0.75);

    // Pencil hatched material
    const material = new THREE.MeshBasicMaterial({
      map: this.hatchTexture,
      color: 0xefedd8, // Warm paper board color
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Group to hold the mesh and its vibrating outline
    const group = new THREE.Group();
    group.add(mesh);

    // 3. Add vibrating outlines on the shape's front face edges
    const outlineGroup = this.createVibratingOutline(points);
    group.add(outlineGroup);

    this.scene.add(group);
    this.meshMap.set(handle, group);
  }

  // Helper: Create vibrating sketches around boundary shapes
  private createVibratingOutline(flatPoints: number[]): THREE.Group {
    const outlineGroup = new THREE.Group();

    // Reconstruct 3D points on the front face (Z = 0.75)
    const points3D: THREE.Vector3[] = [];
    for (let i = 0; i < flatPoints.length; i += 2) {
      points3D.push(new THREE.Vector3(flatPoints[i], flatPoints[i + 1], 0.77)); // Place slightly in front of face
    }

    // Prepare 2 frames of jittered geometry
    const geometries: THREE.BufferGeometry[] = [];
    const frameCount = 2;

    for (let f = 0; f < frameCount; f++) {
      const jitteredPoints: THREE.Vector3[] = [];

      // Loop over segments to subdivide and add sketchy noise
      for (let i = 0; i < points3D.length; i++) {
        const p1 = points3D[i];
        const p2 = points3D[(i + 1) % points3D.length];
        if (!p1 || !p2) continue;

        const dist = p1.distanceTo(p2);
        const segments = Math.max(2, Math.floor(dist / 0.6));

        for (let s = 0; s < segments; s++) {
          const t = s / segments;
          const p = new THREE.Vector3().lerpVectors(p1, p2, t);

          // Jitter offset perpendicular to travel or general random
          const jitterScale = 0.045;
          p.x += (Math.random() - 0.5) * jitterScale;
          p.y += (Math.random() - 0.5) * jitterScale;

          jitteredPoints.push(p);
        }
      }
      // Add first point to close loop
      if (jitteredPoints.length > 0) {
        const first = jitteredPoints[0];
        if (first) {
          jitteredPoints.push(first.clone());
        }
      }

      const geom = new THREE.BufferGeometry().setFromPoints(jitteredPoints);
      geometries.push(geom);
    }

    // Create the Line loop mesh (draws first frame)
    const mat = new THREE.LineBasicMaterial({
      color: 0x2b2b2a, // Pencil charcoal
      linewidth: 1.5, // note: linewidth > 1 usually ignored by WebGL, but good practice
    });

    const line = new THREE.LineLoop(geometries[0], mat);
    outlineGroup.add(line);

    // Register for global frame-by-frame vibration
    this.vibratingLines.push({
      line,
      geometries,
      frameRate: 10 + Math.random() * 4, // 10-14 FPS jitter rate
      elapsed: 0,
      currentFrame: 0,
    });

    // Add a second, lighter outline offset slightly to make it look like a messy pencil trace
    const geometries2: THREE.BufferGeometry[] = [];
    for (let f = 0; f < frameCount; f++) {
      const jitteredPoints2: THREE.Vector3[] = [];
      for (let i = 0; i < points3D.length; i++) {
        const p1 = points3D[i];
        const p2 = points3D[(i + 1) % points3D.length];
        if (!p1 || !p2) continue;
        const dist = p1.distanceTo(p2);
        const segments = Math.max(1, Math.floor(dist / 0.8));

        for (let s = 0; s < segments; s++) {
          const t = s / segments;
          const p = new THREE.Vector3().lerpVectors(p1, p2, t);

          p.x += (Math.random() - 0.5) * 0.07 + 0.02; // Offset center slightly
          p.y += (Math.random() - 0.5) * 0.07 - 0.02;

          jitteredPoints2.push(p);
        }
      }
      if (jitteredPoints2.length > 0) {
        const first = jitteredPoints2[0];
        if (first) {
          jitteredPoints2.push(first.clone());
        }
      }

      const geom = new THREE.BufferGeometry().setFromPoints(jitteredPoints2);
      geometries2.push(geom);
    }

    const mat2 = new THREE.LineBasicMaterial({
      color: 0x5a5a58, // Lighter gray outline
      transparent: true,
      opacity: 0.65,
    });
    const line2 = new THREE.LineLoop(geometries2[0], mat2);
    outlineGroup.add(line2);

    this.vibratingLines.push({
      line: line2,
      geometries: geometries2,
      frameRate: 8 + Math.random() * 4,
      elapsed: 0,
      currentFrame: 0,
    });

    return outlineGroup;
  }

  // Create the player marble mesh
  public createPlayerMesh(radius: number): THREE.Object3D {
    // 3D Sphere geometry
    const geometry = new THREE.SphereGeometry(radius, 24, 24);

    // Map our sketchy texture
    const material = new THREE.MeshBasicMaterial({
      map: this.marbleTexture,
      color: 0xffffff,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);

    // Create a 2D sketchy halo outline that sits behind the marble
    const haloGeometries: THREE.BufferGeometry[] = [];
    const segments = 32;
    for (let f = 0; f < 2; f++) {
      const circlePoints: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const radJitter = radius + (Math.random() - 0.5) * 0.05 + 0.02;
        circlePoints.push(
          new THREE.Vector3(
            Math.cos(theta) * radJitter,
            Math.sin(theta) * radJitter,
            0.02
          )
        );
      }
      haloGeometries.push(
        new THREE.BufferGeometry().setFromPoints(circlePoints)
      );
    }

    const haloMat = new THREE.LineBasicMaterial({
      color: 0x1a1a19,
      linewidth: 2,
    });
    const haloLine = new THREE.LineLoop(haloGeometries[0], haloMat);

    // We attach the halo to the scene and position it at the player's coordinate,
    // but we DO NOT rotate it (so the outline remains steady while the marble spheres spins)!
    const playerGroup = new THREE.Group();
    playerGroup.add(mesh);
    playerGroup.add(haloLine);

    this.scene.add(playerGroup);

    this.vibratingLines.push({
      line: haloLine,
      geometries: haloGeometries,
      frameRate: 12,
      elapsed: 0,
      currentFrame: 0,
    });

    return playerGroup;
  }

  // Create dynamic and interactive meshes based on type
  public createObjectMesh(
    objType: string,
    id: number,
    data: {
      w?: number;
      h?: number;
      length?: number;
      id?: string;
      targetGateId?: string;
      force?: number;
    }
  ) {
    const group = new THREE.Group();

    const charMat = new THREE.MeshBasicMaterial({
      map: this.hatchTexture,
      color: 0xefedd8,
    });

    const w = data.w ?? 2.0;
    const h = data.h ?? 2.0;
    const length = data.length ?? 8.0;
    const force = data.force ?? 1.0;

    if (objType === "crate") {
      // 3D Cuboid
      const geom = new THREE.BoxGeometry(w, h, 1.2);
      const mesh = new THREE.Mesh(geom, charMat);
      mesh.position.set(0, 0, 0);
      group.add(mesh);

      // Sketchy Box edges
      const outlinePoints = [
        -w / 2,
        -h / 2,
        w / 2,
        -h / 2,
        w / 2,
        h / 2,
        -w / 2,
        h / 2,
      ];
      const outlines = this.createVibratingOutline(outlinePoints);
      outlines.position.set(0, 0, 0.61); // Project on front face of crate
      group.add(outlines);
    } else if (objType === "gate") {
      const geom = new THREE.BoxGeometry(w, h, 0.8);
      // Reddish/dark sketchy gate
      const gateMat = new THREE.MeshBasicMaterial({
        map: this.hatchTexture,
        color: 0xdeb887, // Warm wood gate color
      });
      const mesh = new THREE.Mesh(geom, gateMat);
      group.add(mesh);

      // Gate cross planks decoration
      const linesGroup = this.createVibratingOutline([
        -w / 2,
        -h / 2,
        w / 2,
        -h / 2,
        w / 2,
        h / 2,
        -w / 2,
        h / 2,
      ]);
      linesGroup.position.set(0, 0, 0.41);
      group.add(linesGroup);

      // Diagonal cross brace line
      const crossPoints = [
        -w / 2,
        -h / 2,
        w / 2,
        h / 2,
        w / 2,
        -h / 2,
        -w / 2,
        h / 2,
      ];
      const crossOutlines = this.createVibratingOutline(crossPoints);
      crossOutlines.position.set(0, 0, 0.41);
      group.add(crossOutlines);
    } else if (objType === "button") {
      // Small stand and switch pad
      const geom = new THREE.BoxGeometry(w, h, 0.6);
      const btnMat = new THREE.MeshBasicMaterial({
        color: 0xe65c5c, // Hand-drawn Red button
      });
      const mesh = new THREE.Mesh(geom, btnMat);
      group.add(mesh);

      const outline = this.createVibratingOutline([
        -w / 2,
        -h / 2,
        w / 2,
        -h / 2,
        w / 2,
        h / 2,
        -w / 2,
        h / 2,
      ]);
      outline.position.set(0, 0, 0.31);
      group.add(outline);
    } else if (objType === "trampoline") {
      // Sketchy spring-board
      const geom = new THREE.BoxGeometry(w, h, 0.5);
      const springMat = new THREE.MeshBasicMaterial({
        color: 0x64a0e6, // Hand-drawn Blue launcher board
      });
      const mesh = new THREE.Mesh(geom, springMat);
      group.add(mesh);

      const outline = this.createVibratingOutline([
        -w / 2,
        -h / 2,
        w / 2,
        -h / 2,
        w / 2,
        h / 2,
        -w / 2,
        h / 2,
      ]);
      outline.position.set(0, 0, 0.26);
      group.add(outline);

      // Draw dynamic spring coils underneath
      const springLines = this.createVibratingOutline([
        -w / 4,
        -h / 2,
        -w / 4,
        -h * 2,
        w / 4,
        -h / 2,
        w / 4,
        -h * 2,
      ]);
      group.add(springLines);
    } else if (objType === "seesaw") {
      // Pivot shape and the plank
      const plankGeom = new THREE.BoxGeometry(length, 0.3, 1.0);
      const mesh = new THREE.Mesh(plankGeom, charMat);
      group.add(mesh);

      const outline = this.createVibratingOutline([
        -length / 2,
        -0.15,
        length / 2,
        -0.15,
        length / 2,
        0.15,
        -length / 2,
        0.15,
      ]);
      outline.position.set(0, 0, 0.51);
      group.add(outline);
    } else if (objType === "chime") {
      // Golden star collectible chime sprite
      const material = new THREE.SpriteMaterial({
        map: this.starTexture,
        transparent: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.5, 1.5, 1.0);
      group.add(sprite);
      const hElevator = 0.4;
      const geom = new THREE.BoxGeometry(w, hElevator, 1.0);
      const liftMat = new THREE.MeshBasicMaterial({
        map: this.hatchTexture,
        color: 0xd3d3d3,
      });
      const mesh = new THREE.Mesh(geom, liftMat);
      group.add(mesh);

      const outline = this.createVibratingOutline([
        -w / 2,
        -hElevator / 2,
        w / 2,
        -hElevator / 2,
        w / 2,
        hElevator / 2,
        -w / 2,
        hElevator / 2,
      ]);
      outline.position.set(0, 0, 0.51);
      group.add(outline);
    } else if (objType === "wedge") {
      // Extrude custom symmetrical triangle shape for double-sided ramp
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h / 2);
      shape.lineTo(0, h / 2);
      shape.closePath();
      const extrudeSettings = { depth: 1.2, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geom.center();
      const mesh = new THREE.Mesh(geom, charMat);
      group.add(mesh);

      const outline = this.createVibratingOutline([
        -w / 2,
        -h / 2,
        w / 2,
        -h / 2,
        0,
        h / 2,
        -w / 2,
        -h / 2,
      ]);
      outline.position.set(0, 0, 0.61);
      group.add(outline);
    } else if (objType === "pendulum") {
      const r = 1.1;
      const pivotY = length;

      // 1. Hammer Head (Sphere)
      const headGeom = new THREE.SphereGeometry(r, 16, 16);
      const headMesh = new THREE.Mesh(headGeom, charMat);
      group.add(headMesh);

      // Head outline (flat array circle points)
      const circlePoints: number[] = [];
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        circlePoints.push(Math.cos(theta) * r, Math.sin(theta) * r);
      }
      const headOutline = this.createVibratingOutline(circlePoints);
      headOutline.position.set(0, 0, 0.51);
      group.add(headOutline);

      // 2. Pivot (small fixed box at top pivot coordinates)
      const pivotGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const pivotMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
      const pivotMesh = new THREE.Mesh(pivotGeom, pivotMat);
      pivotMesh.position.set(0, pivotY, 0);
      group.add(pivotMesh);

      const pivotOutline = this.createVibratingOutline([
        -0.25, -0.25, 0.25, -0.25, 0.25, 0.25, -0.25, 0.25,
      ]);
      pivotOutline.position.set(0, pivotY, 0.26);
      group.add(pivotOutline);

      // 3. Rod (connecting line, loops back drawing double stroke)
      const rodOutline = this.createVibratingOutline([0, 0, 0, pivotY]);
      rodOutline.position.set(0, 0, 0.1);
      group.add(rodOutline);
    } else if (objType === "domino") {
      const geom = new THREE.BoxGeometry(w, h, 0.8);
      const dominoMat = new THREE.MeshBasicMaterial({
        map: this.hatchTexture,
        color: 0xb58a63, // Warm medium wood tone
      });
      const mesh = new THREE.Mesh(geom, dominoMat);
      group.add(mesh);

      const outline = this.createVibratingOutline([
        -w / 2,
        -h / 2,
        w / 2,
        -h / 2,
        w / 2,
        h / 2,
        -w / 2,
        h / 2,
      ]);
      outline.position.set(0, 0, 0.41);
      group.add(outline);
    } else if (objType === "booster") {
      const geom = new THREE.BoxGeometry(w, h, 0.3);
      const boosterMat = new THREE.MeshBasicMaterial({
        color: 0x48c78e, // Green boost pad
      });
      const mesh = new THREE.Mesh(geom, boosterMat);
      group.add(mesh);

      // Sketchy arrows pointing right
      const arrows = this.createVibratingOutline([
        -w / 3,
        -h / 4,
        -w / 6,
        0,
        -w / 6,
        0,
        -w / 3,
        h / 4,
        -w / 12,
        -h / 4,
        w / 12,
        0,
        w / 12,
        0,
        -w / 12,
        h / 4,
        w / 6,
        -h / 4,
        w / 3,
        0,
        w / 3,
        0,
        w / 6,
        h / 4,
      ]);
      arrows.position.set(0, 0, 0.16);
      group.add(arrows);
    } else if (objType === "gravity_pad") {
      const geom = new THREE.BoxGeometry(w, h, 0.3);
      const gravMat = new THREE.MeshBasicMaterial({
        color: 0xab7afb, // Purple gravity pad
      });
      const mesh = new THREE.Mesh(geom, gravMat);
      group.add(mesh);

      const isUp = force > 0;
      const arrows = this.createVibratingOutline(
        isUp
          ? [
              -w / 4,
              -h / 4,
              0,
              h / 3,
              0,
              h / 3,
              w / 4,
              -h / 4,
              0,
              -h / 4,
              0,
              h / 3,
            ]
          : [
              -w / 4,
              h / 4,
              0,
              -h / 3,
              0,
              -h / 3,
              w / 4,
              h / 4,
              0,
              h / 4,
              0,
              -h / 3,
            ]
      );
      arrows.position.set(0, 0, 0.16);
      group.add(arrows);
    }

    this.scene.add(group);
    this.meshMap.set(id, group);
  }

  // Remove a mesh representation
  public removeObjectMesh(id: number) {
    const obj = this.meshMap.get(id);
    if (!obj) return;

    // Recursively traverse and dispose geometries and materials
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mesh = child;
        (mesh.geometry as THREE.BufferGeometry).dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if (m instanceof THREE.Material) m.dispose();
          });
        } else if (mat instanceof THREE.Material) {
          mat.dispose();
        }
      } else if (child instanceof THREE.LineLoop) {
        const lineLoop = child;
        (lineLoop.geometry as THREE.BufferGeometry).dispose();
        const mat = lineLoop.material as THREE.Material | THREE.Material[];
        if (mat instanceof THREE.Material) {
          mat.dispose();
        }
      }
    });

    // Remove matching vibrating lines from the ticker array
    this.vibratingLines = this.vibratingLines.filter((vl) => {
      // Check if this line is a descendant of the removed object group
      let isDescendant = false;
      obj.traverse((child) => {
        if (child === vl.line) isDescendant = true;
      });
      return !isDescendant;
    });

    this.scene.remove(obj);
    this.meshMap.delete(id);
  }

  // Set the position and rotation of a mesh group to mirror its physics model
  public updateObjectPosition(
    id: number,
    pos: { x: number; y: number },
    rot: number = 0
  ) {
    const obj = this.meshMap.get(id);
    if (obj) {
      obj.position.set(pos.x, pos.y, 0);
      obj.rotation.z = rot;
    }
  }

  // ==========================================
  // PARTICLE EMITTER
  // ==========================================

  public emitDashParticles(x: number, y: number, isForwards: boolean) {
    const dir = isForwards ? -1 : 1;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.cloudTexture,
        transparent: true,
        opacity: 0.65,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(
        x + (Math.random() - 0.5) * 0.5,
        y - 0.4 + (Math.random() - 0.5) * 0.4,
        0.1
      );
      // Scale: start small
      const scale = 0.5 + Math.random() * 0.8;
      sprite.scale.set(scale, scale, 1.0);

      this.scene.add(sprite);

      this.particles.push({
        mesh: sprite,
        velocity: new THREE.Vector3(
          dir * (2.0 + Math.random() * 3.0),
          (Math.random() - 0.3) * 1.5,
          0
        ),
        life: 1.0,
        decay: 0.04 + Math.random() * 0.05,
        spin: (Math.random() - 0.5) * 0.1,
      });
    }
  }

  public emitChimeParticles(x: number, y: number) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.starTexture,
        transparent: true,
        opacity: 0.9,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x, y, 0.2);
      const scale = 0.4 + Math.random() * 0.5;
      sprite.scale.set(scale, scale, 1.0);

      this.scene.add(sprite);

      // Random explosion directions
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.0;
      this.particles.push({
        mesh: sprite,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          0
        ),
        life: 1.0,
        decay: 0.03 + Math.random() * 0.04,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  // Update particles and animate outline vibrations
  public update(dt: number) {
    // 1. Tick and swap frames for vibrating sketchy lines
    this.vibratingLines.forEach((vl) => {
      vl.elapsed += dt;
      const frameInterval = 1.0 / vl.frameRate;
      if (vl.elapsed >= frameInterval) {
        vl.elapsed = 0;
        vl.currentFrame = (vl.currentFrame + 1) % vl.geometries.length;
        // Swap line buffer geometry
        const nextGeom = vl.geometries[vl.currentFrame];
        if (nextGeom) {
          vl.line.geometry = nextGeom;
        }
      }
    });

    // 2. Animate and prune particles
    this.particles = this.particles.filter((p) => {
      // Apply velocity
      p.mesh.position.addScaledVector(p.velocity, dt);

      // Decay velocity (drag)
      p.velocity.multiplyScalar(0.94);

      // Spin sprite
      p.mesh.rotation.z += p.spin;

      // Decay life
      p.life -= p.decay;

      // Fade opacity and swell scale
      p.mesh.material.opacity = Math.max(0, p.life);
      const newScale = p.mesh.scale.x + dt * 0.5;
      p.mesh.scale.set(newScale, newScale, 1.0);

      if (p.life <= 0) {
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  // Clean up all resources
  public destroy() {
    this.meshMap.forEach((_, key) => this.removeObjectMesh(key));
    this.vibratingLines = [];
    this.particles.forEach((p) => {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      this.scene.remove(p.mesh);
    });
    this.particles = [];

    // Dispose textures
    if (this.hatchTexture) this.hatchTexture.dispose();
    if (this.paperTexture) this.paperTexture.dispose();
    if (this.marbleTexture) this.marbleTexture.dispose();
    if (this.cloudTexture) this.cloudTexture.dispose();
    if (this.starTexture) this.starTexture.dispose();

    if (this.renderer) this.renderer.dispose();
  }
}

// Export singleton instance
export const graphics = new GraphicsEngine();
