// Web Audio API Procedural Synthesizer for Scribble Roll

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isInitialized = false;

  // Music sequencer state
  private schedulerTimerId: number | null = null;
  private nextNoteTime = 0.0;
  private currentBeat = 0;
  private masterGain: GainNode | null = null;
  private chords = [
    [57, 60, 64, 67], // Am7: A, C, E, G
    [53, 57, 60, 64], // Fmaj7: F, A, C, E
    [48, 52, 55, 59], // Cmaj7: C, E, G, B
    [55, 59, 62, 65], // G7: G, B, D, F
  ];
  private currentChordIndex = 0;

  // Rolling sound state
  private rollSource: AudioBufferSourceNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;

  // Adaptive music parameters
  private playerSpeed = 0;
  private playerHeight = 0; // Relative height to affect register

  constructor() {}

  public init() {
    if (this.isInitialized) return;

    // Create audio context
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("Web Audio API is not supported in this browser.");
      return;
    }

    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6; // Moderate master volume
    this.masterGain.connect(this.ctx.destination);

    // Create White Noise Buffer for roll and whoosh effects
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2; // 2 seconds
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    // Start rolling sound loop
    this.initRollingSound();

    // Start procedural music sequencer
    this.nextNoteTime = this.ctx.currentTime;
    this.startSequencer();

    this.isInitialized = true;
  }

  // Resume context if suspended by browser autoplay policy
  public async resume() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  // Set marble speed and height to dynamically alter the procedural music/SFX
  public updateState(speed: number, height: number) {
    this.playerSpeed = speed;
    this.playerHeight = height;

    if (!this.ctx || this.ctx.state !== "running") return;

    // Update rolling volume and filter cutoff
    if (this.rollGain && this.rollFilter) {
      // Scale roll volume by speed (caps at speed = 30)
      const clampedSpeed = Math.min(speed, 30);
      const targetVolume = clampedSpeed > 0.1 ? (clampedSpeed / 30) * 0.15 : 0;
      this.rollGain.gain.setTargetAtTime(
        targetVolume,
        this.ctx.currentTime,
        0.1
      );

      // Pitch/cutoff goes up as ball rolls faster
      const cutoff = 150 + clampedSpeed * 35;
      this.rollFilter.frequency.setTargetAtTime(
        cutoff,
        this.ctx.currentTime,
        0.15
      );
    }
  }

  // INITIALIZE CONTINUOUS ROLLING SOUND
  private initRollingSound() {
    if (!this.ctx || !this.noiseBuffer) return;

    // Source node from noise buffer
    this.rollSource = this.ctx.createBufferSource();
    this.rollSource.buffer = this.noiseBuffer;
    this.rollSource.loop = true;

    // Lowpass filter to simulate rumble
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = "lowpass";
    this.rollFilter.frequency.value = 180;
    this.rollFilter.Q.value = 1.0;

    // Gain node for volume
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0.0;

    // Connect
    this.rollSource.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(this.masterGain!);

    this.rollSource.start(0);
  }

  // PROCEDURAL MUSIC SEQUENCER (Clock)
  private startSequencer() {
    const scheduler = () => {
      if (!this.ctx) return;
      // Schedule notes 100ms in advance
      while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
        this.scheduleNextBeat(this.currentBeat, this.nextNoteTime);
        this.advanceBeat();
      }
      this.schedulerTimerId = requestAnimationFrame(scheduler);
    };
    scheduler();
  }

  private advanceBeat() {
    if (!this.ctx) return;

    // Adapt tempo dynamically based on speed: base tempo = 120BPM, speed increases BPM
    const speedBonus = Math.min(this.playerSpeed, 25) * 4.5;
    const bpm = 110 + speedBonus;
    const secondsPerBeat = 60.0 / bpm / 2; // Eighth notes

    this.nextNoteTime += secondsPerBeat;
    this.currentBeat = (this.currentBeat + 1) % 16; // 16-beat cycle
  }

  private scheduleNextBeat(beat: number, time: number) {
    if (!this.ctx || !this.masterGain) return;

    // Every 16 beats (two bars), change the chord progression index
    if (beat === 0) {
      this.currentChordIndex =
        (this.currentChordIndex + 1) % this.chords.length;
    }

    const chord = this.chords[this.currentChordIndex];
    if (!chord) return;

    // 1. Play Soft Pad / Chord Harmony on beat 0 and 8
    if (beat === 0 || beat === 8) {
      chord.forEach((midiNote) => {
        // Pad osc: triangle wave for warmth
        this.playSynthPad(midiNote - 12, time, 1.8); // 1 octave down
      });
    }

    // 2. Play Bass note on beat 0, 4, 8, 12
    if (beat % 4 === 0) {
      const rootNote = (chord[0] ?? 60) - 24; // 2 octaves down
      this.playBassNote(rootNote, time, 0.4);
    }

    // 3. Procedural pentatonic melody generator
    // Higher speed = higher probability of melody playing
    const melodyChance = 0.25 + Math.min(this.playerSpeed, 20) * 0.02;
    if (Math.random() < melodyChance && beat % 2 === 0) {
      // Pick a random note from the chord pentatonic scale
      const chordNote = chord[Math.floor(Math.random() * chord.length)];
      if (chordNote !== undefined) {
        // Pitch register scales with height (shift octaves based on height)
        // Height map: standard tiles are at y=0 to y=30. Higher height -> higher octave.
        let octaveShift = 0;
        if (this.playerHeight > 25) octaveShift = 12;
        else if (this.playerHeight < 5) octaveShift = -12;

        this.playMelodyNote(chordNote + octaveShift, time, 0.35);
      }
    }
  }

  // SYNTH VOICE: Harmonic Pad
  private playSynthPad(midiNote: number, time: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    const freq = this.midiToFreq(midiNote);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration);

    // Fade in and out slowly
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.04, time + 0.3);
    gain.gain.setValueAtTime(0.04, time + duration - 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // SYNTH VOICE: Bass
  private playBassNote(midiNote: number, time: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(this.midiToFreq(midiNote), time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(120, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // SYNTH VOICE: Pluck Melody
  private playMelodyNote(midiNote: number, time: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Use a pleasant blend of triangle and sine by scheduling triangle with high filter decay
    osc.type = "triangle";
    osc.frequency.setValueAtTime(this.midiToFreq(midiNote), time);

    // High frequency pluck decaying quickly
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2500, time);
    filter.frequency.exponentialRampToValueAtTime(500, time + 0.1);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.06, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // ==========================================
  // PROCEDURAL SOUND EFFECTS (SFX)
  // ==========================================

  // Whoosh sound for Dashing
  public playDashSFX() {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;

    const time = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    // Sweep bandpass frequency upwards rapidly
    filter.frequency.setValueAtTime(300, time);
    filter.frequency.exponentialRampToValueAtTime(2200, time + 0.22);
    filter.Q.setValueAtTime(2.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.35, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start(time);
    source.stop(time + 0.4);
  }

  // Collision with obstacles
  public playHitSFX(intensity: number) {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;

    const time = ctx.currentTime;
    // Map volume based on collision intensity
    const volume = Math.min(intensity * 0.05, 0.22);
    if (volume < 0.01) return; // Too soft to play

    // High-pitched glass clink (metallic bell resonance)
    const freq1 = 1700 + Math.random() * 120;
    const freq2 = 2300 + Math.random() * 120;

    const freqs = [freq1, freq2];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);

      // Fast attack, swift exponential decay
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(
        volume * (idx === 0 ? 0.35 : 0.18),
        time + 0.002
      );
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(time);
      osc.stop(time + 0.14);
    });

    // Add wooden shatter tick if hitting hard
    if (intensity > 4.5 && this.noiseBuffer) {
      const snapSource = ctx.createBufferSource();
      snapSource.buffer = this.noiseBuffer;

      const snapFilter = ctx.createBiquadFilter();
      snapFilter.type = "highpass";
      snapFilter.frequency.setValueAtTime(1600, time);

      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(volume * 0.25, time);
      snapGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      snapSource.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(this.masterGain);

      snapSource.start(time);
      snapSource.stop(time + 0.06);
    }
  }

  // Wooden Box smash/crates break
  public playSmashSFX() {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;

    const time = this.ctx.currentTime;

    // Simulate wood shattering by scheduling multiple rapid noise bursts
    const numBursts = 4;
    for (let i = 0; i < numBursts; i++) {
      const burstTime = time + i * 0.035;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      // Each piece has a slightly different resonance frequency
      const freq = 600 + Math.random() * 800;
      filter.frequency.setValueAtTime(freq, burstTime);
      filter.Q.setValueAtTime(1.5, burstTime);

      const gain = this.ctx.createGain();
      // Decay multiplier
      const burstVolume = 0.15 * Math.pow(0.7, i);
      gain.gain.setValueAtTime(burstVolume, burstTime);
      gain.gain.exponentialRampToValueAtTime(0.001, burstTime + 0.08);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      source.start(burstTime);
      source.stop(burstTime + 0.09);
    }
  }

  // Button Switch activation
  public playClickSFX() {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;

    const time = ctx.currentTime;

    // Two high-pitch sine wave beeps
    const freqs = [880, 1320];
    freqs.forEach((freq, idx) => {
      const startTime = time + idx * 0.03;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.07);
    });
  }

  // Gate sliding / grinding sound (continuous but short)
  public playGateSFX() {
    if (!this.ctx || !this.masterGain) return;

    const time = this.ctx.currentTime;
    const duration = 1.0;

    // Low mechanical rumble
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(90, time);
    // Add frequency wobble (mechanical vibration)
    osc.frequency.linearRampToValueAtTime(110, time + duration / 2);
    osc.frequency.linearRampToValueAtTime(90, time + duration);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(150, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.15);
    gain.gain.setValueAtTime(0.18, time + duration - 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // Launcher trampoline trigger
  public playLaunchSFX() {
    if (!this.ctx || !this.masterGain) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    // Pitch ramps up quickly: boing!
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(750, time + 0.18);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  // Checkpoint Chime (Pentatonic sparkly sweep)
  public playChimeSFX() {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;

    const time = ctx.currentTime;
    // C Major/Pentatonic notes: C6, E6, G6, C7
    const midiNotes = [84, 88, 91, 96];

    midiNotes.forEach((midi, idx) => {
      const noteTime = time + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(this.midiToFreq(midi), noteTime);

      filter.type = "highpass";
      filter.frequency.setValueAtTime(300, noteTime);

      // Create a nice delay ring
      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.09, noteTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.65);
    });
  }

  // Cleanup/Stop sequencer
  public stop() {
    if (this.schedulerTimerId) {
      cancelAnimationFrame(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    if (this.rollSource) {
      try {
        this.rollSource.stop();
      } catch (_err) {
        // ignore
      }
      this.rollSource = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.isInitialized = false;
  }

  // Helper: Convert MIDI note number to Frequency (Hz)
  private midiToFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }
}

// Export singleton instance
export const audio = new AudioEngine();
