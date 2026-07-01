import * as THREE from "three";
import RAPIER from "@dimforge/rapier2d-compat";

// ==========================================
// 1. AUDIO SYNTHESIZER
// ==========================================
class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.3;

  constructor() {}

  private init() {
    if (this.ctx) return;
    try {
      const WebkitAudioContext = (
        window as Window & { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext;
      this.ctx = new (window.AudioContext || WebkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  setVolume(vol: number) {
    this.volume = vol;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    endFreq?: number
  ) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        endFreq,
        this.ctx.currentTime + duration
      );
    }

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.ctx.currentTime + duration
    );

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(
    duration: number,
    lowPassFreq?: number,
    highPassFreq?: number
  ) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (data) {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.ctx.currentTime + duration
    );

    let lastNode: AudioNode = noise;

    if (lowPassFreq !== undefined || highPassFreq !== undefined) {
      const filter = this.ctx.createBiquadFilter();
      if (lowPassFreq !== undefined && highPassFreq !== undefined) {
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(
          (lowPassFreq + highPassFreq) / 2,
          this.ctx.currentTime
        );
        filter.Q.setValueAtTime(2.0, this.ctx.currentTime);
      } else if (lowPassFreq !== undefined) {
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(lowPassFreq, this.ctx.currentTime);
      } else {
        filter.type = "highpass";
        filter.frequency.setValueAtTime(highPassFreq!, this.ctx.currentTime);
      }
      lastNode.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  playMove() {
    this.playTone(90, "triangle", 0.08, 45);
  }

  playSlash() {
    this.playNoise(0.12, undefined, 800);
  }

  playShoot() {
    this.playTone(850, "sawtooth", 0.14, 120);
  }

  playBlock() {
    this.playTone(1100, "sine", 0.08, 850);
  }

  playPerfectBlock() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const playChime = (time: number, freq: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.25);
    };
    playChime(now, 523.25);
    playChime(now + 0.04, 659.25);
    playChime(now + 0.08, 783.99);
    playChime(now + 0.12, 1046.5);
  }

  playDrink() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const playBubble = (time: number, freq: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, time + 0.07);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.07);
    };
    playBubble(now, 320);
    playBubble(now + 0.07, 480);
    playBubble(now + 0.14, 640);
    playBubble(now + 0.21, 960);
  }

  playPickup() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const playNote = (time: number, freq: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.12);
    };
    playNote(now, 261.63);
    playNote(now + 0.05, 329.63);
    playNote(now + 0.1, 392.0);
    playNote(now + 0.15, 523.25);
  }

  playChest() {
    this.playTone(160, "triangle", 0.18, 90);
    setTimeout(() => this.playPickup(), 180);
  }

  playDoorLock() {
    this.playTone(110, "sawtooth", 0.22, 35);
    this.playNoise(0.22, 180);
  }

  playDoorUnlock() {
    this.playTone(180, "triangle", 0.25, 280);
    this.playNoise(0.18, 350);
  }

  playHurt() {
    this.playTone(160, "sawtooth", 0.12, 50);
    this.playNoise(0.12, 250);
  }

  playEnemyHurt() {
    this.playTone(200, "square", 0.08, 90);
    this.playNoise(0.08, 450);
  }

  playDeath() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const playSadNote = (time: number, freq: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.22);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.22);
    };
    playSadNote(now, 392.0);
    playSadNote(now + 0.12, 349.23);
    playSadNote(now + 0.24, 311.13);
    playSadNote(now + 0.36, 246.94);
    this.playNoise(0.5, 180);
  }

  playRoomClear() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const playNote = (time: number, freq: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.2);
    };
    playNote(now, 523.25);
    playNote(now + 0.06, 659.25);
    playNote(now + 0.12, 783.99);
    playNote(now + 0.18, 1046.5);
    playNote(now + 0.24, 783.99);
    playNote(now + 0.3, 1046.5);
  }
}

const audio = new AudioSynthesizer();

// ==========================================
// 2. ITEMS DATABASE
// ==========================================
interface WeaponData {
  id: string;
  name: string;
  power: number;
  damage: number;
  cooldown: number;
  range: number;
  knockback: number;
  isRanged: boolean;
  projectileType?: "arrow" | "fireball" | "lightning" | "holybeam";
  color: number;
  emoji: string;
  description: string;
  lifesteal?: number;
}

interface ShieldData {
  id: string;
  name: string;
  power: number;
  blockRate: number;
  speedPenalty: number;
  perfectEffect?: "timewarp" | "absorption" | "mirror" | "dragon";
  color: number;
  emoji: string;
  description: string;
}

interface PotionData {
  id: string;
  name: string;
  power: number;
  effect:
    | "heal"
    | "strength"
    | "toughness"
    | "speed"
    | "invisibility"
    | "invincibility"
    | "elixir";
  amount: number;
  duration: number;
  color: number;
  emoji: string;
  description: string;
}

const WEAPONS: Record<string, WeaponData> = {
  dagger: {
    id: "dagger",
    name: "Rusty Dagger",
    power: 1,
    damage: 9,
    cooldown: 0.22,
    range: 1.8,
    knockback: 1.5,
    isRanged: false,
    color: 0x808080,
    emoji: "🔪",
    description: "Fast, short-range thrusts.",
  },
  sword: {
    id: "sword",
    name: "Basic Sword",
    power: 1,
    damage: 15,
    cooldown: 0.32,
    range: 2.5,
    knockback: 3.5,
    isRanged: false,
    color: 0xb0c4de,
    emoji: "⚔️",
    description: "Balanced, reliable steel sword.",
  },
  mace: {
    id: "mace",
    name: "Heavy Mace",
    power: 2,
    damage: 26,
    cooldown: 0.58,
    range: 2.3,
    knockback: 10.0,
    isRanged: false,
    color: 0x4f4f4f,
    emoji: "🔨",
    description: "Slow, heavy swings with high knockback.",
  },
  firestaff: {
    id: "firestaff",
    name: "Flame Staff",
    power: 2,
    damage: 20,
    cooldown: 0.5,
    range: 10.0,
    knockback: 2.0,
    isRanged: true,
    projectileType: "fireball",
    color: 0xff4500,
    emoji: "🪄",
    description: "Shoots slow, explosive fireballs.",
  },
  greatsword: {
    id: "greatsword",
    name: "Iron Greatsword",
    power: 3,
    damage: 38,
    cooldown: 0.68,
    range: 3.4,
    knockback: 6.0,
    isRanged: false,
    color: 0x778899,
    emoji: "🗡️",
    description: "Massive range and raw cutting damage.",
  },
  icebow: {
    id: "icebow",
    name: "Ice Crystal Bow",
    power: 3,
    damage: 16,
    cooldown: 0.38,
    range: 12.0,
    knockback: 1.0,
    isRanged: true,
    projectileType: "arrow",
    color: 0x00ffff,
    emoji: "🏹",
    description: "Fires frost arrows that freeze and slow enemies.",
  },
  lightningwand: {
    id: "lightningwand",
    name: "Lightning Wand",
    power: 4,
    damage: 32,
    cooldown: 0.28,
    range: 14.0,
    knockback: 1.5,
    isRanged: true,
    projectileType: "lightning",
    color: 0xda70d6,
    emoji: "⚡",
    description: "Shoots high-speed piercing energy spikes.",
  },
  excalibur: {
    id: "excalibur",
    name: "Holy Excalibur",
    power: 4,
    damage: 46,
    cooldown: 0.45,
    range: 3.2,
    knockback: 5.0,
    isRanged: false,
    color: 0xffd700,
    emoji: "👑",
    description: "Legendary sword. Shoots holy beams and heals on hits.",
    lifesteal: 3,
  },
};

const SHIELDS: Record<string, ShieldData> = {
  buckler: {
    id: "buckler",
    name: "Bronze Buckler",
    power: 1,
    blockRate: 0.4,
    speedPenalty: 0.05,
    color: 0xcd7f32,
    emoji: "🛡️",
    description: "Lightweight, basic shield.",
  },
  wooden: {
    id: "wooden",
    name: "Wooden Kite Shield",
    power: 1,
    blockRate: 0.55,
    speedPenalty: 0.1,
    color: 0x8b4513,
    emoji: "🪵",
    description: "Standard reinforced wood shield.",
  },
  iron: {
    id: "iron",
    name: "Heavy Iron Shield",
    power: 2,
    blockRate: 0.75,
    speedPenalty: 0.2,
    color: 0x708090,
    emoji: "⚙️",
    description: "High defense, but slows movement when held.",
  },
  spiked: {
    id: "spiked",
    name: "Barbed Spiked Shield",
    power: 2,
    blockRate: 0.6,
    speedPenalty: 0.12,
    color: 0x556b2f,
    emoji: "🦔",
    description: "Reflects 35% of blocked damage to the attacker.",
  },
  timewarp: {
    id: "timewarp",
    name: "Chronos Buckler",
    power: 3,
    blockRate: 0.65,
    speedPenalty: 0.08,
    perfectEffect: "timewarp",
    color: 0x4169e1,
    emoji: "🌀",
    description: "Perfect block slows down time for 1.5 seconds.",
  },
  absorption: {
    id: "absorption",
    name: "Solar Aegis",
    power: 3,
    blockRate: 0.7,
    speedPenalty: 0.15,
    perfectEffect: "absorption",
    color: 0xff8c00,
    emoji: "☀️",
    description: "Perfect block converts blocked damage into health.",
  },
  mirror: {
    id: "mirror",
    name: "Reflective Glass Shield",
    power: 4,
    blockRate: 0.8,
    speedPenalty: 0.1,
    perfectEffect: "mirror",
    color: 0x00f5ff,
    emoji: "🪞",
    description: "Perfect block reflects enemy projectiles back at them.",
  },
  dragon: {
    id: "dragon",
    name: "Dragonscale Aegis",
    power: 4,
    blockRate: 1.0,
    speedPenalty: 0.25,
    perfectEffect: "dragon",
    color: 0x8b0000,
    emoji: "🐉",
    description: "100% block. Emits a flame burst around you on block.",
  },
};

const POTIONS: Record<string, PotionData> = {
  minor_health: {
    id: "minor_health",
    name: "Minor Healing Potion",
    power: 1,
    effect: "heal",
    amount: 30,
    duration: 0,
    color: 0xff2e63,
    emoji: "🔴",
    description: "Instantly restores 30 Health.",
  },
  major_health: {
    id: "major_health",
    name: "Major Healing Potion",
    power: 2,
    effect: "heal",
    amount: 65,
    duration: 0,
    color: 0x990000,
    emoji: "🍷",
    description: "Instantly restores 65 Health.",
  },
  strength: {
    id: "strength",
    name: "Potion of Might",
    power: 2,
    effect: "strength",
    amount: 1.5,
    duration: 15,
    color: 0x8a2be2,
    emoji: "🟣",
    description: "Increases attack damage by 50% for 15 seconds.",
  },
  toughness: {
    id: "toughness",
    name: "Potion of Iron Bark",
    power: 3,
    effect: "toughness",
    amount: 0.5,
    duration: 15,
    color: 0x0000ff,
    emoji: "🔵",
    description: "Halves all incoming damage for 15 seconds.",
  },
  speed: {
    id: "speed",
    name: "Potion of Swiftness",
    power: 3,
    effect: "speed",
    amount: 1.4,
    duration: 15,
    color: 0x00ff00,
    emoji: "🟢",
    description: "Increases movement speed by 40% for 15 seconds.",
  },
  invisibility: {
    id: "invisibility",
    name: "Potion of Shadows",
    power: 4,
    effect: "invisibility",
    amount: 0,
    duration: 10,
    color: 0xdddddd,
    emoji: "⚪",
    description: "Enemies cannot target or see you for 10 seconds.",
  },
  invincibility: {
    id: "invincibility",
    name: "Gilded Potion of Immunity",
    power: 4,
    effect: "invincibility",
    amount: 0,
    duration: 8,
    color: 0xffff00,
    emoji: "🟡",
    description: "Makes you immune to all damage for 8 seconds.",
  },
  elixir: {
    id: "elixir",
    name: "Elixir of Life",
    power: 4,
    effect: "elixir",
    amount: 100,
    duration: 30,
    color: 0x00ffff,
    emoji: "🔮",
    description: "Restores full health + grants 50 Temporary Shield HP.",
  },
};

// ==========================================
// 3. LOW-POLY MESH CREATION HELPERS
// ==========================================

function createLimbMesh(color: number, size = 0.25): THREE.Mesh {
  const geo = new THREE.SphereGeometry(size, 4, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.7,
    metalness: 0.1,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createWeaponMesh(type: string): THREE.Group {
  const group = new THREE.Group();
  const data = WEAPONS[type];
  if (!data) return group;

  const color = data.color;

  if (
    type === "dagger" ||
    type === "sword" ||
    type === "greatsword" ||
    type === "excalibur"
  ) {
    const bladeW =
      type === "dagger"
        ? 0.08
        : type === "sword"
          ? 0.12
          : type === "greatsword"
            ? 0.18
            : 0.15;
    const bladeH =
      type === "dagger"
        ? 0.8
        : type === "sword"
          ? 1.5
          : type === "greatsword"
            ? 2.3
            : 1.9;
    const bladeGeo = new THREE.BoxGeometry(bladeW, bladeH, 0.05);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: type === "excalibur" ? 0xffea88 : color,
      roughness: 0.3,
      metalness: 0.8,
      flatShading: true,
      emissive: type === "excalibur" ? 0xffd700 : 0x000000,
      emissiveIntensity: type === "excalibur" ? 0.5 : 0,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = bladeH / 2 + 0.15;
    blade.castShadow = true;
    group.add(blade);

    const guardW =
      type === "dagger"
        ? 0.25
        : type === "sword"
          ? 0.45
          : type === "greatsword"
            ? 0.7
            : 0.6;
    const guardGeo = new THREE.BoxGeometry(guardW, 0.08, 0.08);
    const guardMat = new THREE.MeshStandardMaterial({
      color: type === "excalibur" ? 0xcc9900 : 0x5a4a3a,
      roughness: 0.5,
      metalness: 0.6,
      flatShading: true,
    });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.y = 0.15;
    guard.castShadow = true;
    group.add(guard);

    const handleH =
      type === "dagger"
        ? 0.25
        : type === "sword"
          ? 0.35
          : type === "greatsword"
            ? 0.55
            : 0.45;
    const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, handleH, 4);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
      flatShading: true,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -handleH / 2 + 0.15;
    handle.castShadow = true;
    group.add(handle);
  } else if (type === "mace") {
    const handleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 4);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x423225,
      roughness: 0.9,
      flatShading: true,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = 0.5;
    handle.castShadow = true;
    group.add(handle);

    const headGeo = new THREE.SphereGeometry(0.3, 5, 5);
    const headMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.4,
      metalness: 0.8,
      flatShading: true,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.35;
    head.castShadow = true;
    group.add(head);

    for (let i = 0; i < 6; i++) {
      const spikeGeo = new THREE.ConeGeometry(0.08, 0.25, 4);
      const spike = new THREE.Mesh(spikeGeo, headMat);
      spike.position.y = 1.35;
      const angle = (i / 6) * Math.PI * 2;
      spike.position.x = Math.cos(angle) * 0.25;
      spike.position.z = Math.sin(angle) * 0.25;
      spike.rotation.z = angle - Math.PI / 2;
      spike.castShadow = true;
      group.add(spike);
    }
  } else if (type === "firestaff" || type === "lightningwand") {
    const handleH = type === "firestaff" ? 1.8 : 1.1;
    const handleGeo = new THREE.CylinderGeometry(0.05, 0.05, handleH, 4);
    const handleMat = new THREE.MeshStandardMaterial({
      color: type === "firestaff" ? 0x8b4513 : 0x4b0082,
      roughness: 0.8,
      flatShading: true,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = handleH / 2;
    handle.castShadow = true;
    group.add(handle);

    const gemGeo = new THREE.DodecahedronGeometry(
      type === "firestaff" ? 0.25 : 0.15
    );
    const gemMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.1,
      metalness: 0.1,
      flatShading: true,
      emissive: color,
      emissiveIntensity: 0.8,
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.y = handleH + 0.1;
    gem.castShadow = true;
    group.add(gem);
  } else if (type === "icebow") {
    const archGeo = new THREE.TorusGeometry(0.6, 0.05, 4, 8, Math.PI);
    const archMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.2,
      metalness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.8,
      emissive: 0x00ffff,
      emissiveIntensity: 0.3,
    });
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.rotation.z = -Math.PI / 2;
    arch.position.y = 0.5;
    arch.castShadow = true;
    group.add(arch);

    const stringGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.2, 3);
    const stringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });
    const str = new THREE.Mesh(stringGeo, stringMat);
    str.position.x = 0;
    str.position.y = 0.5;
    group.add(str);
  }

  group.scale.set(0.65, 0.65, 0.65);
  return group;
}

function createShieldMesh(type: string): THREE.Group {
  const group = new THREE.Group();
  const data = SHIELDS[type];
  if (!data) return group;

  const color = data.color;

  if (
    type === "buckler" ||
    type === "spiked" ||
    type === "timewarp" ||
    type === "mirror"
  ) {
    const size =
      type === "buckler"
        ? 0.45
        : type === "spiked"
          ? 0.5
          : type === "timewarp"
            ? 0.52
            : 0.55;
    const bodyGeo = new THREE.CylinderGeometry(size, size, 0.06, 6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: type === "mirror" ? 0.05 : 0.4,
      metalness: type === "mirror" ? 0.95 : 0.7,
      flatShading: true,
      emissive: type === "timewarp" ? 0x0044ff : 0x000000,
      emissiveIntensity: type === "timewarp" ? 0.4 : 0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    if (type === "spiked") {
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.3,
        metalness: 0.8,
        flatShading: true,
      });
      for (let i = 0; i < 5; i++) {
        const spikeGeo = new THREE.ConeGeometry(0.06, 0.22, 4);
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        const angle = (i / 5) * Math.PI * 2;
        spike.position.x = Math.cos(angle) * 0.3;
        spike.position.y = Math.sin(angle) * 0.3;
        spike.position.z = 0.08;
        spike.rotation.x = Math.PI / 2;
        spike.rotation.z = angle - Math.PI / 2;
        spike.castShadow = true;
        group.add(spike);
      }
    }
  } else if (
    type === "wooden" ||
    type === "iron" ||
    type === "absorption" ||
    type === "dragon"
  ) {
    const w =
      type === "wooden"
        ? 0.7
        : type === "iron"
          ? 0.8
          : type === "absorption"
            ? 0.85
            : 0.9;
    const h =
      type === "wooden"
        ? 1.0
        : type === "iron"
          ? 1.2
          : type === "absorption"
            ? 1.25
            : 1.35;
    const plateGeo = new THREE.BoxGeometry(w, h, 0.08);
    const plateMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: type === "wooden" ? 0.85 : 0.4,
      metalness: type === "wooden" ? 0.1 : 0.8,
      flatShading: true,
      emissive: type === "absorption" ? 0xff5500 : 0x000000,
      emissiveIntensity: type === "absorption" ? 0.3 : 0,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    const borderGeo = new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04);
    const borderMat = new THREE.MeshStandardMaterial({
      color: type === "wooden" ? 0x5a5a5a : 0xcc9900,
      roughness: 0.5,
      metalness: 0.7,
      flatShading: true,
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.z = -0.01;
    group.add(border);

    if (type === "dragon") {
      const hornGeo = new THREE.ConeGeometry(0.08, 0.3, 4);
      const hornMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        flatShading: true,
      });
      const h1 = new THREE.Mesh(hornGeo, hornMat);
      h1.position.set(-0.35, 0.5, 0.05);
      h1.rotation.z = Math.PI / 4;
      const h2 = h1.clone();
      h2.position.x = 0.35;
      h2.rotation.z = -Math.PI / 4;
      group.add(h1);
      group.add(h2);
    }
  }

  group.scale.set(0.65, 0.65, 0.65);
  return group;
}

function createPotionMesh(type: string): THREE.Group {
  const group = new THREE.Group();
  const data = POTIONS[type];
  if (!data) return group;

  const color = data.color;

  const baseGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.35, 6);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    roughness: 0.1,
    metalness: 0.9,
    flatShading: true,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.castShadow = true;
  group.add(base);

  const liquidGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.24, 6);
  const liquidMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.2,
    metalness: 0.1,
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.7,
  });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  liquid.position.y = -0.04;
  group.add(liquid);

  const neckGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 5);
  const neck = new THREE.Mesh(neckGeo, baseMat);
  neck.position.y = 0.24;
  group.add(neck);

  const corkGeo = new THREE.BoxGeometry(0.1, 0.08, 0.1);
  const corkMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.9,
    flatShading: true,
  });
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 0.34;
  group.add(cork);

  group.scale.set(0.7, 0.7, 0.7);
  return group;
}

function createChestMesh(): THREE.Group {
  const group = new THREE.Group();

  const baseGeo = new THREE.BoxGeometry(1.6, 0.9, 1.0);
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5a3d28,
    roughness: 0.9,
    flatShading: true,
  });
  const base = new THREE.Mesh(baseGeo, woodMat);
  base.position.y = 0.45;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.4,
    metalness: 0.8,
    flatShading: true,
  });
  const bandL = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.92, 1.02),
    metalMat
  );
  bandL.position.set(-0.65, 0.45, 0);
  const bandR = bandL.clone();
  bandR.position.x = 0.65;
  group.add(bandL);
  group.add(bandR);

  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, 0.9, -0.5);

  const lidGeo = new THREE.BoxGeometry(1.6, 0.5, 1.0);
  const lid = new THREE.Mesh(lidGeo, woodMat);
  lid.position.set(0, 0.25, 0.5);
  lid.castShadow = true;
  lidGroup.add(lid);

  const bandLidL = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.52, 1.02),
    metalMat
  );
  bandLidL.position.set(-0.65, 0.25, 0.5);
  const bandLidR = bandLidL.clone();
  bandLidR.position.x = 0.65;
  lidGroup.add(bandLidL);
  lidGroup.add(bandLidR);

  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.08), metalMat);
  lock.position.set(0, 0, 1.01);
  lidGroup.add(lock);

  group.add(lidGroup);
  group.userData = { lidGroup };
  group.scale.set(0.7, 0.7, 0.7);

  return group;
}

// ==========================================
// 4. ENTITY STRUCTURES
// ==========================================

interface GroundItem {
  id: string;
  type: "weapon" | "shield" | "potion";
  itemType: string;
  mesh: THREE.Group;
  collider: RAPIER.Collider;
  spawnTime: number;
}

interface Projectile {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  damage: number;
  speed: number;
  life: number;
  fromPlayer: boolean;
  type:
    | "arrow"
    | "fireball"
    | "lightning"
    | "holybeam"
    | "enemy_spit"
    | "enemy_magic";
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  gravity: number;
  life: number;
  maxLife: number;
}

interface RagdollPart {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  y: number;
  vy: number;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface DamageNumber {
  element: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  vy: number;
  life: number;
}

interface Enemy {
  id: string;
  type: number;
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  attackDmg: number;
  attackRange: number;
  attackCooldown: number;
  currentCooldown: number;
  body: RAPIER.RigidBody;
  mesh: THREE.Group;
  state: "chase" | "shoot" | "charge" | "golem_slam" | "demon_ring";
  chargeTimer?: number;
  chargeDir?: RAPIER.Vector2;
  teleportCooldown?: number;
  isDead: boolean;
}

interface Door {
  direction: "N" | "S" | "E" | "W";
  mesh: THREE.Group;
  collider: RAPIER.Collider | null;
  closed: boolean;
}

interface Room {
  gx: number;
  gy: number;
  depth: number;
  doors: Map<"N" | "S" | "E" | "W", Door>;
  enemies: Enemy[];
  chest: {
    mesh: THREE.Group;
    opened: boolean;
    hasGold: boolean;
  } | null;
  cleared: boolean;
  visited: boolean;
  group: THREE.Group;
  wallColliders: RAPIER.Collider[];
  floorCenter: THREE.Vector3;
}

// ==========================================
// 5. ENEMY SPECIFIC METRICS
// ==========================================
const ENEMY_DEFS = [
  {
    type: 1,
    name: "Goblin Scout",
    hp: 30,
    speed: 6.8,
    dmg: 7,
    range: 1.5,
    cd: 0.6,
  },
  {
    type: 2,
    name: "Rotted Zombie",
    hp: 60,
    speed: 2.8,
    dmg: 14,
    range: 1.8,
    cd: 1.3,
  },
  {
    type: 3,
    name: "Skeleton Archer",
    hp: 45,
    speed: 4.2,
    dmg: 10,
    range: 7.5,
    cd: 1.6,
  },
  {
    type: 4,
    name: "Necromancer Sorcerer",
    hp: 55,
    speed: 3.5,
    dmg: 12,
    range: 8.0,
    cd: 2.0,
  },
  {
    type: 5,
    name: "Orc Marauder",
    hp: 100,
    speed: 4.5,
    dmg: 22,
    range: 2.2,
    cd: 1.5,
  },
  {
    type: 6,
    name: "Spectral Wraith",
    hp: 50,
    speed: 4.8,
    dmg: 4,
    range: 2.0,
    cd: 1.0,
  },
  {
    type: 7,
    name: "Stone Golem",
    hp: 200,
    speed: 1.8,
    dmg: 28,
    range: 3.5,
    cd: 3.0,
  },
  {
    type: 8,
    name: "Obsidian Demon Lord",
    hp: 500,
    speed: 3.6,
    dmg: 35,
    range: 3.0,
    cd: 2.5,
  },
];

function createEnemyMesh(type: number): THREE.Group {
  const group = new THREE.Group();

  let bodyColor = 0x228b22;
  let scale = 1.0;

  switch (type) {
    case 1:
      bodyColor = 0x32cd32;
      scale = 0.75;
      break;
    case 2:
      bodyColor = 0x2e8b57;
      scale = 1.0;
      break;
    case 3:
      bodyColor = 0xdddddd;
      scale = 0.95;
      break;
    case 4:
      bodyColor = 0x483d8b;
      scale = 1.0;
      break;
    case 5:
      bodyColor = 0x1a4a1a;
      scale = 1.35;
      break;
    case 6:
      bodyColor = 0x87cefa;
      scale = 0.9;
      break;
    case 7:
      bodyColor = 0x708090;
      scale = 1.9;
      break;
    case 8:
      bodyColor = 0x8b0000;
      scale = 2.2;
      break;
  }

  let torsoMesh: THREE.Mesh;
  if (type === 6) {
    const geo = new THREE.ConeGeometry(0.35, 1.0, 5);
    const mat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
      flatShading: true,
    });
    torsoMesh = new THREE.Mesh(geo, mat);
    torsoMesh.position.y = 0.7;
  } else if (type === 7) {
    const geo = new THREE.BoxGeometry(0.7, 1.0, 0.7);
    const mat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
    torsoMesh = new THREE.Mesh(geo, mat);
    torsoMesh.position.y = 0.9;
  } else {
    const geo = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 5);
    const mat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.7,
      flatShading: true,
    });
    torsoMesh = new THREE.Mesh(geo, mat);
    torsoMesh.position.y = 0.75;
  }
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torsoMesh.name = "torso";
  group.add(torsoMesh);

  const headSize =
    type === 1 ? 0.25 : type === 7 ? 0.32 : type === 8 ? 0.45 : 0.3;
  const headGeo = new THREE.SphereGeometry(headSize, 5, 5);
  const headMat = new THREE.MeshStandardMaterial({
    color: type === 3 ? 0xeeeedd : type === 8 ? 0x222222 : bodyColor,
    roughness: 0.6,
    flatShading: true,
  });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = torsoMesh.position.y + (type === 7 ? 0.65 : 0.6);
  headMesh.castShadow = true;
  headMesh.name = "head";
  group.add(headMesh);

  const eyeMat = new THREE.MeshBasicMaterial({
    color:
      type === 8 || type === 4 ? 0xff0000 : type === 6 ? 0xffffff : 0xffff00,
  });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 3, 3), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.1, headMesh.position.y + 0.05, headSize - 0.05);
  eyeR.position.set(0.1, headMesh.position.y + 0.05, headSize - 0.05);
  group.add(eyeL);
  group.add(eyeR);

  if (type === 8) {
    const hornGeo = new THREE.ConeGeometry(0.08, 0.35, 4);
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      flatShading: true,
    });
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-0.25, headMesh.position.y + 0.3, 0);
    hornL.rotation.z = Math.PI / 4;
    const hornR = hornL.clone();
    hornR.position.x = 0.25;
    hornR.rotation.z = -Math.PI / 4;
    group.add(hornL);
    group.add(hornR);
  }

  if (type !== 6) {
    const handColor = type === 3 ? 0xeeeedd : bodyColor;
    const handL = createLimbMesh(handColor, type === 7 ? 0.22 : 0.13);
    const handR = handL.clone();
    handL.position.set(-0.55, 0.7, 0.25);
    handR.position.set(0.55, 0.7, 0.25);
    handL.name = "handL";
    handR.name = "handR";
    group.add(handL);
    group.add(handR);

    const footColor = type === 3 ? 0xeeeedd : 0x222222;
    const footL = createLimbMesh(footColor, type === 7 ? 0.25 : 0.15);
    const footR = footL.clone();
    footL.position.set(-0.25, 0.1, 0);
    footR.position.set(0.25, 0.1, 0);
    footL.name = "footL";
    footR.name = "footR";
    group.add(footL);
    group.add(footR);

    if (type === 1) {
      const dagger = createWeaponMesh("dagger");
      dagger.position.set(0, 0, 0.2);
      dagger.rotation.x = -Math.PI / 2;
      handL.add(dagger);
    } else if (type === 5) {
      const mace = createWeaponMesh("mace");
      mace.position.set(0, 0, 0.3);
      mace.rotation.x = -Math.PI / 2;
      handL.add(mace);
    } else if (type === 3) {
      const bow = createWeaponMesh("icebow");
      bow.position.set(0, 0, 0.15);
      handL.add(bow);
    }
  }

  group.scale.set(scale, scale, scale);
  return group;
}

// ==========================================
// 6. MAIN GAME ENGINE CLASS
// ==========================================
class GameEngine {
  scene!: THREE.Scene;
  camera!: THREE.OrthographicCamera;
  renderer!: THREE.WebGLRenderer;

  RAPIER!: typeof RAPIER;
  world!: RAPIER.World;

  rooms = new Map<string, Room>();
  activeRoomKey: string = "0,0";
  playerHp = 100;
  playerMaxHp = 100;
  playerStamina = 100;
  playerMaxStamina = 100;
  isSprinting = false;

  equippedWeapon: string = "sword";
  equippedShield: string = "buckler";
  equippedPotion: string | null = null;
  potionQty = 0;

  attackCooldown = 0;
  shieldActive = false;
  perfectBlockTimer = 0;
  invincibilityDuration = 0;
  invisibilityDuration = 0;
  strengthDuration = 0;
  toughnessDuration = 0;
  speedDuration = 0;
  tempShieldHp = 0;
  tempShieldMaxDuration = 0;

  keys: Record<string, boolean> = {};

  playerBody!: RAPIER.RigidBody;
  playerGroup!: THREE.Group;
  playerVisualY = 0;
  playerVY = 0;

  groundItems: GroundItem[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  ragdollParts: RagdollPart[] = [];
  damageNumbers: DamageNumber[] = [];

  statRoomsCleared = 0;
  statEnemiesSlain = 0;
  statDeepestRoom = 0;
  statBestItemName = "Basic Sword";

  activePointLight!: THREE.PointLight;
  dirLight!: THREE.DirectionalLight;

  gameState: "MENU" | "PLAYING" | "PAUSED" | "GAMEOVER" | "VICTORY" = "MENU";
  timeScale = 1.0;
  timeWarpDuration = 0;

  closestItemNearPlayer: GroundItem | null = null;
  isInsideChestTrigger = false;

  constructor() {
    this.initDOM();
  }

  async start() {
    this.RAPIER = RAPIER;
    await this.RAPIER.init();
    this.world = new this.RAPIER.World({ x: 0.0, y: 0.0 });

    this.initThree();

    this.generateDungeon();

    this.createPlayer();

    this.initInputs();

    this.spawnStartingItems();

    this.setGameState("PLAYING");

    let lastTime = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      this.update(dt);
      this.render();
    };
    requestAnimationFrame(tick);
  }

  private initDOM() {
    document
      .getElementById("btn-resume")
      ?.addEventListener("click", () => this.resumeGame());
    document
      .getElementById("btn-restart-pause")
      ?.addEventListener("click", () => this.restartGame());
    document
      .getElementById("btn-respawn")
      ?.addEventListener("click", () => this.restartGame());
    document
      .getElementById("btn-victory-restart")
      ?.addEventListener("click", () => this.restartGame());

    const volumeSlider = document.getElementById(
      "volume-slider"
    ) as HTMLInputElement;
    if (volumeSlider) {
      volumeSlider.addEventListener("input", (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        audio.setVolume(val / 100);
      });
    }

    const pauseModal = document.getElementById("pause-modal");
    if (pauseModal) {
      pauseModal.addEventListener("click", (e) => {
        if (e.target === pauseModal) this.resumeGame();
      });
    }
  }

  private initThree() {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;

    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 14;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      1000
    );

    this.camera.position.set(0, 16, 12);
    this.camera.lookAt(0, 0, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060609);
    this.scene.fog = new THREE.FogExp2(0x060609, 0.025);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const ambLight = new THREE.AmbientLight(0x0d0f15, 0.55);
    this.scene.add(ambLight);

    this.dirLight = new THREE.DirectionalLight(0xddeeff, 0.8);
    this.dirLight.position.set(12, 25, 8);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.left = -30;
    this.dirLight.shadow.camera.right = 30;
    this.dirLight.shadow.camera.top = 30;
    this.dirLight.shadow.camera.bottom = -30;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 100;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    this.activePointLight = new THREE.PointLight(0xffb84d, 1.8, 40, 0.6);
    this.activePointLight.position.set(0, 5, 0);
    this.activePointLight.castShadow = true;
    this.scene.add(this.activePointLight);

    window.addEventListener("resize", () => {
      const aspect = window.innerWidth / window.innerHeight;
      this.camera.left = -viewSize * aspect;
      this.camera.right = viewSize * aspect;
      this.camera.top = viewSize;
      this.camera.bottom = -viewSize;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private generateDungeon() {
    const MAX_DEPTH = 5;
    const roomMap = new Map<string, Room>();

    const queue: [number, number, number][] = [[0, 0, 0]];
    roomMap.set("0,0", this.createRoomObj(0, 0, 0));

    const DIRS = [
      { key: "N" as const, dx: 0, dy: 1 },
      { key: "S" as const, dx: 0, dy: -1 },
      { key: "E" as const, dx: 1, dy: 0 },
      { key: "W" as const, dx: -1, dy: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const [gx, gy, d] = current;
      const room = roomMap.get(`${gx},${gy}`);
      if (!room) continue;

      let directions: ("N" | "S" | "E" | "W")[] = [];

      if (gx === 0 && gy === 0) {
        directions = ["N", "S", "E", "W"];
      } else {
        const dx = 0 - gx;
        const dy = 0 - gy;
        let dBack: "N" | "S" | "E" | "W";
        if (Math.abs(dx) > Math.abs(dy)) {
          dBack = dx > 0 ? "E" : "W";
        } else {
          dBack = dy > 0 ? "N" : "S";
        }

        const OPPOSITES: Record<string, "N" | "S" | "E" | "W"> = {
          N: "S",
          S: "N",
          E: "W",
          W: "E",
        };
        const dForward = OPPOSITES[dBack]!;

        directions.push(dBack, dForward);

        if (d < MAX_DEPTH) {
          DIRS.forEach((dir) => {
            if (dir.key !== dBack && dir.key !== dForward) {
              if (Math.random() < 0.35) {
                directions.push(dir.key);
              }
            }
          });
        }
      }

      directions.forEach((dirKey) => {
        const dir = DIRS.find((di) => di.key === dirKey)!;
        const ngx = gx + dir.dx;
        const ngy = gy + dir.dy;
        const nd = Math.abs(ngx) + Math.abs(ngy);

        if (nd > MAX_DEPTH) return;

        const nKey = `${ngx},${ngy}`;
        let neighbor = roomMap.get(nKey);

        if (!neighbor) {
          neighbor = this.createRoomObj(ngx, ngy, nd);
          roomMap.set(nKey, neighbor);
          queue.push([ngx, ngy, nd]);
        }

        const OPPOSITES: Record<string, "N" | "S" | "E" | "W"> = {
          N: "S",
          S: "N",
          E: "W",
          W: "E",
        };
        const oppKey = OPPOSITES[dirKey]!;

        if (!room.doors.has(dirKey)) {
          room.doors.set(dirKey, this.createDoorObj(dirKey));
        }
        if (!neighbor.doors.has(oppKey)) {
          neighbor.doors.set(oppKey, this.createDoorObj(oppKey));
        }
      });
    }

    this.rooms = roomMap;
    this.rooms.forEach((room) => {
      this.buildRoomVisualsAndPhysics(room);
    });
  }

  private createRoomObj(gx: number, gy: number, depth: number): Room {
    return {
      gx,
      gy,
      depth,
      doors: new Map(),
      enemies: [],
      chest: null,
      cleared: depth === 0,
      visited: depth === 0,
      group: new THREE.Group(),
      wallColliders: [],
      floorCenter: new THREE.Vector3(gx * 30, 0, gy * 30),
    };
  }

  private createDoorObj(dir: "N" | "S" | "E" | "W"): Door {
    return {
      direction: dir,
      mesh: new THREE.Group(),
      collider: null,
      closed: false,
    };
  }

  private buildRoomVisualsAndPhysics(room: Room) {
    const rx = room.floorCenter.x;
    const rz = room.floorCenter.z;
    room.group.position.set(rx, 0, rz);
    this.scene.add(room.group);

    const tileSize = 4.0;
    const count = 6;
    const halfWidth = 12.0;

    const floorGroup = new THREE.Group();
    const stoneColors = [0x222428, 0x27292d, 0x1d1e22, 0x2b2e32, 0x303337];

    for (let x = 0; x < count; x++) {
      for (let z = 0; z < count; z++) {
        const px = -halfWidth + x * tileSize + tileSize / 2;
        const pz = -halfWidth + z * tileSize + tileSize / 2;

        const rndHeight = 0.05 + Math.random() * 0.08;
        const geo = new THREE.BoxGeometry(
          tileSize - 0.08,
          rndHeight,
          tileSize - 0.08
        );

        const col =
          stoneColors[Math.floor(Math.random() * stoneColors.length)]!;
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.95,
          metalness: 0.05,
          flatShading: true,
        });

        const tile = new THREE.Mesh(geo, mat);
        tile.position.set(px, -rndHeight / 2, pz);
        tile.receiveShadow = true;
        floorGroup.add(tile);
      }
    }
    room.group.add(floorGroup);

    const wallHeight = 2.6;
    const wallThick = 0.8;
    const wallColor = 0x484b50;
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });

    const createWallPhysics = (
      cx: number,
      cz: number,
      hx: number,
      hz: number
    ) => {
      const colDesc = this.RAPIER.ColliderDesc.cuboid(hx, hz);
      colDesc.setTranslation(rx + cx, rz + cz);
      const col = this.world.createCollider(colDesc);
      room.wallColliders.push(col);
    };

    const addWallSegment = (cx: number, cz: number, sx: number, sz: number) => {
      const geo = new THREE.BoxGeometry(sx, wallHeight, sz);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(cx, wallHeight / 2, cz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      room.group.add(wall);
      createWallPhysics(cx, cz, sx / 2, sz / 2);
    };

    const hasN = room.doors.has("N");
    const hasS = room.doors.has("S");
    const hasE = room.doors.has("E");
    const hasW = room.doors.has("W");

    if (hasN) {
      addWallSegment(-7.5, 12, 9, wallThick);
      addWallSegment(7.5, 12, 9, wallThick);
      const headerGeo = new THREE.BoxGeometry(6.0, wallHeight - 2.0, wallThick);
      const header = new THREE.Mesh(headerGeo, wallMat);
      header.position.set(0, wallHeight - (wallHeight - 2.0) / 2, 12);
      room.group.add(header);
    } else {
      addWallSegment(0, 12, 24, wallThick);
    }

    if (hasS) {
      addWallSegment(-7.5, -12, 9, wallThick);
      addWallSegment(7.5, -12, 9, wallThick);
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(6.0, wallHeight - 2.0, wallThick),
        wallMat
      );
      header.position.set(0, wallHeight - (wallHeight - 2.0) / 2, -12);
      room.group.add(header);
    } else {
      addWallSegment(0, -12, 24, wallThick);
    }

    if (hasE) {
      addWallSegment(12, -7.5, wallThick, 9);
      addWallSegment(12, 7.5, wallThick, 9);
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, wallHeight - 2.0, 6.0),
        wallMat
      );
      header.position.set(12, wallHeight - (wallHeight - 2.0) / 2, 0);
      room.group.add(header);
    } else {
      addWallSegment(12, 0, wallThick, 24);
    }

    if (hasW) {
      addWallSegment(-12, -7.5, wallThick, 9);
      addWallSegment(-12, 7.5, wallThick, 9);
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(wallThick, wallHeight - 2.0, 6.0),
        wallMat
      );
      header.position.set(-12, wallHeight - (wallHeight - 2.0) / 2, 0);
      room.group.add(header);
    } else {
      addWallSegment(-12, 0, wallThick, 24);
    }

    const doorWoodMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.9,
      flatShading: true,
    });
    const doorIronMat = new THREE.MeshStandardMaterial({
      color: 0x4f4f4f,
      roughness: 0.4,
      metalness: 0.8,
    });

    room.doors.forEach((door, dirKey) => {
      const doorMesh = new THREE.Group();

      const gate = new THREE.Mesh(
        dirKey === "N" || dirKey === "S"
          ? new THREE.BoxGeometry(5.8, 2.0, 0.2)
          : new THREE.BoxGeometry(0.2, 2.0, 5.8),
        doorWoodMat
      );
      gate.position.y = 1.0;
      gate.castShadow = true;
      doorMesh.add(gate);

      const bands = new THREE.Mesh(
        dirKey === "N" || dirKey === "S"
          ? new THREE.BoxGeometry(5.82, 0.15, 0.26)
          : new THREE.BoxGeometry(0.26, 0.15, 5.82),
        doorIronMat
      );
      bands.position.y = 0.5;
      doorMesh.add(bands);
      const bands2 = bands.clone();
      bands2.position.y = 1.5;
      doorMesh.add(bands2);

      if (dirKey === "N") doorMesh.position.set(0, 0, 12);
      if (dirKey === "S") doorMesh.position.set(0, 0, -12);
      if (dirKey === "E") doorMesh.position.set(12, 0, 0);
      if (dirKey === "W") doorMesh.position.set(-12, 0, 0);

      room.group.add(doorMesh);
      door.mesh = doorMesh;
    });

    if (room.depth > 0) {
      const countScale = Math.min(
        2 + Math.floor(room.depth * 0.7) + (Math.random() < 0.5 ? 1 : 0),
        6
      );
      for (let i = 0; i < countScale; i++) {
        const enemyType = this.chooseEnemyTypeForDepth(room.depth);
        this.spawnEnemyInRoom(room, enemyType);
      }

      if (Math.random() < 0.4 || room.depth === 5) {
        const chestMesh = createChestMesh();
        chestMesh.position.set(Math.random() * 4 - 2, 0, Math.random() * 4 - 2);
        room.group.add(chestMesh);
        room.chest = {
          mesh: chestMesh,
          opened: false,
          hasGold: true,
        };
      }
    }
  }

  private chooseEnemyTypeForDepth(depth: number): number {
    let choices = [1, 2, 3];
    if (depth === 2) choices = [2, 3, 4];
    if (depth === 3) choices = [3, 4, 5, 6];
    if (depth === 4) choices = [4, 5, 6, 7];
    if (depth === 5) {
      choices = [5, 6, 7, 8];
      if (Math.random() < 0.3) return 8;
    }

    const val = choices[Math.floor(Math.random() * choices.length)];
    return val ?? 1;
  }

  private spawnEnemyInRoom(room: Room, type: number) {
    const rx = room.floorCenter.x;
    const rz = room.floorCenter.z;

    const px = rx + (Math.random() * 16 - 8);
    const pz = rz + (Math.random() * 16 - 8);

    const def = ENEMY_DEFS.find((e) => e.type === type)!;

    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(px, pz);
    bodyDesc.setLinearDamping(4.0);
    bodyDesc.setAngularDamping(4.0);
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = this.RAPIER.ColliderDesc.ball(0.5);
    this.world.createCollider(colDesc, body);

    const mesh = createEnemyMesh(type);
    mesh.position.set(px, 0, pz);
    this.scene.add(mesh);

    const enemy: Enemy = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      name: def.name,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      attackDmg: def.dmg,
      attackRange: def.range,
      attackCooldown: def.cd,
      currentCooldown: Math.random() * def.cd,
      body,
      mesh,
      state: "chase",
      isDead: false,
    };

    room.enemies.push(enemy);
  }

  private spawnStartingItems() {
    this.spawnItemOnGround(0, 2, "weapon", "sword");
    this.spawnItemOnGround(2, 0, "shield", "buckler");
  }

  private spawnItemOnGround(
    x: number,
    z: number,
    type: "weapon" | "shield" | "potion",
    itemType: string
  ) {
    let visualGroup: THREE.Group;
    if (type === "weapon") visualGroup = createWeaponMesh(itemType);
    else if (type === "shield") visualGroup = createShieldMesh(itemType);
    else visualGroup = createPotionMesh(itemType);

    visualGroup.position.set(x, 0.4, z);
    this.scene.add(visualGroup);

    const colDesc = this.RAPIER.ColliderDesc.ball(0.8);
    colDesc.setTranslation(x, z);
    colDesc.setSensor(true);
    const collider = this.world.createCollider(colDesc);

    const item: GroundItem = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      itemType,
      mesh: visualGroup,
      collider,
      spawnTime: performance.now(),
    };

    this.groundItems.push(item);
  }

  private tossItem(type: "weapon" | "shield" | "potion", itemType: string) {
    const pPos = this.playerBody.translation();

    const angle = Math.random() * Math.PI * 2;
    const distance = 1.8;
    const tx = pPos.x + Math.cos(angle) * distance;
    const tz = pPos.y + Math.sin(angle) * distance;

    this.spawnItemOnGround(tx, tz, type, itemType);

    this.spawnParticleExplosion(
      tx,
      0.4,
      tz,
      type === "potion" ? 0x00ff00 : 0xaaaaaa,
      6
    );
  }

  private createPlayer() {
    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(0.0, 0.0);
    bodyDesc.setLinearDamping(6.0);
    bodyDesc.setAngularDamping(5.0);
    this.playerBody = this.world.createRigidBody(bodyDesc);

    const colDesc = this.RAPIER.ColliderDesc.capsule(0.3, 0.3);
    this.world.createCollider(colDesc, this.playerBody);

    this.playerGroup = new THREE.Group();

    const torsoGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.9, 6);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x1e3f66,
      roughness: 0.5,
      metalness: 0.6,
      flatShading: true,
    });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.8;
    torso.castShadow = true;
    torso.receiveShadow = true;
    torso.name = "torso";
    this.playerGroup.add(torso);

    const headGeo = new THREE.SphereGeometry(0.32, 6, 6);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xcdcfd4,
      roughness: 0.2,
      metalness: 0.9,
      flatShading: true,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.45;
    head.castShadow = true;
    head.name = "head";
    this.playerGroup.add(head);

    const crestGeo = new THREE.BoxGeometry(0.08, 0.15, 0.4);
    const crestMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      flatShading: true,
    });
    const crest = new THREE.Mesh(crestGeo, crestMat);
    crest.position.set(0, 1.7, 0.05);
    crest.castShadow = true;
    this.playerGroup.add(crest);

    const visorGeo = new THREE.BoxGeometry(0.42, 0.08, 0.35);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0f });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.48, 0.2);
    this.playerGroup.add(visor);

    const handL = createLimbMesh(0x1e3f66, 0.14);
    const handR = handL.clone();
    handL.position.set(-0.6, 0.75, 0.25);
    handR.position.set(0.6, 0.75, 0.25);
    handL.name = "handL";
    handR.name = "handR";
    this.playerGroup.add(handL);
    this.playerGroup.add(handR);

    const footL = createLimbMesh(0x222222, 0.16);
    const footR = footL.clone();
    footL.position.set(-0.25, 0.1, 0);
    footR.position.set(0.25, 0.1, 0);
    footL.name = "footL";
    footR.name = "footR";
    this.playerGroup.add(footL);
    this.playerGroup.add(footR);

    this.scene.add(this.playerGroup);

    this.updateEquippedVisuals();
  }

  private updateEquippedVisuals() {
    const handL = this.playerGroup.getObjectByName("handL");
    const handR = this.playerGroup.getObjectByName("handR");

    if (handL) {
      while (handL.children.length > 0) {
        handL.remove(handL.children[0]!);
      }
      if (this.equippedWeapon) {
        const weaponMesh = createWeaponMesh(this.equippedWeapon);
        weaponMesh.position.set(0, 0.05, 0.25);
        weaponMesh.rotation.x = -Math.PI / 2.5;
        handL.add(weaponMesh);
      }
    }

    if (handR) {
      while (handR.children.length > 0) {
        handR.remove(handR.children[0]!);
      }
      if (this.equippedShield) {
        const shieldMesh = createShieldMesh(this.equippedShield);
        shieldMesh.position.set(0.05, 0, 0.18);
        shieldMesh.rotation.y = -Math.PI / 12;
        handR.add(shieldMesh);
      }
    }
  }

  private initInputs() {
    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = true;

      if (key === "e") {
        this.handleInteraction();
      }

      if (key === "p") {
        this.consumePotion();
      }

      if (e.key === "Escape") {
        if (this.gameState === "PLAYING") {
          this.setGameState("PAUSED");
        } else if (this.gameState === "PAUSED") {
          this.resumeGame();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  private handleInteraction() {
    if (this.closestItemNearPlayer) {
      const item = this.closestItemNearPlayer;

      if (item.type === "weapon") {
        const current = this.equippedWeapon;
        this.equippedWeapon = item.itemType;
        audio.playPickup();
        this.spawnDamageText("⚔️ " + WEAPONS[item.itemType]!.name, 0xffd700);

        this.removeGroundItem(item);

        if (current) {
          this.tossItem("weapon", current);
        }
        this.updateEquippedVisuals();
      } else if (item.type === "shield") {
        const current = this.equippedShield;
        this.equippedShield = item.itemType;
        audio.playPickup();
        this.spawnDamageText("🛡️ " + SHIELDS[item.itemType]!.name, 0x00f5ff);

        this.removeGroundItem(item);

        if (current) {
          this.tossItem("shield", current);
        }
        this.updateEquippedVisuals();
      } else if (item.type === "potion") {
        audio.playPickup();
        const potData = POTIONS[item.itemType]!;
        this.spawnDamageText("🧪 +1 " + potData.name, 0x00ff00);

        if (this.equippedPotion === item.itemType) {
          this.potionQty++;
        } else {
          if (this.equippedPotion && this.potionQty > 0) {
            for (let i = 0; i < this.potionQty; i++) {
              this.tossItem("potion", this.equippedPotion);
            }
          }
          this.equippedPotion = item.itemType;
          this.potionQty = 1;
        }

        this.removeGroundItem(item);
      }

      this.closestItemNearPlayer = null;
      document.getElementById("interaction-prompt")?.classList.add("hidden");
    }
  }

  private removeGroundItem(item: GroundItem) {
    this.world.removeCollider(item.collider, true);
    this.scene.remove(item.mesh);
    this.groundItems = this.groundItems.filter((it) => it.id !== item.id);
  }

  private consumePotion() {
    if (!this.equippedPotion || this.potionQty <= 0) return;

    const data = POTIONS[this.equippedPotion];
    if (!data) return;

    audio.playDrink();
    this.potionQty--;

    this.spawnParticleExplosion(
      this.playerGroup.position.x,
      0.8,
      this.playerGroup.position.z,
      data.color,
      15
    );

    const triggerBuffMessage = (text: string) => {
      this.spawnDamageText(text, data.color);
    };

    switch (data.effect) {
      case "heal":
        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + data.amount);
        triggerBuffMessage(`+${data.amount} HP`);
        break;

      case "strength":
        this.strengthDuration = data.duration;
        triggerBuffMessage("MIGHT BUFF!");
        break;

      case "toughness":
        this.toughnessDuration = data.duration;
        triggerBuffMessage("IRON SKIN BUFF!");
        break;

      case "speed":
        this.speedDuration = data.duration;
        triggerBuffMessage("SWIFTNESS BUFF!");
        break;

      case "invisibility":
        this.invisibilityDuration = data.duration;
        triggerBuffMessage("INVISIBILITY!");
        break;

      case "invincibility":
        this.invincibilityDuration = data.duration;
        triggerBuffMessage("IMMUNIZED!");
        break;

      case "elixir":
        this.playerHp = this.playerMaxHp;
        this.tempShieldHp = 50;
        this.tempShieldMaxDuration = data.duration;
        triggerBuffMessage("ELIXIR OF LIFE DRUNK!");
        break;
    }

    if (this.potionQty <= 0) {
      this.equippedPotion = null;
    }
  }

  private setGameState(state: typeof this.gameState) {
    this.gameState = state;

    const pauseModal = document.getElementById("pause-modal");
    const gameoverModal = document.getElementById("gameover-modal");
    const victoryModal = document.getElementById("victory-modal");

    pauseModal?.classList.add("hidden");
    gameoverModal?.classList.add("hidden");
    victoryModal?.classList.add("hidden");

    if (state === "PAUSED") {
      pauseModal?.classList.remove("hidden");
    } else if (state === "GAMEOVER") {
      gameoverModal?.classList.remove("hidden");
      const r = document.getElementById("stat-rooms");
      if (r) r.innerText = this.statRoomsCleared.toString();
      const e = document.getElementById("stat-enemies");
      if (e) e.innerText = this.statEnemiesSlain.toString();
      const d = document.getElementById("stat-deepest");
      if (d) d.innerText = this.statDeepestRoom.toString();
      const b = document.getElementById("stat-best-item");
      if (b) b.innerText = this.statBestItemName;
    } else if (state === "VICTORY") {
      victoryModal?.classList.remove("hidden");
      const vr = document.getElementById("stat-victory-rooms");
      if (vr) vr.innerText = this.statRoomsCleared.toString();
      const ve = document.getElementById("stat-victory-enemies");
      if (ve) ve.innerText = this.statEnemiesSlain.toString();
    }
  }

  private resumeGame() {
    this.setGameState("PLAYING");
  }

  private restartGame() {
    window.location.reload();
  }

  update(dt: number) {
    if (this.gameState !== "PLAYING") return;

    let actualDt = dt;
    if (this.timeWarpDuration > 0) {
      this.timeWarpDuration -= dt;
      actualDt = dt * 0.25;
    }

    this.world.timestep = actualDt;
    this.world.step();

    if (this.invincibilityDuration > 0) this.invincibilityDuration -= actualDt;
    if (this.invisibilityDuration > 0) this.invisibilityDuration -= actualDt;
    if (this.strengthDuration > 0) this.strengthDuration -= actualDt;
    if (this.toughnessDuration > 0) this.toughnessDuration -= actualDt;
    if (this.speedDuration > 0) this.speedDuration -= actualDt;
    if (this.tempShieldMaxDuration > 0) {
      this.tempShieldMaxDuration -= actualDt;
      if (this.tempShieldMaxDuration <= 0) {
        this.tempShieldHp = 0;
      }
    }

    this.updatePlayerMovement(actualDt);
    this.updatePlayerCombat(actualDt);
    this.updateRoomStatusAndEnemies(actualDt);
    this.updateProjectiles(actualDt);
    this.updateParticles(actualDt);
    this.updateRagdollParts(actualDt);
    this.updateDamageNumbers(actualDt);
    this.updateCamera(actualDt);

    const time = performance.now() * 0.003;
    this.groundItems.forEach((item) => {
      item.mesh.position.y =
        0.35 + Math.sin(time + item.spawnTime * 0.1) * 0.08;
      item.mesh.rotation.y += actualDt * 0.7;
    });
  }

  private updatePlayerMovement(dt: number) {
    let moveX = 0;
    let moveZ = 0;

    if (this.keys["w"] || this.keys["arrowup"]) moveZ -= 1;
    if (this.keys["s"] || this.keys["arrowdown"]) moveZ += 1;
    if (this.keys["a"] || this.keys["arrowleft"]) moveX -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) moveX += 1;

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    this.isSprinting =
      this.keys["shift"] === true && len > 0 && this.playerStamina > 5;

    let baseSpeed = 5.8;
    if (this.speedDuration > 0) baseSpeed *= 1.4;

    let speed = baseSpeed;

    if (this.isSprinting) {
      speed *= 1.6;
      this.playerStamina = Math.max(0, this.playerStamina - dt * 24);
    } else {
      this.playerStamina = Math.min(
        this.playerMaxStamina,
        this.playerStamina + dt * 15
      );
    }

    this.shieldActive = this.keys["k"] === true && !!this.equippedShield;
    if (this.shieldActive) {
      const shield = SHIELDS[this.equippedShield];
      if (shield) {
        speed *= 1.0 - shield.speedPenalty;
      }
    }

    this.playerBody.setLinvel({ x: moveX * speed, y: moveZ * speed }, true);

    const pos = this.playerBody.translation();
    this.playerGroup.position.set(pos.x, this.playerVisualY, pos.y);

    if (len > 0) {
      const targetAngle = Math.atan2(-moveZ, moveX);

      const currentRot = this.playerGroup.rotation.y;

      let diff = targetAngle - currentRot;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      this.playerGroup.rotation.y += diff * 0.25;

      if (Math.random() < dt * 3.5) {
        audio.playMove();
      }

      const time = performance.now() * 0.012 * speed;
      const torso = this.playerGroup.getObjectByName("torso");
      const head = this.playerGroup.getObjectByName("head");
      const handL = this.playerGroup.getObjectByName("handL");
      const handR = this.playerGroup.getObjectByName("handR");
      const footL = this.playerGroup.getObjectByName("footL");
      const footR = this.playerGroup.getObjectByName("footR");

      if (torso) torso.position.y = 0.8 + Math.sin(time) * 0.08;
      if (head) head.position.y = 1.45 + Math.sin(time) * 0.06;

      if (footL) {
        footL.position.z = Math.sin(time) * 0.35;
        footL.position.y = 0.1 + Math.max(0, Math.cos(time)) * 0.12;
      }
      if (footR) {
        footR.position.z = -Math.sin(time) * 0.35;
        footR.position.y = 0.1 + Math.max(0, -Math.cos(time)) * 0.12;
      }

      if (handL && !this.shieldActive) {
        handL.position.z = 0.2 + Math.cos(time) * 0.15;
      }
      if (handR && !this.shieldActive) {
        handR.position.z = 0.2 - Math.cos(time) * 0.15;
      }
    } else {
      const time = performance.now() * 0.002;
      const torso = this.playerGroup.getObjectByName("torso");
      const head = this.playerGroup.getObjectByName("head");
      if (torso) torso.position.y = 0.8 + Math.sin(time) * 0.02;
      if (head) head.position.y = 1.45 + Math.sin(time) * 0.015;

      const footL = this.playerGroup.getObjectByName("footL");
      const footR = this.playerGroup.getObjectByName("footR");
      if (footL) footL.position.set(-0.25, 0.1, 0);
      if (footR) footR.position.set(0.25, 0.1, 0);
    }
  }

  private updatePlayerCombat(dt: number) {
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    const handR = this.playerGroup.getObjectByName("handR");
    if (handR) {
      if (this.shieldActive) {
        handR.position.set(0, 0.85, 0.42);
        handR.rotation.set(0, 0, 0);
      } else {
        handR.position.set(0.6, 0.75, 0.15);
        handR.rotation.set(0, -Math.PI / 12, 0);
      }
    }

    if (
      this.keys["j"] &&
      this.attackCooldown <= 0 &&
      this.equippedWeapon &&
      !this.shieldActive
    ) {
      const weapon = WEAPONS[this.equippedWeapon];
      if (weapon) {
        this.attackCooldown = weapon.cooldown;
        this.executeAttack(weapon);
      }
    }
  }

  private executeAttack(weapon: WeaponData) {
    const angle = this.playerGroup.rotation.y;
    const px = this.playerGroup.position.x;
    const pz = this.playerGroup.position.z;

    const handL = this.playerGroup.getObjectByName("handL");
    if (handL) {
      handL.position.set(-0.2, 0.9, 0.6);
      setTimeout(() => {
        handL.position.set(-0.6, 0.75, 0.25);
      }, 150);
    }

    if (weapon.isRanged) {
      audio.playShoot();
      this.spawnPlayerProjectile(px, pz, angle, weapon);
    } else {
      audio.playSlash();
      this.spawnSwipeParticles(px, pz, angle, weapon.range, weapon.color);

      const room = this.rooms.get(this.activeRoomKey);
      if (!room) return;

      const baseDamage = weapon.damage;
      let finalDamage = baseDamage;
      if (this.strengthDuration > 0) finalDamage *= 1.5;

      room.enemies.forEach((enemy) => {
        if (enemy.isDead) return;

        const ePos = enemy.body.translation();
        const dx = ePos.x - px;
        const dy = ePos.y - pz;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= weapon.range) {
          const angleToEnemy = Math.atan2(-dy, dx);
          let diff = angleToEnemy - angle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;

          if (Math.abs(diff) <= Math.PI / 3) {
            this.damageEnemy(
              enemy,
              finalDamage,
              weapon.knockback,
              new THREE.Vector2(dx, dy).normalize()
            );

            if (weapon.lifesteal && this.playerHp < this.playerMaxHp) {
              this.playerHp = Math.min(
                this.playerMaxHp,
                this.playerHp + weapon.lifesteal
              );
              this.spawnDamageText(`+${weapon.lifesteal} HP`, 0x00ff00, px, pz);
            }
          }
        }
      });
    }
  }

  private spawnPlayerProjectile(
    px: number,
    pz: number,
    angle: number,
    weapon: WeaponData
  ) {
    const pSize = weapon.projectileType === "fireball" ? 0.35 : 0.16;
    const geo = new THREE.SphereGeometry(pSize, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: weapon.color,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, 0.8, pz);
    this.scene.add(mesh);

    const speed =
      weapon.projectileType === "fireball"
        ? 10
        : weapon.projectileType === "lightning"
          ? 18
          : 14;
    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(
      px + Math.cos(angle) * 0.8,
      pz - Math.sin(angle) * 0.8
    );
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = this.RAPIER.ColliderDesc.ball(pSize);
    colDesc.setSensor(true);
    this.world.createCollider(colDesc, body);

    body.setLinvel(
      { x: Math.cos(angle) * speed, y: -Math.sin(angle) * speed },
      true
    );

    const proj: Projectile = {
      mesh,
      body,
      damage: this.strengthDuration > 0 ? weapon.damage * 1.5 : weapon.damage,
      speed,
      life: 2.0,
      fromPlayer: true,
      type: weapon.projectileType || "arrow",
    };

    this.projectiles.push(proj);
  }

  private spawnEnemyProjectile(
    enemy: Enemy,
    tx: number,
    tz: number,
    dmg: number,
    type: "enemy_spit" | "enemy_magic"
  ) {
    const px = enemy.mesh.position.x;
    const pz = enemy.mesh.position.z;

    const dx = tx - px;
    const dz = tz - pz;
    const len = Math.sqrt(dx * dx + dz * dz);
    const vx = (dx / len) * 8.5;
    const vz = (dz / len) * 8.5;

    const geo = new THREE.DodecahedronGeometry(0.18);
    const mat = new THREE.MeshBasicMaterial({
      color: type === "enemy_magic" ? 0x9932cc : 0x228b22,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, 0.75, pz);
    this.scene.add(mesh);

    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(px + (dx / len) * 0.8, pz + (dz / len) * 0.8);
    const body = this.world.createRigidBody(bodyDesc);

    const colDesc = this.RAPIER.ColliderDesc.ball(0.18);
    colDesc.setSensor(true);
    this.world.createCollider(colDesc, body);

    body.setLinvel({ x: vx, y: vz }, true);

    const proj: Projectile = {
      mesh,
      body,
      damage: dmg,
      speed: 8.5,
      life: 2.5,
      fromPlayer: false,
      type,
    };

    this.projectiles.push(proj);
  }

  private updateProjectiles(dt: number) {
    this.projectiles.forEach((proj) => {
      proj.life -= dt;

      const pos = proj.body.translation();
      proj.mesh.position.set(pos.x, 0.75, pos.y);

      if (Math.random() < 0.25) {
        this.spawnParticleExplosion(
          pos.x,
          0.75,
          pos.y,
          proj.fromPlayer ? 0x00ffff : 0xff00ff,
          1
        );
      }

      if (proj.fromPlayer) {
        const room = this.rooms.get(this.activeRoomKey);
        if (room) {
          room.enemies.forEach((enemy) => {
            if (enemy.isDead || proj.life <= 0) return;
            const ePos = enemy.body.translation();
            const dx = ePos.x - pos.x;
            const dy = ePos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.7) {
              this.damageEnemy(
                enemy,
                proj.damage,
                2.0,
                new THREE.Vector2(dx, dy).normalize()
              );

              if (proj.type === "arrow") {
                enemy.speed =
                  ENEMY_DEFS.find((ed) => ed.type === enemy.type)!.speed * 0.4;
                setTimeout(() => {
                  if (!enemy.isDead) {
                    enemy.speed = ENEMY_DEFS.find(
                      (ed) => ed.type === enemy.type
                    )!.speed;
                  }
                }, 3000);
              }

              if (proj.type === "fireball") {
                this.spawnParticleExplosion(pos.x, 0.75, pos.y, 0xff4500, 15);
                room.enemies.forEach((e) => {
                  if (e.id === enemy.id || e.isDead) return;
                  const esp = e.body.translation();
                  const dspx = esp.x - pos.x;
                  const dspy = esp.y - pos.y;
                  const dsp = Math.sqrt(dspx * dspx + dspy * dspy);
                  if (dsp < 3.2) {
                    this.damageEnemy(
                      e,
                      proj.damage * 0.6,
                      5.0,
                      new THREE.Vector2(dspx, dspy).normalize()
                    );
                  }
                });
              }

              proj.life = 0;
            }
          });
        }
      } else {
        const pPos = this.playerBody.translation();
        const dx = pPos.x - pos.x;
        const dy = pPos.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.65) {
          this.damagePlayer(proj.damage, new THREE.Vector2(dx, dy).normalize());
          proj.life = 0;
        }
      }

      const roomX = Math.round(pos.x / 30);
      const roomZ = Math.round(pos.y / 30);
      const cellCenter = new THREE.Vector2(roomX * 30, roomZ * 30);
      if (
        Math.abs(pos.x - cellCenter.x) > 11.5 ||
        Math.abs(pos.y - cellCenter.y) > 11.5
      ) {
        proj.life = 0;
      }
    });

    this.projectiles = this.projectiles.filter((proj) => {
      if (proj.life <= 0) {
        this.world.removeRigidBody(proj.body);
        this.scene.remove(proj.mesh);
        return false;
      }
      return true;
    });
  }

  private updateRoomStatusAndEnemies(dt: number) {
    const pPos = this.playerBody.translation();
    const grx = Math.round(pPos.x / 30);
    const gry = Math.round(pPos.y / 30);
    const newKey = `${grx},${gry}`;

    const room = this.rooms.get(newKey);
    if (room && newKey !== this.activeRoomKey) {
      this.activeRoomKey = newKey;
      this.activePointLight.position.set(
        room.floorCenter.x,
        6,
        room.floorCenter.z
      );

      if (room.depth > this.statDeepestRoom) {
        this.statDeepestRoom = room.depth;
      }

      if (!room.cleared && room.enemies.length > 0) {
        room.visited = true;
        this.lockRoomDoors(room);
        audio.playDoorLock();
        this.spawnDamageText("🔒 LOCKED IN!", 0xff4757, pPos.x, pPos.y);
      }
    }

    const activeRoom = this.rooms.get(this.activeRoomKey);
    if (activeRoom) {
      if (!activeRoom.cleared) {
        const aliveEnemies = activeRoom.enemies.filter((e) => !e.isDead);
        if (aliveEnemies.length === 0) {
          activeRoom.cleared = true;
          this.statRoomsCleared++;
          this.unlockRoomDoors(activeRoom);
          audio.playRoomClear();
          this.triggerRoomClearedBanner();

          if (activeRoom.chest) {
            audio.playChest();
            const lid = activeRoom.chest.mesh.userData[
              "lidGroup"
            ] as THREE.Group;
            if (lid) {
              lid.rotation.x = -Math.PI / 3;
            }
            activeRoom.chest.opened = true;

            const rItemType = this.getRandomLootForDepth(activeRoom.depth);
            this.spawnItemOnGround(
              activeRoom.chest.mesh.position.x + activeRoom.floorCenter.x,
              activeRoom.chest.mesh.position.z + activeRoom.floorCenter.z,
              rItemType.type,
              rItemType.id
            );
          }
        }
      }

      activeRoom.enemies.forEach((enemy) => {
        if (enemy.isDead) return;
        this.processEnemyAI(enemy, activeRoom, dt);
      });
    }
  }

  private lockRoomDoors(room: Room) {
    const rx = room.floorCenter.x;
    const rz = room.floorCenter.z;

    room.doors.forEach((door, dirKey) => {
      let cx = rx;
      let cz = rz;
      let sx = 0.1;
      let sz = 0.1;

      if (dirKey === "N") {
        cx += 0;
        cz += 12;
        sx = 6.0;
        sz = 0.5;
      }
      if (dirKey === "S") {
        cx += 0;
        cz += -12;
        sx = 6.0;
        sz = 0.5;
      }
      if (dirKey === "E") {
        cx += 12;
        cz += 0;
        sx = 0.5;
        sz = 6.0;
      }
      if (dirKey === "W") {
        cx += -12;
        cz += 0;
        sx = 0.5;
        sz = 6.0;
      }

      door.mesh.position.y = 0.0;
      door.closed = true;

      const colDesc = this.RAPIER.ColliderDesc.cuboid(sx / 2, sz / 2);
      colDesc.setTranslation(cx, cz);
      door.collider = this.world.createCollider(colDesc);
    });

    const statusBadge = document.getElementById("room-status");
    if (statusBadge) {
      statusBadge.innerText = "LOCKED";
      statusBadge.classList.add("locked");
    }
  }

  private unlockRoomDoors(room: Room) {
    room.doors.forEach((door) => {
      if (door.collider) {
        this.world.removeCollider(door.collider, true);
        door.collider = null;
      }
      door.mesh.position.y = -2.2;
      door.closed = false;
    });

    audio.playDoorUnlock();

    const statusBadge = document.getElementById("room-status");
    if (statusBadge) {
      statusBadge.innerText = "UNLOCKED";
      statusBadge.classList.remove("locked");
    }
  }

  private getRandomLootForDepth(depth: number): {
    type: "weapon" | "shield" | "potion";
    id: string;
  } {
    const fittingWeapons = Object.values(WEAPONS).filter(
      (w) => w.power === Math.min(Math.floor(depth * 0.8) + 1, 4)
    );
    const fittingShields = Object.values(SHIELDS).filter(
      (s) => s.power === Math.min(Math.floor(depth * 0.8) + 1, 4)
    );
    const fittingPotions = Object.values(POTIONS).filter(
      (p) => p.power === Math.min(Math.floor(depth * 0.8) + 1, 4)
    );

    const r = Math.random();
    if (r < 0.45 && fittingWeapons.length > 0) {
      const w =
        fittingWeapons[Math.floor(Math.random() * fittingWeapons.length)]!;
      return { type: "weapon", id: w.id };
    } else if (r < 0.8 && fittingShields.length > 0) {
      const s =
        fittingShields[Math.floor(Math.random() * fittingShields.length)]!;
      return { type: "shield", id: s.id };
    } else {
      const p =
        fittingPotions[Math.floor(Math.random() * fittingPotions.length)]!;
      return { type: "potion", id: p.id };
    }
  }

  private processEnemyAI(enemy: Enemy, room: Room, dt: number) {
    const pPos = this.playerBody.translation();
    const ePos = enemy.body.translation();

    const dx = pPos.x - ePos.x;
    const dy = pPos.y - ePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.invisibilityDuration > 0 && dist > 3.5) {
      enemy.body.setLinvel({ x: 0, y: 0 }, true);
      return;
    }

    const angle = Math.atan2(-dy, dx);
    enemy.mesh.rotation.y = angle;

    enemy.currentCooldown -= dt;

    if (enemy.type === 1 || enemy.type === 2) {
      const dirX = dx / dist;
      const dirY = dy / dist;

      enemy.body.setLinvel(
        { x: dirX * enemy.speed, y: dirY * enemy.speed },
        true
      );

      if (dist <= enemy.attackRange && enemy.currentCooldown <= 0) {
        enemy.currentCooldown = enemy.attackCooldown;
        this.executeEnemyMeleeAttack(enemy);
      }
    } else if (enemy.type === 3) {
      let vx = 0;
      let vy = 0;

      if (dist > 7.5) {
        vx = (dx / dist) * enemy.speed;
        vy = (dy / dist) * enemy.speed;
      } else if (dist < 4.0) {
        vx = -(dx / dist) * enemy.speed;
        vy = -(dy / dist) * enemy.speed;
      }

      enemy.body.setLinvel({ x: vx, y: vy }, true);

      if (dist <= 8.5 && enemy.currentCooldown <= 0) {
        enemy.currentCooldown = enemy.attackCooldown;
        audio.playShoot();
        this.spawnEnemyProjectile(
          enemy,
          pPos.x,
          pPos.y,
          enemy.attackDmg,
          "enemy_spit"
        );
      }
    } else if (enemy.type === 4) {
      if (enemy.teleportCooldown === undefined) enemy.teleportCooldown = 0;
      enemy.teleportCooldown -= dt;

      if (dist < 3.0 && enemy.teleportCooldown <= 0) {
        const rx = room.floorCenter.x + (Math.random() * 16 - 8);
        const rz = room.floorCenter.z + (Math.random() * 16 - 8);

        this.spawnParticleExplosion(
          enemy.mesh.position.x,
          0.8,
          enemy.mesh.position.z,
          0x8a2be2,
          10
        );
        enemy.body.setTranslation({ x: rx, y: rz }, true);
        this.spawnParticleExplosion(rx, 0.8, rz, 0x8a2be2, 10);

        enemy.teleportCooldown = 3.0;
        audio.playDoorUnlock();
      }

      const dirX = dx / dist;
      const dirY = dy / dist;
      enemy.body.setLinvel(
        { x: dirX * enemy.speed, y: dirY * enemy.speed },
        true
      );

      if (enemy.currentCooldown <= 0) {
        enemy.currentCooldown = enemy.attackCooldown;
        audio.playShoot();
        this.spawnEnemyProjectile(
          enemy,
          pPos.x,
          pPos.y,
          enemy.attackDmg,
          "enemy_magic"
        );
      }
    } else if (enemy.type === 5) {
      if (enemy.chargeTimer === undefined) enemy.chargeTimer = 0;
      enemy.chargeTimer -= dt;

      if (enemy.chargeTimer <= 0 && dist < 8.0 && enemy.chargeTimer > -1.2) {
        enemy.state = "charge";
        enemy.chargeTimer = 5.0;
        enemy.chargeDir = new this.RAPIER.Vector2(dx / dist, dy / dist);
        audio.playDoorLock();
        this.spawnDamageText(
          "😠 ROAR!",
          0xff8c00,
          enemy.mesh.position.x,
          enemy.mesh.position.z
        );
      }

      if (enemy.state === "charge") {
        const cTimerLeft = enemy.chargeTimer - 3.8;
        if (cTimerLeft > 0 && enemy.chargeDir) {
          enemy.body.setLinvel(
            {
              x: enemy.chargeDir.x * enemy.speed * 2.8,
              y: enemy.chargeDir.y * enemy.speed * 2.8,
            },
            true
          );
          this.spawnParticleExplosion(
            enemy.mesh.position.x,
            0.1,
            enemy.mesh.position.z,
            0x8b4513,
            1
          );
          if (dist < 1.4) {
            this.damagePlayer(
              enemy.attackDmg * 1.3,
              new THREE.Vector2(dx, dy).normalize()
            );
            enemy.state = "chase";
          }
        } else {
          enemy.state = "chase";
        }
      } else {
        const dirX = dx / dist;
        const dirY = dy / dist;
        enemy.body.setLinvel(
          { x: dirX * enemy.speed, y: dirY * enemy.speed },
          true
        );
      }
    } else if (enemy.type === 6) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      enemy.body.setLinvel(
        { x: dirX * enemy.speed, y: dirY * enemy.speed },
        true
      );

      if (dist < 2.0) {
        if (enemy.currentCooldown <= 0) {
          enemy.currentCooldown = 0.5;
          this.damagePlayer(4, new THREE.Vector2(dx, dy).normalize(), true);
          this.spawnParticleExplosion(pPos.x, 0.75, pPos.y, 0x87cefa, 4);
        }
      }
    } else if (enemy.type === 7) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      enemy.body.setLinvel(
        { x: dirX * enemy.speed, y: dirY * enemy.speed },
        true
      );

      if (dist <= 3.8 && enemy.currentCooldown <= 0) {
        enemy.currentCooldown = enemy.attackCooldown;
        this.executeGolemSlam(enemy);
      }
    } else if (enemy.type === 8) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      enemy.body.setLinvel(
        { x: dirX * enemy.speed, y: dirY * enemy.speed },
        true
      );

      if (enemy.currentCooldown <= 0) {
        enemy.currentCooldown = enemy.attackCooldown;
        audio.playShoot();
        for (let i = 0; i < 8; i++) {
          const fAngle = (i / 8) * Math.PI * 2;
          const targetX = ePos.x + Math.cos(fAngle) * 5;
          const targetY = ePos.y + Math.sin(fAngle) * 5;
          this.spawnEnemyProjectile(
            enemy,
            targetX,
            targetY,
            enemy.attackDmg * 0.8,
            "enemy_magic"
          );
        }
        this.spawnDamageText("🔥 INFERNO!", 0xff4500, ePos.x, ePos.y);
      }

      if (dist < 2.5 && Math.random() < 0.05) {
        this.executeEnemyMeleeAttack(enemy);
      }
    }

    enemy.mesh.position.set(ePos.x, 0, ePos.y);

    const vel = enemy.body.linvel();
    const vLen = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (vLen > 0.5) {
      const time = performance.now() * 0.01 * enemy.speed;
      const torso = enemy.mesh.getObjectByName("torso");
      const head = enemy.mesh.getObjectByName("head");
      if (torso && head) {
        torso.position.y = 0.75 + Math.sin(time) * 0.06;
        head.position.y = torso.position.y + 0.6 + Math.sin(time) * 0.04;
      }

      const footL = enemy.mesh.getObjectByName("footL");
      const footR = enemy.mesh.getObjectByName("footR");
      if (footL) footL.position.z = Math.sin(time) * 0.3;
      if (footR) footR.position.z = -Math.sin(time) * 0.3;
    }
  }

  private executeEnemyMeleeAttack(enemy: Enemy) {
    const pPos = this.playerBody.translation();
    const ePos = enemy.body.translation();
    const dx = pPos.x - ePos.x;
    const dy = pPos.y - ePos.y;

    const handL = enemy.mesh.getObjectByName("handL");
    if (handL) {
      handL.position.set(-0.2, 0.7, 0.65);
      setTimeout(() => {
        handL.position.set(-0.55, 0.7, 0.25);
      }, 200);
    }

    audio.playSlash();
    this.damagePlayer(enemy.attackDmg, new THREE.Vector2(dx, dy).normalize());
  }

  private executeGolemSlam(enemy: Enemy) {
    audio.playDoorLock();
    this.spawnDamageText(
      "💥 SLAM!",
      0xaaaaaa,
      enemy.mesh.position.x,
      enemy.mesh.position.z
    );

    const ringGeo = new THREE.RingGeometry(0.1, 0.2, 8);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(enemy.mesh.position.x, 0.05, enemy.mesh.position.z);
    this.scene.add(ring);

    let size = 0.2;
    const expand = () => {
      size += 0.22;
      ring.scale.set(size, size, 1);
      ringMat.opacity = Math.max(0, 1.0 - size / 4.0);
      if (size < 4.0) {
        requestAnimationFrame(expand);
      } else {
        this.scene.remove(ring);
      }
    };
    requestAnimationFrame(expand);

    setTimeout(() => {
      const pPos = this.playerBody.translation();
      const ePos = enemy.body.translation();
      const dx = pPos.x - ePos.x;
      const dy = pPos.y - ePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4.0) {
        this.damagePlayer(
          enemy.attackDmg,
          new THREE.Vector2(dx, dy).normalize()
        );
      }
    }, 150);
  }

  private damageEnemy(
    enemy: Enemy,
    dmg: number,
    knockback: number,
    dir: THREE.Vector2
  ) {
    if (enemy.isDead) return;

    enemy.hp -= dmg;
    audio.playEnemyHurt();

    this.spawnDamageText(
      Math.round(dmg).toString(),
      0xffffff,
      enemy.mesh.position.x,
      enemy.mesh.position.z
    );
    this.spawnParticleExplosion(
      enemy.mesh.position.x,
      0.75,
      enemy.mesh.position.z,
      0xff0000,
      8
    );

    enemy.body.applyImpulse(
      {
        x: dir.x * knockback * enemy.body.mass(),
        y: dir.y * knockback * enemy.body.mass(),
      },
      true
    );

    if (enemy.hp <= 0) {
      enemy.isDead = true;
      this.statEnemiesSlain++;
      this.triggerEnemyRagdoll(enemy, dir);
    }
  }

  private damagePlayer(dmg: number, dir: THREE.Vector2, bypassBlock = false) {
    if (this.playerHp <= 0 || this.invincibilityDuration > 0) return;

    if (this.shieldActive && !bypassBlock) {
      const playerAngle = this.playerGroup.rotation.y;
      const attackAngle = Math.atan2(-dir.y, dir.x);

      let diff = attackAngle - playerAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      if (Math.abs(diff) > Math.PI / 2.4) {
        const shield = SHIELDS[this.equippedShield];
        if (shield) {
          const isPerfect = Math.random() < 0.25;

          if (isPerfect) {
            audio.playPerfectBlock();
            this.spawnDamageText("🛡️ PERFECT BLOCK!", 0x00f5ff);
            this.spawnParticleExplosion(
              this.playerGroup.position.x + Math.cos(playerAngle) * 0.5,
              0.8,
              this.playerGroup.position.z - Math.sin(playerAngle) * 0.5,
              0x00ffff,
              12
            );

            if (shield.perfectEffect === "timewarp") {
              this.timeWarpDuration = 1.5;
              this.spawnDamageText("🌀 TIME WARP!", 0x4169e1);
            } else if (shield.perfectEffect === "absorption") {
              const healVal = Math.round(dmg * 0.4);
              this.playerHp = Math.min(
                this.playerMaxHp,
                this.playerHp + healVal
              );
              this.spawnDamageText(`☀️ HEAL +${healVal}`, 0x00ff00);
            } else if (shield.perfectEffect === "mirror") {
              this.spawnDamageText("🪞 REFLECTED!", 0x00f5ff);
              const wData = WEAPONS["sword"]!;
              this.spawnPlayerProjectile(
                this.playerGroup.position.x,
                this.playerGroup.position.z,
                playerAngle,
                {
                  ...wData,
                  damage: dmg * 1.5,
                  color: 0x00ffff,
                }
              );
            } else if (shield.perfectEffect === "dragon") {
              this.spawnDamageText("🔥 DRAGON BLAST!", 0xff4500);
              const room = this.rooms.get(this.activeRoomKey);
              if (room) {
                room.enemies.forEach((enemy) => {
                  if (enemy.isDead) return;
                  const ePos = enemy.body.translation();
                  const dx = ePos.x - this.playerGroup.position.x;
                  const dy = ePos.y - this.playerGroup.position.z;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist < 4.2) {
                    this.damageEnemy(
                      enemy,
                      35,
                      8.0,
                      new THREE.Vector2(dx, dy).normalize()
                    );
                  }
                });
              }
            }
            return;
          }

          audio.playBlock();
          const reducedDmg = dmg * (1.0 - shield.blockRate);
          this.spawnDamageText(
            `🛡️ Blocked! -${Math.round(reducedDmg)}`,
            0xaaaaaa
          );
          this.applyPlayerHpReduction(reducedDmg, dir);

          if (shield.perfectEffect === "dragon" || shield.id === "spiked") {
            const reflectVal = dmg * 0.35;
            const room = this.rooms.get(this.activeRoomKey);
            if (room) {
              const hitEnemy = room.enemies.find(
                (e) =>
                  !e.isDead &&
                  e.mesh.position.distanceTo(this.playerGroup.position) < 3.0
              );
              if (hitEnemy) {
                this.damageEnemy(
                  hitEnemy,
                  reflectVal,
                  3.0,
                  new THREE.Vector2(-dir.x, -dir.y)
                );
              }
            }
          }
          return;
        }
      }
    }

    audio.playHurt();
    let finalDmg = dmg;
    if (this.toughnessDuration > 0) finalDmg *= 0.5;

    this.spawnDamageText(`-${Math.round(finalDmg)}`, 0xff4757);
    this.spawnParticleExplosion(
      this.playerGroup.position.x,
      0.8,
      this.playerGroup.position.z,
      0xff0000,
      10
    );
    this.applyPlayerHpReduction(finalDmg, dir);
  }

  private applyPlayerHpReduction(dmg: number, dir: THREE.Vector2) {
    if (this.tempShieldHp > 0) {
      this.tempShieldHp -= dmg;
      if (this.tempShieldHp < 0) {
        this.playerHp += this.tempShieldHp;
        this.tempShieldHp = 0;
      }
    } else {
      this.playerHp -= dmg;
    }

    this.playerBody.applyImpulse(
      {
        x: dir.x * 4.0 * this.playerBody.mass(),
        y: dir.y * 4.0 * this.playerBody.mass(),
      },
      true
    );

    if (this.playerHp <= 0) {
      this.playerHp = 0;
      this.triggerPlayerDeath();
    }
  }

  private triggerPlayerDeath() {
    audio.playDeath();
    this.setGameState("GAMEOVER");

    this.triggerPlayerRagdoll();
  }

  private triggerPlayerRagdoll() {
    const rx = this.playerGroup.position.x;
    const rz = this.playerGroup.position.z;

    this.scene.remove(this.playerGroup);

    const bestW = WEAPONS[this.equippedWeapon]?.name || "Fists";
    const bestS = SHIELDS[this.equippedShield]?.name || "None";
    this.statBestItemName = `${bestW} & ${bestS}`;

    const parts = [
      {
        name: "head",
        geo: new THREE.SphereGeometry(0.32, 5, 5),
        col: 0xcdcfd4,
        y: 1.45,
      },
      {
        name: "torso",
        geo: new THREE.CylinderGeometry(0.35, 0.4, 0.9, 5),
        col: 0x1e3f66,
        y: 0.8,
      },
      {
        name: "handL",
        geo: new THREE.SphereGeometry(0.14, 4, 4),
        col: 0x1e3f66,
        y: 0.75,
      },
      {
        name: "handR",
        geo: new THREE.SphereGeometry(0.14, 4, 4),
        col: 0x1e3f66,
        y: 0.75,
      },
      {
        name: "footL",
        geo: new THREE.SphereGeometry(0.15, 4, 4),
        col: 0x222222,
        y: 0.1,
      },
      {
        name: "footR",
        geo: new THREE.SphereGeometry(0.15, 4, 4),
        col: 0x222222,
        y: 0.1,
      },
    ];

    parts.forEach((p) => {
      const mat = new THREE.MeshStandardMaterial({
        color: p.col,
        roughness: 0.7,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(p.geo, mat);
      mesh.position.set(
        rx + (Math.random() * 0.2 - 0.1),
        p.y,
        rz + (Math.random() * 0.2 - 0.1)
      );
      mesh.castShadow = true;
      this.scene.add(mesh);

      const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
      bodyDesc.setTranslation(mesh.position.x, mesh.position.z);
      bodyDesc.setLinearDamping(2.0);
      bodyDesc.setAngularDamping(2.0);
      const rBody = this.world.createRigidBody(bodyDesc);

      const colDesc = this.RAPIER.ColliderDesc.ball(0.2);
      this.world.createCollider(colDesc, rBody);

      const speed = 6.0;
      const angle = Math.random() * Math.PI * 2;
      rBody.setLinvel(
        { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        true
      );

      this.ragdollParts.push({
        mesh,
        body: rBody,
        y: p.y,
        vy: Math.random() * 5.0 + 4.0,
        rotSpeed: new THREE.Vector3(
          Math.random() * 8 - 4,
          Math.random() * 8 - 4,
          Math.random() * 8 - 4
        ),
        life: 5.0,
        maxLife: 5.0,
      });
    });

    if (this.equippedWeapon) {
      const wMesh = createWeaponMesh(this.equippedWeapon);
      this.spawnTumbledObject(wMesh, rx, rz, 0.75);
    }
    if (this.equippedShield) {
      const sMesh = createShieldMesh(this.equippedShield);
      this.spawnTumbledObject(sMesh, rx, rz, 0.75);
    }
  }

  private triggerEnemyRagdoll(enemy: Enemy, dir: THREE.Vector2) {
    const rx = enemy.mesh.position.x;
    const rz = enemy.mesh.position.z;

    this.scene.remove(enemy.mesh);
    this.world.removeRigidBody(enemy.body);

    const bodyColor = enemy.mesh.getObjectByName("torso")
      ? (
          (enemy.mesh.getObjectByName("torso") as THREE.Mesh)
            .material as THREE.MeshStandardMaterial
        ).color.getHex()
      : 0x228b22;

    const parts = [
      {
        name: "head",
        geo: new THREE.SphereGeometry(0.28, 4, 4),
        col: bodyColor,
        y: 1.3,
      },
      {
        name: "torso",
        geo: new THREE.CylinderGeometry(0.28, 0.32, 0.7, 4),
        col: bodyColor,
        y: 0.7,
      },
    ];

    if (enemy.type !== 6) {
      parts.push(
        {
          name: "handL",
          geo: new THREE.SphereGeometry(0.12, 4, 4),
          col: bodyColor,
          y: 0.75,
        },
        {
          name: "handR",
          geo: new THREE.SphereGeometry(0.12, 4, 4),
          col: bodyColor,
          y: 0.75,
        },
        {
          name: "footL",
          geo: new THREE.SphereGeometry(0.14, 4, 4),
          col: 0x222222,
          y: 0.1,
        },
        {
          name: "footR",
          geo: new THREE.SphereGeometry(0.14, 4, 4),
          col: 0x222222,
          y: 0.1,
        }
      );
    }

    parts.forEach((p) => {
      const mat = new THREE.MeshStandardMaterial({
        color: p.col,
        roughness: 0.8,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(p.geo, mat);
      mesh.position.set(
        rx + (Math.random() * 0.2 - 0.1),
        p.y,
        rz + (Math.random() * 0.2 - 0.1)
      );
      mesh.castShadow = true;
      this.scene.add(mesh);

      const rBodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
      rBodyDesc.setTranslation(mesh.position.x, mesh.position.z);
      rBodyDesc.setLinearDamping(2.5);
      rBodyDesc.setAngularDamping(2.5);
      const rBody = this.world.createRigidBody(rBodyDesc);

      const colDesc = this.RAPIER.ColliderDesc.ball(0.18);
      this.world.createCollider(colDesc, rBody);

      const angle = Math.atan2(dir.y, dir.x) + (Math.random() * 1.2 - 0.6);
      const speed = Math.random() * 5.0 + 3.5;
      rBody.setLinvel(
        { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        true
      );

      this.ragdollParts.push({
        mesh,
        body: rBody,
        y: p.y,
        vy: Math.random() * 4.0 + 3.0,
        rotSpeed: new THREE.Vector3(
          Math.random() * 10 - 5,
          Math.random() * 10 - 5,
          Math.random() * 10 - 5
        ),
        life: 4.0,
        maxLife: 4.0,
      });
    });

    if (enemy.type === 8) {
      this.spawnParticleExplosion(rx, 1.0, rz, 0xffd700, 30);
      this.spawnDamageText("👑 DUNGEON CONQUERED!", 0xffd700, rx, rz);

      setTimeout(() => {
        this.setGameState("VICTORY");
      }, 2500);
    }
  }

  private spawnTumbledObject(
    group: THREE.Group,
    rx: number,
    rz: number,
    startY: number
  ) {
    group.position.set(rx, startY, rz);
    this.scene.add(group);

    const rBodyDesc = this.RAPIER.RigidBodyDesc.dynamic();
    rBodyDesc.setTranslation(rx, rz);
    rBodyDesc.setLinearDamping(2.0);
    const rBody = this.world.createRigidBody(rBodyDesc);

    const colDesc = this.RAPIER.ColliderDesc.ball(0.25);
    this.world.createCollider(colDesc, rBody);

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4.0 + 3.0;
    rBody.setLinvel(
      { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      true
    );

    this.ragdollParts.push({
      mesh: group,
      body: rBody,
      y: startY,
      vy: Math.random() * 4.0 + 3.0,
      rotSpeed: new THREE.Vector3(
        Math.random() * 8 - 4,
        Math.random() * 8 - 4,
        Math.random() * 8 - 4
      ),
      life: 5.0,
      maxLife: 5.0,
    });
  }

  private updateRagdollParts(dt: number) {
    this.ragdollParts.forEach((part) => {
      part.life -= dt;

      part.vy -= 9.8 * dt;
      part.y += part.vy * dt;

      if (part.y < 0) {
        part.y = 0;
        part.vy = -part.vy * 0.45;
        if (Math.abs(part.vy) < 0.6) {
          part.vy = 0;
        }
      }

      part.mesh.rotation.x += part.rotSpeed.x * dt;
      part.mesh.rotation.y += part.rotSpeed.y * dt;
      part.mesh.rotation.z += part.rotSpeed.z * dt;

      part.rotSpeed.multiplyScalar(0.95);

      const pos = part.body.translation();
      part.mesh.position.set(pos.x, part.y, pos.y);

      if (part.life < 1.0) {
        part.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.transparent = true;
            mat.opacity = part.life;
          }
        });
      }
    });

    this.ragdollParts = this.ragdollParts.filter((part) => {
      if (part.life <= 0) {
        this.world.removeRigidBody(part.body);
        this.scene.remove(part.mesh);
        return false;
      }
      return true;
    });
  }

  private spawnParticleExplosion(
    x: number,
    y: number,
    z: number,
    color: number,
    count = 10
  ) {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color: color });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);

      const vx = (Math.random() - 0.5) * 6;
      const vy = Math.random() * 5 + 3;
      const vz = (Math.random() - 0.5) * 6;

      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(vx, vy, vz),
        gravity: -9.8,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1.0,
      });
    }
  }

  private spawnSwipeParticles(
    x: number,
    z: number,
    angle: number,
    range: number,
    color: number
  ) {
    const count = 8;
    const spread = Math.PI / 3;
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshBasicMaterial({ color });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const ratio = i / (count - 1) - 0.5;
      const a = angle + ratio * spread;

      const px = x + Math.cos(a) * (range * 0.7);
      const pz = z - Math.sin(a) * (range * 0.7);

      mesh.position.set(px, 0.65, pz);
      this.scene.add(mesh);

      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(Math.cos(a) * 2.0, 1.0, -Math.sin(a) * 2.0),
        gravity: -2.0,
        life: 0.35,
        maxLife: 0.35,
      });
    }
  }

  private updateParticles(dt: number) {
    this.particles.forEach((part) => {
      part.life -= dt;
      part.velocity.y += part.gravity * dt;
      part.mesh.position.addScaledVector(part.velocity, dt);

      if (part.mesh.position.y < 0.04) {
        part.mesh.position.y = 0.04;
        part.velocity.y = -part.velocity.y * 0.3;
        part.velocity.x *= 0.8;
        part.velocity.z *= 0.8;
      }

      const scale = Math.max(0.01, part.life / part.maxLife);
      part.mesh.scale.set(scale, scale, scale);
    });

    this.particles = this.particles.filter((part) => {
      if (part.life <= 0) {
        this.scene.remove(part.mesh);
        return false;
      }
      return true;
    });
  }

  private spawnDamageText(text: string, color: number, x?: number, z?: number) {
    let px = this.playerGroup.position.x;
    let pz = this.playerGroup.position.z;
    if (x !== undefined && z !== undefined) {
      px = x;
      pz = z;
    }

    const div = document.createElement("div");
    div.className = "floating-text";
    div.style.position = "absolute";
    div.style.color = `#${color.toString(16).padStart(6, "0")}`;
    div.style.fontFamily = "var(--font-fantasy)";
    div.style.fontSize = "1.1rem";
    div.style.fontWeight = "bold";
    div.style.textShadow = "1px 1px 3px #000, 0 0 10px rgba(0,0,0,0.8)";
    div.style.pointerEvents = "none";
    div.style.transform = "translate(-50%, -50%)";
    div.innerText = text;

    document.body.appendChild(div);

    this.damageNumbers.push({
      element: div,
      x: px,
      y: 1.6,
      z: pz,
      vy: 1.8,
      life: 1.0,
    });
  }

  private updateDamageNumbers(dt: number) {
    const tempV = new THREE.Vector3();
    const widthHalf = window.innerWidth / 2;
    const heightHalf = window.innerHeight / 2;

    this.damageNumbers.forEach((num) => {
      num.life -= dt;
      num.y += num.vy * dt;

      tempV.set(num.x, num.y, num.z);
      tempV.project(this.camera);

      const sx = tempV.x * widthHalf + widthHalf;
      const sy = -tempV.y * heightHalf + heightHalf;

      num.element.style.left = `${sx}px`;
      num.element.style.top = `${sy}px`;

      num.element.style.opacity = num.life.toString();
    });

    this.damageNumbers = this.damageNumbers.filter((num) => {
      if (num.life <= 0) {
        num.element.remove();
        return false;
      }
      return true;
    });
  }

  private updateCamera(dt: number) {
    if (this.playerHp <= 0) return;

    const pPos = this.playerGroup.position;

    const offset = new THREE.Vector3(0, 18, 14);
    const targetCamPos = pPos.clone().add(offset);

    this.camera.position.lerp(targetCamPos, dt * 6.5);

    this.dirLight.position.set(pPos.x + 12, 25, pPos.z + 8);
    this.dirLight.target = this.playerGroup;
  }

  private triggerRoomClearedBanner() {
    const banner = document.getElementById("alert-banner");
    if (!banner) return;

    banner.classList.remove("hidden");
    banner.style.opacity = "1";
    banner.style.transform = "scale(1.2)";

    setTimeout(() => {
      banner.style.opacity = "0";
      banner.style.transform = "scale(0.8)";
      setTimeout(() => {
        banner.classList.add("hidden");
      }, 500);
    }, 1500);
  }

  private render() {
    this.renderer.render(this.scene, this.camera);

    const hpBar = document.getElementById("hp-bar");
    const hpText = document.getElementById("hp-text");
    const staminaBar = document.getElementById("stamina-bar");
    const staminaText = document.getElementById("stamina-text");

    const totalHpMax = this.playerMaxHp;
    const finalHpShow = this.playerHp + this.tempShieldHp;

    if (hpBar) {
      hpBar.style.width = `${Math.min(100, (finalHpShow / totalHpMax) * 100)}%`;
      if (this.tempShieldHp > 0) {
        hpBar.style.background =
          "linear-gradient(90deg, #00ced1 0%, #ff2e63 100%)";
      } else {
        hpBar.style.background = "var(--color-hp-fill)";
      }
    }
    if (hpText) {
      hpText.innerText = `${Math.round(this.playerHp)}${this.tempShieldHp > 0 ? " (+" + Math.round(this.tempShieldHp) + ")" : ""} / ${totalHpMax}`;
    }

    if (staminaBar) {
      staminaBar.style.width = `${(this.playerStamina / this.playerMaxStamina) * 100}%`;
    }
    if (staminaText) {
      staminaText.innerText = `${Math.round(this.playerStamina)} / ${this.playerMaxStamina}`;
    }

    const roomName = document.getElementById("room-name");
    if (roomName) {
      const activeRoom = this.rooms.get(this.activeRoomKey);
      if (activeRoom) {
        if (activeRoom.depth === 0) {
          roomName.innerText = "Dungeon Entrance";
        } else if (activeRoom.depth === 5) {
          roomName.innerText = "Demon Lord's Chamber 👹";
        } else {
          roomName.innerText = `Room Level ${activeRoom.depth}`;
        }
      }
    }

    const valW = document.getElementById("val-weapon");
    if (valW && this.equippedWeapon) {
      const w = WEAPONS[this.equippedWeapon]!;
      valW.innerText = `${w.emoji} ${w.name} (+${w.power})`;
    }
    const valS = document.getElementById("val-shield");
    if (valS && this.equippedShield) {
      const s = SHIELDS[this.equippedShield]!;
      valS.innerText = `${s.emoji} ${s.name} (+${s.power})`;
    }
    const valP = document.getElementById("val-potion");
    if (valP) {
      if (this.equippedPotion) {
        const p = POTIONS[this.equippedPotion]!;
        valP.innerText = `${p.emoji} ${p.name} (x${this.potionQty})`;
      } else {
        valP.innerText = "None";
      }
    }

    this.drawMinimap();

    this.updateInteractionTriggers();
  }

  private updateInteractionTriggers() {
    const pPos = this.playerBody.translation();
    const prompt = document.getElementById("interaction-prompt");

    let closestItem: GroundItem | null = null;
    let minDist = 1.35;

    for (const item of this.groundItems) {
      const pos = item.collider.translation();
      const dx = pos.x - pPos.x;
      const dy = pos.y - pPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        closestItem = item;
      }
    }

    this.closestItemNearPlayer = closestItem;

    if (closestItem && prompt) {
      prompt.classList.remove("hidden");

      let itName = "Item";
      if (closestItem.type === "weapon")
        itName = WEAPONS[closestItem.itemType]!.name;
      if (closestItem.type === "shield")
        itName = SHIELDS[closestItem.itemType]!.name;
      if (closestItem.type === "potion")
        itName = POTIONS[closestItem.itemType]!.name;

      prompt.innerText = `Press [E] to Pick Up ${itName}`;

      const tempV = new THREE.Vector3(
        closestItem.mesh.position.x,
        0.9,
        closestItem.mesh.position.z
      );
      tempV.project(this.camera);
      const sx = tempV.x * (window.innerWidth / 2) + window.innerWidth / 2;
      prompt.style.left = `${sx}px`;
      prompt.style.bottom = "";
      prompt.style.top = `${-tempV.y * (window.innerHeight / 2) + window.innerHeight / 2 - 35}px`;
    } else {
      prompt?.classList.add("hidden");
    }
  }

  private drawMinimap() {
    const canvas = document.getElementById(
      "minimap-canvas"
    ) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "rgba(10, 10, 15, 0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pPos = this.playerBody.translation();
    const p_gx = Math.round(pPos.x / 30);
    const p_gy = Math.round(pPos.y / 30);

    const cW = canvas.width;
    const cH = canvas.height;
    const cellSize = 22;
    const spacing = 28;

    const centerCol = cW / 2;
    const centerRow = cH / 2;

    const minimapInfo = document.getElementById("minimap-info");
    if (minimapInfo) {
      minimapInfo.innerText = `Pos: (${p_gx}, ${p_gy}) | Max Level: ${this.statDeepestRoom}`;
    }

    this.rooms.forEach((room) => {
      const dgx = room.gx - p_gx;
      const dgy = room.gy - p_gy;

      const px = centerCol + dgx * spacing;
      const py = centerRow - dgy * spacing;

      if (
        px < -cellSize ||
        px > cW + cellSize ||
        py < -cellSize ||
        py > cH + cellSize
      ) {
        return;
      }

      let isRevealed = room.visited;
      if (!isRevealed) {
        const neighbors = [
          `${room.gx + 1},${room.gy}`,
          `${room.gx - 1},${room.gy}`,
          `${room.gx},${room.gy + 1}`,
          `${room.gx},${room.gy - 1}`,
        ];
        isRevealed = neighbors.some(
          (nKey) => this.rooms.get(nKey)?.visited === true
        );
      }

      if (!isRevealed) return;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 4;
      room.doors.forEach((door, dirKey) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        if (dirKey === "N") ctx.lineTo(px, py - spacing / 2 - 2);
        if (dirKey === "S") ctx.lineTo(px, py + spacing / 2 + 2);
        if (dirKey === "E") ctx.lineTo(px + spacing / 2 + 2, py);
        if (dirKey === "W") ctx.lineTo(px - spacing / 2 - 2, py);
        ctx.stroke();
      });

      if (room.gx === 0 && room.gy === 0) {
        ctx.strokeStyle = "rgba(255, 215, 0, 0.75)";
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
      }

      if (room.gx === p_gx && room.gy === p_gy) {
        ctx.fillStyle = "rgba(255, 215, 0, 0.25)";
      } else if (!room.cleared) {
        ctx.fillStyle = "rgba(220, 20, 60, 0.15)";
      } else {
        ctx.fillStyle = "rgba(100, 100, 100, 0.22)";
      }

      ctx.fillRect(px - cellSize / 2, py - cellSize / 2, cellSize, cellSize);
      ctx.strokeRect(px - cellSize / 2, py - cellSize / 2, cellSize, cellSize);

      if (room.chest && !room.chest.opened) {
        ctx.fillStyle = "rgba(255, 215, 0, 0.85)";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🎁", px, py);
      } else if (room.enemies.some((e) => !e.isDead)) {
        ctx.fillStyle = "#ff4757";
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (room.depth === 5) {
        ctx.fillStyle = "#ffaa00";
        ctx.font = "7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BOSS", px, py);
      }
    });

    const angle = this.playerGroup.rotation.y;
    ctx.save();
    ctx.translate(centerCol, centerRow);
    ctx.rotate(-angle + Math.PI / 2);

    ctx.fillStyle = "#00ffcc";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const engine = new GameEngine();

  const handleStartInteraction = () => {
    audio.playMove();
    window.removeEventListener("mousedown", handleStartInteraction);
    window.removeEventListener("keydown", handleStartInteraction);
  };
  window.addEventListener("mousedown", handleStartInteraction);
  window.addEventListener("keydown", handleStartInteraction);

  engine.start().catch((err) => {
    console.error("Failed to initialize game engine", err);
  });
});
