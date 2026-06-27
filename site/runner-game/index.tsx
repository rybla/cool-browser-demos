import * as THREE from "three";
import RAPIER from "@dimforge/rapier2d-compat";

// ==========================================
// 1. RETRO AUDIO SYNTHESIS & MUSIC SEQUENCER
// ==========================================
class SoundManager {
  private ctx: AudioContext | null = null;
  private sfxEnabled = true;
  private bgmEnabled = true;
  private tempo = 130;
  private schedulerTimerId: number | null = null;

  // Music state
  private nextNoteTime = 0.0;
  private currentStep = 0;
  private beatsPerBar = 8; // 8th notes
  private musicVolumeNode: GainNode | null = null;

  // Chord progression: Am (A2/A3), F (F2/F3), C (C2/C3), G (G2/G3)
  private bassNotes = [
    [55.0, 110.0], // Am (A1/A2) -> 55Hz, 110Hz
    [43.65, 87.3], // F (F1/F2) -> 43.65Hz, 87.3Hz
    [65.41, 130.81], // C (C2/C3) -> 65.41Hz, 130.81Hz
    [49.0, 98.0], // G (G1/G2) -> 49Hz, 98Hz
  ];

  private melodyNotes = [
    [220.0, 261.63, 329.63, 440.0], // Am (A3, C4, E4, A4)
    [174.61, 220.0, 261.63, 349.23], // F (F3, A3, C4, F4)
    [261.63, 329.63, 392.0, 523.25], // C (C4, E4, G4, C5)
    [196.0, 246.94, 293.66, 392.0], // G (G3, B3, D4, G4)
  ];

  constructor() {
    this.setupUIListeners();
  }

  private setupUIListeners() {
    const sfxCheckbox = document.getElementById(
      "toggle-sfx"
    ) as HTMLInputElement;
    const bgmCheckbox = document.getElementById(
      "toggle-bgm"
    ) as HTMLInputElement;

    if (sfxCheckbox) {
      sfxCheckbox.addEventListener("change", (e) => {
        this.sfxEnabled = (e.target as HTMLInputElement).checked;
        sfxCheckbox.blur();
      });
    }

    if (bgmCheckbox) {
      bgmCheckbox.addEventListener("change", (e) => {
        this.bgmEnabled = (e.target as HTMLInputElement).checked;
        bgmCheckbox.blur();
        if (this.bgmEnabled) {
          this.resumeMusic();
        } else {
          this.pauseMusic();
        }
      });
    }
  }

  public init() {
    if (this.ctx) return;

    // Create AudioContext
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Create Master BGM Volume node
    this.musicVolumeNode = this.ctx.createGain();
    this.musicVolumeNode.gain.value = 0.12; // Low background volume
    this.musicVolumeNode.connect(this.ctx.destination);

    this.nextNoteTime = this.ctx.currentTime;

    if (this.bgmEnabled) {
      this.startMusicLoop();
    }
  }

  private resumeMusic() {
    if (!this.ctx) {
      this.init();
      return;
    }
    if (this.ctx.state === "suspended") {
      this.ctx
        .resume()
        .catch((err: unknown) =>
          console.error("Audio Context Resume failed", err)
        );
    }
    this.startMusicLoop();
  }

  private pauseMusic() {
    if (this.schedulerTimerId !== null) {
      window.clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  private startMusicLoop() {
    if (this.schedulerTimerId !== null) return;

    this.nextNoteTime = this.ctx ? this.ctx.currentTime : 0;

    this.schedulerTimerId = window.setInterval(() => {
      this.scheduler();
    }, 60); // Check frequently
  }

  private scheduler() {
    if (!this.ctx || !this.musicVolumeNode) return;

    // While there are notes to play before the next check window
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);

      // Advance step
      const secondsPerBeat = 60.0 / this.tempo;
      const stepDuration = secondsPerBeat / 2.0; // 8th notes
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 32; // 4 bars of 8 steps
    }
  }

  private scheduleNote(step: number, time: number) {
    if (!this.ctx || !this.musicVolumeNode || !this.bgmEnabled) return;

    const bar = Math.floor(step / 8);
    const stepInBar = step % 8;
    const chordIndex = bar; // 4 bars = Am, F, C, G

    // --- BASSLINE (Triangle wave) ---
    // Alternate octave beats on triangle oscillator
    const bassFreqs = this.bassNotes[chordIndex]!;
    const bassFreq = stepInBar % 2 === 0 ? bassFreqs[0]! : bassFreqs[1]!;

    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();

    bassOsc.type = "triangle";
    bassOsc.frequency.setValueAtTime(bassFreq, time);

    bassGain.gain.setValueAtTime(0.3, time);
    bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    bassOsc.connect(bassGain);
    bassGain.connect(this.musicVolumeNode);

    bassOsc.start(time);
    bassOsc.stop(time + 0.25);

    // --- MELODY ARPEGGIO (Square wave with filter) ---
    // Arpeggiated melody on beats 0, 2, 3, 5, 6
    const melPattern = [0, 2, 3, 5, 6];
    if (melPattern.includes(stepInBar)) {
      const melodyFreqs = this.melodyNotes[chordIndex]!;
      // Pick arpeggio note based on step
      const noteIndex = (stepInBar * 3) % melodyFreqs.length;
      const melFreq = melodyFreqs[noteIndex]!;

      const melOsc = this.ctx.createOscillator();
      const melGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      melOsc.type = "square";
      melOsc.frequency.setValueAtTime(melFreq, time);

      // Low pass retro sweep
      filter.type = "lowpass";
      filter.Q.setValueAtTime(5, time);
      filter.frequency.setValueAtTime(1200, time);
      filter.frequency.exponentialRampToValueAtTime(200, time + 0.15);

      melGain.gain.setValueAtTime(0.06, time);
      melGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

      melOsc.connect(filter);
      filter.connect(melGain);
      melGain.connect(this.musicVolumeNode);

      melOsc.start(time);
      melOsc.stop(time + 0.2);
    }
  }

  // --- SOUND EFFECTS (SFX) ---

  public playJump() {
    if (!this.sfxEnabled || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(650, time + 0.15);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  public playDoubleJump() {
    if (!this.sfxEnabled || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, time);
    osc.frequency.exponentialRampToValueAtTime(900, time + 0.13);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  public playDash() {
    if (!this.sfxEnabled || !this.ctx) return;

    const time = this.ctx.currentTime;

    // Synth Sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(900, time + 0.25);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.25);

    // Noise Blast for crash effect
    try {
      const bufferSize = this.ctx.sampleRate * 0.25;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(800, time);
      noiseFilter.frequency.exponentialRampToValueAtTime(200, time + 0.25);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.12, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start(time);
      noise.stop(time + 0.25);
    } catch (_e) {
      // Fallback if buffer creation fails
    }
  }

  public playHit() {
    if (!this.sfxEnabled || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(350, time);
    osc.frequency.linearRampToValueAtTime(60, time + 0.25);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  public playCoin() {
    if (!this.sfxEnabled || !this.ctx) return;

    const time = this.ctx.currentTime;

    // First high note (C5)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, time); // C5
    gain1.gain.setValueAtTime(0.15, time);
    gain1.gain.setValueAtTime(0.15, time + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(time);
    osc1.stop(time + 0.12);

    // Second note (G5) at offset
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(783.99, time + 0.06); // G5
    gain2.gain.setValueAtTime(0.15, time + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(time + 0.06);
    osc2.stop(time + 0.2);
  }

  public playCheckpoint() {
    const ctx = this.ctx;
    if (!this.sfxEnabled || !ctx) return;

    const time = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5]; // C major arpeggio
    const noteDuration = 0.07;

    notes.forEach((freq, idx) => {
      const noteTime = time + idx * noteDuration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.08, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.2);
    });
  }

  public playUpgrade() {
    if (!this.sfxEnabled || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(440, time);
    osc.frequency.setValueAtTime(880, time + 0.1);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  public playGameOver() {
    const ctx = this.ctx;
    if (!this.sfxEnabled || !ctx) return;

    const time = ctx.currentTime;
    const notes = [311.13, 293.66, 261.63, 196.0, 146.83]; // Descending minor
    const noteDuration = 0.15;

    notes.forEach((freq, idx) => {
      const noteTime = time + idx * noteDuration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, noteTime);
      osc.frequency.linearRampToValueAtTime(freq - 20, noteTime + 0.2);

      gain.gain.setValueAtTime(0.18, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.3);
    });
  }
}

const Audio = new SoundManager();

// ==========================================
// 2. CONFIGURATION AND CONSTANTS
// ==========================================
const CHUNK_WIDTH = 30;

// Upgrades config
interface UpgradeOption {
  id: string;
  name: string;
  desc: string;
  icon: string;
  effect: (player: Player) => void;
  diffText: string;
}

const UPGRADES_POOL: UpgradeOption[] = [
  {
    id: "speed",
    name: "Speed Overload",
    desc: "Increases running and acceleration speed (+15%)",
    icon: "🏃",
    effect: (p) => {
      p.speedMult += 0.15;
    },
    diffText: "Max Speed +15%",
  },
  {
    id: "jump",
    name: "Gravity Defier",
    desc: "Improves jump vertical force (+12%)",
    icon: "🦘",
    effect: (p) => {
      p.jumpMult += 0.12;
    },
    diffText: "Jump Height +12%",
  },
  {
    id: "dash",
    name: "Chrono Core",
    desc: "Reduces Neon Dash cooldown (-0.5s)",
    icon: "⚡",
    effect: (p) => {
      p.dashCooldown = Math.max(1.2, p.dashCooldown - 0.5);
    },
    diffText: "Dash Cooldown -0.5s",
  },
  {
    id: "shield_max",
    name: "Aegis Upgrade",
    desc: "Adds +1 maximum Shield Capacity and heals 1 point",
    icon: "🛡️",
    effect: (p) => {
      p.shieldMax = Math.min(6, p.shieldMax + 1);
      p.shield = Math.min(p.shieldMax, p.shield + 1);
    },
    diffText: "Max Shield +1",
  },
  {
    id: "magnet",
    name: "Glitch Attractor",
    desc: "Expands Coin Magnetism pickup radius (+1.5m)",
    icon: "🧲",
    effect: (p) => {
      p.magnetRadius += 1.5;
    },
    diffText: "Magnet Radius +1.5m",
  },
  {
    id: "repair",
    name: "Repair Bots",
    desc: "Restores +2 damaged Shield blocks instantly",
    icon: "🔧",
    effect: (p) => {
      p.shield = Math.min(p.shieldMax, p.shield + 2);
    },
    diffText: "Repairs +2 Shield Blocks",
  },
];

// ==========================================
// 3. RETRO PARTICLE SYSTEM
// ==========================================
interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  decay: number;
  gravityEffect: number;
}

class ParticleManager {
  private particles: Particle[] = [];
  private scene: THREE.Scene;
  private particleGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawn(
    x: number,
    y: number,
    color: number,
    count: number,
    speed: number,
    decayRange = [0.02, 0.05],
    gravityEffect = 0.5
  ) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeom, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.3,
        y + (Math.random() - 0.5) * 0.3,
        0
      );
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;

      this.particles.push({
        mesh,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life: 1.0,
        decay:
          decayRange[0]! + Math.random() * (decayRange[1]! - decayRange[0]!),
        gravityEffect,
      });
    }
  }

  public update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= p.decay * (dt * 60);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        // Since all meshes share the same material in a single frame, we don't dispose material instantly here
        this.particles.splice(i, 1);
      } else {
        // Apply velocity & physics
        p.vy -= 18.0 * p.gravityEffect * dt; // simple gravity
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;

        // Shrink and fade
        p.mesh.scale.set(p.life, p.life, p.life);
        if (Array.isArray(p.mesh.material)) {
          // Skip if somehow multi-material
        } else if (p.mesh.material) {
          p.mesh.material.opacity = p.life;
        }
      }
    }
  }

  public clear() {
    this.particles.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
    });
    this.particles = [];
  }
}

// ==========================================
// 4. ENTITY MANAGER & COLLISION TYPES
// ==========================================
interface Entity {
  type:
    | "ground"
    | "spike"
    | "breakable"
    | "drone"
    | "bot"
    | "coin"
    | "checkpoint"
    | "projectile";
  body: RAPIER.RigidBody | null;
  mesh: THREE.Object3D;
  isDead: boolean;
  update?: (dt: number, time: number, playerPos: THREE.Vector3) => void;
  onCollide?: (player: Player) => void;
  destroy: () => void;
  w?: number;
  h?: number;
}

// Map physics body handles to entities
const bodyToEntityMap = new Map<number, Entity>();

// ==========================================
// 5. PLAYER CONTROLLER
// ==========================================
class Player {
  public body: RAPIER.RigidBody;
  public mesh: THREE.Group;

  // Game Play attributes (5 base attributes upgradable)
  public speedMult = 1.0; // Affects RUN SPEED (Speed Attribute)
  public jumpMult = 1.0; // Affects JUMP POWER (Jump Attribute)
  public dashCooldown = 3.0; // Affects DASH COOLDOWN (Agility Attribute)
  public shieldMax = 3; // Affects MAX HEALTH (Shield/Armor Attribute)
  public shield = 3;
  public magnetRadius = 2.0; // Affects COLLECTION RAD (Energy Attribute)

  // Motion states
  private baseSpeed = 10.5;
  private baseJumpForce = 13.5;
  public doubleJumpsUsed = 0;
  private maxDoubleJumps = 1;
  public isInvulnerable = false;
  private invulnTimer = 0.0;
  private activeInvulnTime = 1.2;

  // Dash (Special move)
  public dashTimer = 0.0;
  public activeDashTime = 0.22;
  public dashCooldownTimer = 0.0;

  // Visuals
  private meshOutline: THREE.LineSegments;

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    startX: number,
    startY: number
  ) {
    // 1. Create Rapier Physics Body
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startX, startY)
      .setLinearDamping(0.3)
      .lockRotations();
    this.body = world.createRigidBody(bodyDesc);

    // Collider (Box collider)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.38, 0.38)
      .setRestitution(0.0)
      .setFriction(0.0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    world.createCollider(colliderDesc, this.body);

    // 2. Create Three.js visuals
    this.mesh = new THREE.Group();
    const geom = new THREE.BoxGeometry(0.76, 0.76, 0.76);
    // Dark core face for high contrast in light mode
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x121020,
      transparent: true,
      opacity: 0.95,
    });
    const coreMesh = new THREE.Mesh(geom, coreMat);
    this.mesh.add(coreMesh);

    // Electric cyan edges
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00bfff,
      linewidth: 3,
    });
    this.meshOutline = new THREE.LineSegments(edges, lineMat);
    this.mesh.add(this.meshOutline);

    scene.add(this.mesh);
  }

  public getX(): number {
    return this.body.translation().x;
  }

  public getY(): number {
    return this.body.translation().y;
  }

  public isDashing(): boolean {
    return this.dashTimer > 0;
  }

  public update(
    dt: number,
    keys: { left: boolean; right: boolean },
    isGrounded: boolean,
    particles: ParticleManager
  ) {
    const vel = this.body.linvel();
    const pos = this.body.translation();

    // Invulnerability flashing
    if (this.isInvulnerable) {
      this.invulnTimer -= dt;
      if (this.invulnTimer <= 0) {
        this.isInvulnerable = false;
        this.mesh.visible = true;
      } else {
        // Toggle visibility every 0.05 seconds
        this.mesh.visible = Math.floor(this.invulnTimer * 20) % 2 === 0;
      }
    }

    // Cooldown reductions
    if (this.dashCooldownTimer > 0) {
      // Magnetic battery speeds up charge rate slightly
      const rate = 1.0 + (this.magnetRadius - 2.0) * 0.04;
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt * rate);
    }

    // Handle Dash State
    if (this.isDashing()) {
      this.dashTimer -= dt;
      // Force constant high horizontal speed, lock Y velocity during horizontal dash
      this.body.setLinvel(
        { x: this.baseSpeed * this.speedMult * 2.1, y: 0.0 },
        true
      );

      // Dash particles trail (bright cyan)
      if (Math.random() < 0.6) {
        particles.spawn(
          pos.x - 0.4,
          pos.y,
          0x00bfff,
          1,
          1.5,
          [0.03, 0.06],
          0.1
        );
      }

      if (this.dashTimer <= 0) {
        // Dash finished: restore normal colors and physical line thickness
        if (Array.isArray(this.meshOutline.material)) {
          // ignore
        } else if (this.meshOutline.material) {
          (this.meshOutline.material as THREE.LineBasicMaterial).color.setHex(
            0x00bfff
          );
        }
      }
    } else {
      // Normal movement Adjust
      let targetX = this.baseSpeed * this.speedMult;
      if (keys.left) {
        targetX *= 0.45; // brake
      } else if (keys.right) {
        targetX *= 1.35; // boost
      }

      // Smooth horizontal velocity adjust
      const dx = targetX - vel.x;
      this.body.setLinvel({ x: vel.x + dx * 0.15, y: vel.y }, true);

      // Run particles (bright magenta)
      if (isGrounded && Math.abs(vel.x) > 2) {
        if (Math.random() < 0.2) {
          particles.spawn(
            pos.x - 0.3,
            pos.y - 0.38,
            0xff007f,
            1,
            0.5,
            [0.04, 0.07],
            0.2
          );
        }
      }
    }

    // Double jump reset
    if (isGrounded && !this.isDashing()) {
      this.doubleJumpsUsed = 0;
    }

    // Sync three.js mesh positions
    this.mesh.position.set(pos.x, pos.y, 0);
  }

  public jump(isGrounded: boolean) {
    if (this.isDashing()) return;

    const vel = this.body.linvel();
    const impulse = this.baseJumpForce * this.jumpMult;

    if (isGrounded) {
      this.body.setLinvel({ x: vel.x, y: impulse }, true);
      Audio.playJump();
    } else if (this.doubleJumpsUsed < this.maxDoubleJumps) {
      this.doubleJumpsUsed++;
      // Set upwards velocity directly to make double-jump powerful in air
      this.body.setLinvel({ x: vel.x, y: impulse * 0.95 }, true);
      Audio.playDoubleJump();
    }
  }

  public slam(isGrounded: boolean) {
    if (this.isDashing() || isGrounded) return;

    // Apply high downward force
    const vel = this.body.linvel();
    this.body.setLinvel({ x: vel.x, y: -22 }, true);

    // Play quick wind sound or sweep
    Audio.playHit();

    // Setup slam shockwave flag to trigger on next ground hit
    (this as unknown as { slamActive: boolean }).slamActive = true;
  }

  public triggerSlamImpact(
    pos: RAPIER.Vector,
    particles: ParticleManager,
    entities: Entity[]
  ) {
    if (!(this as unknown as { slamActive: boolean }).slamActive) return;
    (this as unknown as { slamActive: boolean }).slamActive = false;

    // Slam dust wave (saturated yellow/gold)
    particles.spawn(pos.x, pos.y - 0.4, 0xffaa00, 20, 5, [0.02, 0.05], 0.3);

    // Destroy nearby floor hazards (like spikes) within 4 units
    entities.forEach((ent) => {
      if (ent.type === "spike" || ent.type === "bot") {
        const entPos = ent.mesh.position;
        const dist = Math.abs(entPos.x - pos.x);
        if (dist < 4.0 && Math.abs(entPos.y - pos.y) < 1.5) {
          ent.isDead = true; // Mark for cleanup
          particles.spawn(entPos.x, entPos.y, 0xff073a, 12, 4);
          Audio.playHit();
        }
      }
    });
  }

  public dash() {
    if (this.dashCooldownTimer > 0 || this.isDashing()) return;

    this.dashTimer = this.activeDashTime;
    this.dashCooldownTimer = this.dashCooldown;
    Audio.playDash();

    // Turn magenta during overdrive dash
    if (Array.isArray(this.meshOutline.material)) {
      // ignore
    } else if (this.meshOutline.material) {
      (this.meshOutline.material as THREE.LineBasicMaterial).color.setHex(
        0xff0066
      );
    }
  }

  public takeDamage(particles: ParticleManager) {
    if (this.isDashing() || this.isInvulnerable) return;

    this.shield--;
    this.isInvulnerable = true;
    this.invulnTimer = this.activeInvulnTime;

    const pos = this.body.translation();
    particles.spawn(pos.x, pos.y, 0xff073a, 15, 4, [0.03, 0.06], 0.6);
    Audio.playHit();

    // Screen shake trigger
    const crt = document.getElementById("crt-wrapper");
    if (crt) {
      crt.classList.add("shake-anim");
      window.setTimeout(() => {
        crt.classList.remove("shake-anim");
      }, 250);
    }
  }

  public destroy(world: RAPIER.World, scene: THREE.Scene) {
    world.removeRigidBody(this.body);
    scene.remove(this.mesh);
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          mat.forEach((m: THREE.Material) => m.dispose());
        } else if (mat instanceof THREE.Material) {
          mat.dispose();
        }
      }
    });
  }
}

// ==========================================
// 6. PROCEDURAL LEVEL GENERATOR
// ==========================================
class LevelGenerator {
  private world: RAPIER.World;
  private scene: THREE.Scene;
  private lastGeneratedX = 0;
  private chunkIndex = 0;
  private activePlatforms: RAPIER.RigidBody[] = [];

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
    this.lastGeneratedX = -10; // start early
  }

  public init() {
    this.lastGeneratedX = -10;
    this.chunkIndex = 0;
    this.activePlatforms = [];

    // Spawn starting flat area
    this.generateChunk(0, 0); // Flat Ground
    this.generateChunk(CHUNK_WIDTH, 0); // Flat Ground
    this.lastGeneratedX = CHUNK_WIDTH * 2;
    this.chunkIndex = 2;
  }

  public update(playerX: number, entities: Entity[], difficulty: number) {
    // Generate new chunks ahead
    if (playerX + 60 > this.lastGeneratedX) {
      this.generateChunk(this.lastGeneratedX, difficulty);
      this.lastGeneratedX += CHUNK_WIDTH;
      this.chunkIndex++;
    }

    // Clean up entities far behind
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i]!;
      if (ent.mesh.position.x < playerX - 30) {
        ent.destroy();
        entities.splice(i, 1);
      }
    }
  }

  private generateChunk(startX: number, difficulty: number) {
    // Every 10 chunks, spawn a glowing green Checkpoint gate
    if (this.chunkIndex > 0 && this.chunkIndex % 10 === 0) {
      this.spawnCheckpointChunk(startX);
      return;
    }

    // Otherwise, pick a random chunk template based on difficulty
    // High difficulty enables gaps, breakable walls, and aggressive drones
    const rand = Math.random();
    if (difficulty < 1.2) {
      if (rand < 0.6) {
        this.spawnFlatChunk(startX, false);
      } else {
        this.spawnFlatChunk(startX, true); // small spikes
      }
    } else if (difficulty < 1.8) {
      if (rand < 0.3) {
        this.spawnFlatChunk(startX, true);
      } else if (rand < 0.65) {
        this.spawnGappedChunk(startX);
      } else {
        this.spawnWallChunk(startX);
      }
    } else {
      // High difficulty
      if (rand < 0.25) {
        this.spawnGappedChunk(startX);
      } else if (rand < 0.5) {
        this.spawnWallChunk(startX);
      } else if (rand < 0.75) {
        this.spawnDroneGauntlet(startX);
      } else {
        this.spawnFlatChunk(startX, true);
      }
    }
  }

  // --- PLATFORM SPAWNING HELPER ---
  private createPlatform(
    x: number,
    y: number,
    w: number,
    h: number,
    color = 0x3a0ca3
  ): RAPIER.RigidBody {
    // Physics
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
      .setRestitution(0.0)
      .setFriction(0.1);
    this.world.createCollider(colDesc, body);
    this.activePlatforms.push(body);

    // Three.js visual
    const group = new THREE.Group();
    const geom = new THREE.BoxGeometry(w, h, 0.8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: false,
    });
    const box = new THREE.Mesh(geom, mat);
    group.add(box);

    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    const wire = new THREE.LineSegments(edges, lineMat);
    group.add(wire);

    group.position.set(x, y, 0);
    this.scene.add(group);

    // Wrap in entity so it can be cleaned up
    const entity: Entity = {
      type: "ground",
      body,
      mesh: group,
      isDead: false,
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(group);
        geom.dispose();
        mat.dispose();
        edges.dispose();
        lineMat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);

    return body;
  }

  // --- CHUNK TYPES ---

  // 1. Flat platform ground, optional spikes / coins
  private spawnFlatChunk(startX: number, spawnHazards: boolean) {
    this.createPlatform(startX + CHUNK_WIDTH / 2, -2.5, CHUNK_WIDTH, 4.0);

    if (spawnHazards) {
      // Spawn spikes randomly
      const spikeX = startX + 8 + Math.random() * 12;
      this.spawnSpike(spikeX, -0.2);

      // Coins over the spike
      this.spawnCoin(spikeX - 2, 1.5);
      this.spawnCoin(spikeX, 2.2);
      this.spawnCoin(spikeX + 2, 1.5);

      // Spawn drone
      if (Math.random() < 0.6) {
        this.spawnDrone(startX + 18, 3.2);
      }
    } else {
      // Just some coins
      for (let i = 0; i < 4; i++) {
        this.spawnCoin(startX + 8 + i * 4, 0.5);
      }
    }
  }

  // 2. Fragmented platforms with void pits
  private spawnGappedChunk(startX: number) {
    // 3 small floating platforms
    this.createPlatform(startX + 4, -2.5, 8.0, 4.0);
    this.createPlatform(startX + 15, -1.0, 6.0, 2.0, 0x3a0ca3);
    this.createPlatform(startX + 26, -2.5, 8.0, 4.0);

    // Coins floating in the gaps
    this.spawnCoin(startX + 9.5, 0.5);
    this.spawnCoin(startX + 20.5, 2.0);

    // Patrol bot on platform 1
    this.spawnBot(startX + 4, -0.2, 2.5);
  }

  // 3. Barriers that require Spacebar Dash to break
  private spawnWallChunk(startX: number) {
    this.createPlatform(startX + CHUNK_WIDTH / 2, -2.5, CHUNK_WIDTH, 4.0);

    // Pink breakable wall
    this.spawnBreakableWall(startX + 12, 1.2, 0.8, 3.4);

    // Coins behind the wall
    this.spawnCoin(startX + 16, 0.5);
    this.spawnCoin(startX + 19, 0.5);

    // Drone firing from behind
    this.spawnDrone(startX + 22, 3.0);
  }

  // 4. Multiple flying drones
  private spawnDroneGauntlet(startX: number) {
    this.createPlatform(startX + CHUNK_WIDTH / 2, -2.5, CHUNK_WIDTH, 4.0);

    this.spawnDrone(startX + 8, 2.8);
    this.spawnDrone(startX + 16, 3.8);
    this.spawnDrone(startX + 24, 2.2);

    // Double spike hazard
    this.spawnSpike(startX + 12, -0.2);
    this.spawnSpike(startX + 13, -0.2);
  }

  // 5. Checkpoint Chunk (glowing green flag/columns)
  private spawnCheckpointChunk(startX: number) {
    // Flat safe ground
    this.createPlatform(
      startX + CHUNK_WIDTH / 2,
      -2.5,
      CHUNK_WIDTH,
      4.0,
      0x1b4332
    );

    // Checkpoint gate at X = startX + 15
    const checkpointX = startX + 15;
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      checkpointX,
      1.5
    );
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.5, 3.5).setSensor(true);
    this.world.createCollider(colDesc, body);

    // Visuals: Glowing neon green frame
    const group = new THREE.Group();
    const colGeom = new THREE.BoxGeometry(0.3, 4.0, 0.2);
    const colMat = new THREE.MeshBasicMaterial({
      color: 0xd8f3dc,
      transparent: false,
    });
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x1b4332,
      linewidth: 2.5,
    });

    const postLeft = new THREE.Mesh(colGeom, colMat);
    postLeft.add(
      new THREE.LineSegments(new THREE.EdgesGeometry(colGeom), lineMat)
    );
    postLeft.position.set(-1.2, 0.0, 0);

    const postRight = new THREE.Mesh(colGeom, colMat);
    postRight.add(
      new THREE.LineSegments(new THREE.EdgesGeometry(colGeom), lineMat)
    );
    postRight.position.set(1.2, 0.0, 0);

    const bannerGeom = new THREE.BoxGeometry(2.7, 0.5, 0.2);
    const banner = new THREE.Mesh(bannerGeom, colMat);
    banner.add(
      new THREE.LineSegments(new THREE.EdgesGeometry(bannerGeom), lineMat)
    );
    banner.position.set(0.0, 1.8, 0);

    group.add(postLeft, postRight, banner);
    group.position.set(checkpointX, 1.5, 0);
    this.scene.add(group);

    const entity: Entity = {
      type: "checkpoint",
      body,
      mesh: group,
      isDead: false,
      onCollide: () => {
        // Handled in global trigger
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(group);
        colGeom.dispose();
        colMat.dispose();
        bannerGeom.dispose();
      },
    };

    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  // --- INDIVIDUAL HAZARDS & ENTITIES SPAWNING ---

  private spawnSpike(x: number, y: number) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.35).setSensor(true);
    this.world.createCollider(colDesc, body);

    // Cone geometry (pointy red neon spike with solid core and dark outline)
    const geom = new THREE.ConeGeometry(0.38, 0.76, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff073a,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x7a0010,
      linewidth: 2.5,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    mesh.add(wire);
    mesh.rotation.x = 0; // facing up
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);

    const entity: Entity = {
      type: "spike",
      body,
      mesh,
      isDead: false,
      onCollide: (player) => {
        player.takeDamage(particleManager);
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(mesh);
        geom.dispose();
        mat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  private spawnBreakableWall(x: number, y: number, w: number, h: number) {
    // Solid object that player can hit
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2).setRestitution(
      0.0
    );
    this.world.createCollider(colDesc, body);

    // Visuals: Pink neon box with diagonal cross
    const group = new THREE.Group();
    const geom = new THREE.BoxGeometry(w, h, 0.8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      transparent: false,
    });
    const box = new THREE.Mesh(geom, mat);
    group.add(box);

    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xc2005a,
      linewidth: 3,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    group.add(wire);

    group.position.set(x, y, 0);
    this.scene.add(group);

    const entity: Entity = {
      type: "breakable",
      body,
      mesh: group,
      isDead: false,
      w,
      h,
      onCollide: (player) => {
        if (player.isDashing()) {
          entity.isDead = true;
          particleManager.spawn(x, y, 0xff0055, 12, 4);
          Audio.playHit();
        }
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(group);
        geom.dispose();
        mat.dispose();
        edges.dispose();
        lineMat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  private spawnDrone(x: number, y: number) {
    // Kinematic Drone (moves dynamically via code)
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.38, 0.38).setSensor(true);
    this.world.createCollider(colDesc, body);

    // Octahedron wireframe (orange)
    const geom = new THREE.OctahedronGeometry(0.42);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xa87900,
      linewidth: 2.5,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    mesh.add(wire);
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);

    const startY = y;
    let shootTimer = Math.random() * 2.0;

    const entity: Entity = {
      type: "drone",
      body,
      mesh,
      isDead: false,
      update: (dt, time, playerPos) => {
        // Vertical hover animation
        const newY = startY + Math.sin(time * 3.5 + x) * 0.75;
        body.setNextKinematicTranslation({ x, y: newY });
        mesh.position.set(x, newY, 0);
        mesh.rotation.y += dt * 2.0;

        // Firing mechanism (difficulty affects fire rate)
        shootTimer -= dt;
        if (shootTimer <= 0) {
          const dx = playerPos.x - x;
          // Drone fires only when player is approaching from left
          if (dx < 0 && dx > -22) {
            this.fireDroneLaser(x - 0.5, newY, playerPos);
            shootTimer =
              3.5 - Math.min(1.8, difficultyIndex * 0.25) + Math.random() * 0.5;
          } else {
            shootTimer = 1.0;
          }
        }
      },
      onCollide: (player) => {
        if (player.isDashing()) {
          // Destroy drone!
          entity.isDead = true;
          particleManager.spawn(x, mesh.position.y, 0xffb703, 12, 4);
          Audio.playHit();
        } else {
          player.takeDamage(particleManager);
        }
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(mesh);
        geom.dispose();
        mat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  private fireDroneLaser(x: number, y: number, playerPos: THREE.Vector3) {
    // Sensor Laser
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setGravityScale(0);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.3, 0.08).setSensor(true);
    this.world.createCollider(colDesc, body);

    // Calculate angle towards player
    const dx = playerPos.x - x;
    const dy = playerPos.y - y;
    const angle = Math.atan2(dy, dx);
    const speed = 7.5 + difficultyIndex * 0.5;

    body.setLinvel(
      { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      true
    );

    // Visuals: Red glowing capsule
    const geom = new THREE.BoxGeometry(0.6, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff073a,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.z = angle;
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);

    const entity: Entity = {
      type: "projectile",
      body,
      mesh,
      isDead: false,
      update: (_dt) => {
        const pos = body.translation();
        mesh.position.set(pos.x, pos.y, 0);
      },
      onCollide: (player) => {
        player.takeDamage(particleManager);
        entity.isDead = true; // vanish projectile
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(mesh);
        geom.dispose();
        mat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  private spawnBot(x: number, y: number, patrolRange: number) {
    // Kinematic ground roller
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.35).setSensor(true);
    this.world.createCollider(colDesc, body);

    // Octahedron visual (yellow-green)
    const geom = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xa87900,
      linewidth: 2.5,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    mesh.add(wire);
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);

    const startX = x;
    let dir = 1;

    const entity: Entity = {
      type: "bot",
      body,
      mesh,
      isDead: false,
      update: (dt) => {
        const curPos = body.translation();
        let newX = curPos.x + dir * (2.8 + difficultyIndex * 0.2) * dt;

        // Turn around at range boundaries
        if (Math.abs(newX - startX) > patrolRange) {
          dir *= -1;
          newX = startX + dir * patrolRange;
        }

        body.setNextKinematicTranslation({ x: newX, y: curPos.y });
        mesh.position.set(newX, curPos.y, 0);
        mesh.rotation.z -= dir * dt * 4.0;
      },
      onCollide: (player) => {
        if (player.isDashing()) {
          entity.isDead = true;
          particleManager.spawn(x, mesh.position.y, 0xa87900, 12, 4);
          Audio.playHit();
        } else {
          player.takeDamage(particleManager);
        }
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(mesh);
        geom.dispose();
        mat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  private spawnCoin(x: number, y: number) {
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.22, 0.22).setSensor(true);
    this.world.createCollider(colDesc, body);

    // Glowing small yellow diamond
    const geom = new THREE.OctahedronGeometry(0.22);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xa87900,
      linewidth: 1.5,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    mesh.add(wire);
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);

    let isAttracted = false;

    const entity: Entity = {
      type: "coin",
      body,
      mesh,
      isDead: false,
      update: (dt, time, playerPos) => {
        mesh.rotation.y += dt * 3.0;

        // Magnet attraction code
        const coinPos = mesh.position;
        const dx = playerPos.x - coinPos.x;
        const dy = playerPos.y - coinPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (isAttracted || dist < activePlayer.magnetRadius) {
          isAttracted = true;
          // Fly to player
          const speed = 13.0;
          coinPos.x += (dx / dist) * speed * dt;
          coinPos.y += (dy / dist) * speed * dt;
          body.setNextKinematicTranslation({ x: coinPos.x, y: coinPos.y });
        } else {
          // Bob slightly
          mesh.position.y = y + Math.sin(time * 4.0 + x) * 0.15;
          body.setNextKinematicTranslation({ x, y: mesh.position.y });
        }
      },
      onCollide: () => {
        entity.isDead = true;
        totalCoins++;
        Audio.playCoin();
        particleManager.spawn(
          mesh.position.x,
          mesh.position.y,
          0xffd700,
          8,
          3,
          [0.03, 0.05],
          0.0
        );
      },
      destroy: () => {
        this.world.removeRigidBody(body);
        this.scene.remove(mesh);
        geom.dispose();
        mat.dispose();
      },
    };
    bodyToEntityMap.set(body.handle, entity);
    activeGameEntities.push(entity);
  }

  public clearAll() {
    this.activePlatforms = [];
  }
}

// ==========================================
// 7. MAIN GAME STATE & ENGINE SETUP
// ==========================================
let activePlayer: Player;
let physicsWorld: RAPIER.World;
let activeGameEntities: Entity[] = [];
let levelGen: LevelGenerator;
let particleManager: ParticleManager;

// Game variables
let gameScore = 0;
let totalCoins = 0;
let checkpointsCleared = 0;
let difficultyIndex = 1.0;
let lastCheckpointDistance = 0;

type GameState = "MENU" | "PLAYING" | "COUNTDOWN" | "UPGRADE" | "GAMEOVER";
let currentGameState: GameState = "MENU";

// Controls keyboard map
const keysPressed = { left: false, right: false };

// Three.js Core
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let sunMesh: THREE.Mesh;
let gridHelper: THREE.GridHelper;
let gridHelperBack: THREE.GridHelper;

// Animation & Tick timers
let lastFrameTime = 0;
let countdownTimer = 0.0;
let countdownNumber = 3;
let systemReady = false;

// Upgrades selection
let selectedUpgradeOptions: UpgradeOption[] = [];

// Initialize Rapier WASM compat wrapper
RAPIER.init()
  .then(() => {
    systemReady = true;
    initEngine();
    console.log("Rapier2D System Loaded successfully!");
  })
  .catch((err: unknown) => {
    console.error("Failed to initialize Rapier2D physics WASM", err);
  });

function initEngine() {
  const canvasElement = document.getElementById("canvas") as HTMLCanvasElement;
  if (!canvasElement) return;

  // 1. Three.js Scene Setup
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xf1f3f7, 0.03);
  scene.background = new THREE.Color(0xf1f3f7);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(0, 2.5, 12.0); // Side scroll perspective

  renderer = new THREE.WebGLRenderer({
    canvas: canvasElement,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Bright, flat retro light settings
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // 2. Parallax Synthwave Background Visuals
  // Giant retro-pop sun with solid outline
  const sunGeom = new THREE.CircleGeometry(5.0, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xff8da1,
    side: THREE.DoubleSide,
  });
  sunMesh = new THREE.Mesh(sunGeom, sunMat);
  const sunEdges = new THREE.EdgesGeometry(sunGeom);
  const sunLineMat = new THREE.LineBasicMaterial({
    color: 0xc2005a,
    linewidth: 2.5,
  });
  const sunWire = new THREE.LineSegments(sunEdges, sunLineMat);
  sunMesh.add(sunWire);
  sunMesh.position.set(0, 5.0, -18.0);
  scene.add(sunMesh);

  // Infinite bottom floor grid
  gridHelper = new THREE.GridHelper(300, 75, 0xe2e5ed, 0xe2e5ed);
  gridHelper.position.set(0, -4.5, 0);
  scene.add(gridHelper);

  // Infinite back wall grid
  gridHelperBack = new THREE.GridHelper(300, 75, 0xe2e5ed, 0xe2e5ed);
  gridHelperBack.position.set(0, 10, -20);
  gridHelperBack.rotation.x = Math.PI / 2;
  scene.add(gridHelperBack);

  // 3. Initialize managers
  physicsWorld = new RAPIER.World({ x: 0.0, y: -34.0 });
  levelGen = new LevelGenerator(physicsWorld, scene);
  particleManager = new ParticleManager(scene);

  // Setup DOM Event handlers
  window.addEventListener("resize", onWindowResize);
  setupControlsListeners();

  // Setup HTML Button click callbacks
  const btnStart = document.getElementById("btn-start");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      Audio.init(); // triggers AudioContext on interaction
      startGame();
    });
  }

  const btnRestart = document.getElementById("btn-restart");
  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      Audio.init();
      resetGame();
      startGame();
    });
  }

  // Start continuous frame tick
  requestAnimationFrame(tick);
}

// ==========================================
// 8. GAME CONTROL LOOPS & EVENT HANDLERS
// ==========================================
function startGame() {
  const menuScreen = document.getElementById("screen-menu");
  if (menuScreen) menuScreen.classList.add("hidden");

  const hudOverlay = document.getElementById("hud");
  if (hudOverlay) hudOverlay.classList.remove("hidden");

  const reminder = document.getElementById("controls-reminder");
  if (reminder) reminder.classList.remove("hidden");

  // Setup player
  activePlayer = new Player(physicsWorld, scene, 0.0, 2.5);

  // Initialize procedurally generated grid
  levelGen.init();

  // Reset variables
  gameScore = 0;
  totalCoins = 0;
  checkpointsCleared = 0;
  difficultyIndex = 1.0;
  lastCheckpointDistance = 0;

  // Start with a countdown freeze
  triggerCountdown();
}

function triggerCountdown() {
  currentGameState = "COUNTDOWN";
  countdownTimer = 0.8;
  countdownNumber = 3;

  const countOverlay = document.getElementById("countdown-overlay");
  const countText = document.getElementById("countdown-text");

  if (countOverlay && countText) {
    countText.innerText = "3";
    countOverlay.classList.remove("hidden");
  }
}

function updateCountdown(dt: number) {
  countdownTimer -= dt;
  if (countdownTimer <= 0) {
    countdownNumber--;
    countdownTimer = 0.8;

    const countText = document.getElementById("countdown-text");
    if (countText) {
      if (countdownNumber === 0) {
        countText.innerText = "GO!";
      } else if (countdownNumber < 0) {
        // End countdown, start run
        const countOverlay = document.getElementById("countdown-overlay");
        if (countOverlay) countOverlay.classList.add("hidden");
        currentGameState = "PLAYING";
      } else {
        countText.innerText = countdownNumber.toString();
      }
    }
  }
}

function handleUpgradeSelected(upgrade: UpgradeOption) {
  upgrade.effect(activePlayer);
  Audio.playUpgrade();

  // Close upgrade panel
  const upgradeScreen = document.getElementById("screen-upgrade");
  if (upgradeScreen) upgradeScreen.classList.add("hidden");

  // Resume game with countdown
  triggerCountdown();
}

function triggerCheckpoint() {
  currentGameState = "UPGRADE";
  checkpointsCleared++;
  lastCheckpointDistance = activePlayer.getX();

  // Heal 1 HP automatically on checkpoint clear
  activePlayer.shield = Math.min(
    activePlayer.shieldMax,
    activePlayer.shield + 1
  );

  // Randomly select 3 unique upgrades from the pool
  const shuffled = [...UPGRADES_POOL].sort(() => 0.5 - Math.random());
  selectedUpgradeOptions = shuffled.slice(0, 3);

  // Render cards in modal
  const container = document.getElementById("upgrade-options");
  if (container) {
    container.innerHTML = "";
    selectedUpgradeOptions.forEach((up, idx) => {
      const card = document.createElement("div");
      card.className = "upgrade-card";
      card.id = `upgrade-card-${idx}`;
      card.innerHTML = `
        <div class="upgrade-icon">${up.icon}</div>
        <div class="upgrade-name">${up.name}</div>
        <div class="upgrade-desc">${up.desc}</div>
        <div class="upgrade-stat-diff">${up.diffText}</div>
      `;
      card.addEventListener("click", () => handleUpgradeSelected(up));
      container.appendChild(card);
    });
  }

  // Set values in upgrade HUD sheet
  const statSpd = document.getElementById("stat-speed");
  const statJmp = document.getElementById("stat-jump");
  const statAgl = document.getElementById("stat-agility");
  const statShd = document.getElementById("stat-shield");
  const statMag = document.getElementById("stat-magnet");

  if (statSpd) statSpd.innerText = (10.0 * activePlayer.speedMult).toFixed(1);
  if (statJmp) statJmp.innerText = (13.5 * activePlayer.jumpMult).toFixed(1);
  if (statAgl) statAgl.innerText = `${activePlayer.dashCooldown.toFixed(1)}s`;
  if (statShd)
    statShd.innerText = `${activePlayer.shield} / ${activePlayer.shieldMax}`;
  if (statMag) statMag.innerText = `${activePlayer.magnetRadius.toFixed(1)}m`;

  Audio.playCheckpoint();

  // Show panel
  const upgradeScreen = document.getElementById("screen-upgrade");
  if (upgradeScreen) upgradeScreen.classList.remove("hidden");
}

function triggerGameOver() {
  currentGameState = "GAMEOVER";
  Audio.playGameOver();

  // Populate gameover metrics
  const finalDist = document.getElementById("final-distance");
  const finalCoins = document.getElementById("final-coins");
  const finalChecks = document.getElementById("final-checkpoints");
  const finalDiff = document.getElementById("final-difficulty");

  if (finalDist) finalDist.innerText = `${gameScore}m`;
  if (finalCoins) finalCoins.innerText = totalCoins.toString();
  if (finalChecks) finalChecks.innerText = checkpointsCleared.toString();
  if (finalDiff) finalDiff.innerText = `${difficultyIndex.toFixed(2)}x`;

  // Hide elements
  const hudOverlay = document.getElementById("hud");
  if (hudOverlay) hudOverlay.classList.add("hidden");

  const reminder = document.getElementById("controls-reminder");
  if (reminder) reminder.classList.add("hidden");

  // Show Gameover screen
  const gameoverScreen = document.getElementById("screen-gameover");
  if (gameoverScreen) gameoverScreen.classList.remove("hidden");
}

function resetGame() {
  // Clear entities
  activeGameEntities.forEach((ent) => ent.destroy());
  activeGameEntities = [];
  bodyToEntityMap.clear();

  if (activePlayer) {
    activePlayer.destroy(physicsWorld, scene);
  }

  levelGen.clearAll();
  particleManager.clear();

  // Hide screens
  const gameoverScreen = document.getElementById("screen-gameover");
  if (gameoverScreen) gameoverScreen.classList.add("hidden");

  const upgradeScreen = document.getElementById("screen-upgrade");
  if (upgradeScreen) upgradeScreen.classList.add("hidden");
}

// Keyboard input actions
function setupControlsListeners() {
  window.addEventListener("keydown", (e) => {
    if (currentGameState !== "PLAYING") return;

    if (e.code === "Space") {
      activePlayer.dash();
      e.preventDefault();
    }

    if (e.code === "KeyW" || e.code === "ArrowUp") {
      const grounded = checkPlayerGrounded();
      activePlayer.jump(grounded);
      e.preventDefault();
    }

    if (e.code === "KeyS" || e.code === "ArrowDown") {
      const grounded = checkPlayerGrounded();
      activePlayer.slam(grounded);
      e.preventDefault();
    }

    if (e.code === "KeyA" || e.code === "ArrowLeft") {
      keysPressed.left = true;
    }
    if (e.code === "KeyD" || e.code === "ArrowRight") {
      keysPressed.right = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyA" || e.code === "ArrowLeft") {
      keysPressed.left = false;
    }
    if (e.code === "KeyD" || e.code === "ArrowRight") {
      keysPressed.right = false;
    }
  });
}

function checkPlayerGrounded(): boolean {
  if (!activePlayer) return false;
  const pos = activePlayer.body.translation();

  // Cast a ray just slightly below the player's bottom edge (width 0.38, height 0.38)
  const ray = new RAPIER.Ray({ x: pos.x, y: pos.y - 0.39 }, { x: 0, y: -1 });
  const maxToi = 0.08;
  const hit = physicsWorld.castRay(
    ray,
    maxToi,
    true,
    undefined,
    undefined,
    undefined,
    activePlayer.body
  );

  return hit !== null;
}

function updateHUD() {
  const hudCoins = document.getElementById("hud-coins");
  const hudDist = document.getElementById("hud-distance");
  const hudShield = document.getElementById("hud-shield");
  const hudEnergyFill = document.getElementById("hud-energy-fill");

  if (hudCoins) hudCoins.innerText = totalCoins.toString().padStart(3, "0");
  if (hudDist) hudDist.innerText = `${gameScore}m`;

  if (hudShield && activePlayer) {
    hudShield.innerHTML = "";
    for (let i = 0; i < activePlayer.shieldMax; i++) {
      const cell = document.createElement("div");
      cell.className =
        i < activePlayer.shield ? "shield-cell" : "shield-cell empty";
      hudShield.appendChild(cell);
    }
  }

  if (hudEnergyFill && activePlayer) {
    if (activePlayer.dashCooldownTimer <= 0) {
      hudEnergyFill.style.width = "100%";
      hudEnergyFill.classList.add("ready");
    } else {
      const progress =
        (1.0 - activePlayer.dashCooldownTimer / activePlayer.dashCooldown) *
        100;
      hudEnergyFill.style.width = `${progress}%`;
      hudEnergyFill.classList.remove("ready");
    }
  }
}

// Window resizing
function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 9. GAME RUNNING TICK LOOP
// ==========================================
function tick(timestamp: number) {
  requestAnimationFrame(tick);

  if (!systemReady) return;

  if (lastFrameTime === 0) {
    lastFrameTime = timestamp;
    return;
  }

  // Calculate delta time
  let dt = (timestamp - lastFrameTime) / 1000.0;
  lastFrameTime = timestamp;

  // Clamp dt to avoid massive physics jumps on frame drops
  if (dt > 0.1) dt = 0.1;

  const time = timestamp * 0.001;

  if (currentGameState === "PLAYING") {
    // 1. Progress Physics World
    const isGrounded = checkPlayerGrounded();

    // Check if player has slammed onto the ground
    if (isGrounded) {
      activePlayer.triggerSlamImpact(
        activePlayer.body.translation(),
        particleManager,
        activeGameEntities
      );
    }

    physicsWorld.step();

    // 2. Update entities & players
    activePlayer.update(dt, keysPressed, isGrounded, particleManager);

    const pPos = new THREE.Vector3(activePlayer.getX(), activePlayer.getY(), 0);

    // Update obstacles and hazards
    for (let i = activeGameEntities.length - 1; i >= 0; i--) {
      const ent = activeGameEntities[i]!;
      if (ent.isDead) {
        ent.destroy();
        activeGameEntities.splice(i, 1);
        continue;
      }
      if (ent.update) {
        ent.update(dt, time, pPos);
      }
    }

    // 3. Collision processing
    processCollisions();

    // 4. Update score & difficulty based on player run
    const currentDist = Math.max(0, Math.floor(activePlayer.getX()));
    gameScore = currentDist;
    difficultyIndex = 1.0 + currentDist / 380.0;

    // Trigger Checkpoint every 300 meters
    if (
      currentDist > 0 &&
      currentDist % 300 === 0 &&
      currentDist > lastCheckpointDistance + 10
    ) {
      triggerCheckpoint();
    }

    // Spawn chunk updates
    levelGen.update(activePlayer.getX(), activeGameEntities, difficultyIndex);

    // 5. Game Over triggers (HP depleted or fell into void pit)
    if (activePlayer.shield <= 0 || activePlayer.getY() < -7.0) {
      triggerGameOver();
    }

    updateHUD();
  } else if (currentGameState === "COUNTDOWN") {
    updateCountdown(dt);
  }

  // Update particles (runs regardless of state for menu trails / explosions)
  particleManager.update(dt);

  // 6. Camera smooth follow player
  if (
    activePlayer &&
    (currentGameState === "PLAYING" ||
      currentGameState === "UPGRADE" ||
      currentGameState === "COUNTDOWN")
  ) {
    const pX = activePlayer.getX();
    const pY = activePlayer.getY();
    // Offset camera slightly in front of character (look ahead) and above ground
    const targetCamX = pX + 3.8;
    const targetCamY = THREE.MathUtils.clamp(pY + 1.2, 1.5, 4.5);

    camera.position.x += (targetCamX - camera.position.x) * 0.08;
    camera.position.y += (targetCamY - camera.position.y) * 0.08;

    // Slide grid floors to center under the camera dynamically
    gridHelper.position.x = Math.floor(camera.position.x / 4) * 4;
    gridHelperBack.position.x = Math.floor(camera.position.x / 4) * 4;

    // Make giant sun follow player (slow parallax)
    sunMesh.position.x = camera.position.x * 0.9 + 12;
  }

  // 7. Render scene
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Check contact sensors overlap
function processCollisions() {
  if (!activePlayer) return;

  // In Rapier2D, we can query contacts or search active intersections
  // Since we have a low number of active entities in scope, we can check overlap manually
  // or read contact pairings. Checking distances between active player and sensor colliders
  // is extremely robust, performant, and avoids unstable contact callback triggers.
  const pX = activePlayer.getX();
  const pY = activePlayer.getY();

  activeGameEntities.forEach((ent) => {
    if (ent.isDead || !ent.body) return;
    const entPos = ent.body.translation();

    // Check collision overlap radius based on type
    const dx = entPos.x - pX;
    const dy = entPos.y - pY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (ent.type === "coin" && dist < 0.65) {
      ent.onCollide?.(activePlayer);
    } else if (ent.type === "spike" && dist < 0.68) {
      ent.onCollide?.(activePlayer);
    } else if (ent.type === "projectile" && dist < 0.58) {
      ent.onCollide?.(activePlayer);
    } else if (ent.type === "drone" && dist < 0.85) {
      ent.onCollide?.(activePlayer);
    } else if (ent.type === "bot" && dist < 0.78) {
      ent.onCollide?.(activePlayer);
    } else if (ent.type === "breakable") {
      // Solid collision AABB overlap check with a generous buffer
      const halfW = ent.w ? ent.w / 2 : 0.4;
      const halfH = ent.h ? ent.h / 2 : 1.7;
      const playerHalfW = 0.38;
      const playerHalfH = 0.38;
      const overlapX = Math.abs(pX - entPos.x) <= halfW + playerHalfW + 0.3;
      const overlapY = Math.abs(pY - entPos.y) <= halfH + playerHalfH + 0.3;

      if (overlapX && overlapY && activePlayer.isDashing()) {
        ent.isDead = true;
        particleManager.spawn(entPos.x, entPos.y, 0xc2005a, 22, 6);
        Audio.playHit();
      }
    }
  });
}
