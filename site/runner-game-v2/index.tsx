// Main orchestrator and game loop for Scribble Roll
import { audio } from "./audio";
import { physics } from "./physics";
import { graphics } from "./graphics";
import { levelManager } from "./wfc";

// Game State Enum
enum GameState {
  LOADING,
  MENU,
  PLAYING,
  PAUSED,
  GAMEOVER,
}

class GameController {
  private state: GameState = GameState.LOADING;
  private canvas!: HTMLCanvasElement;
  private lastTime = 0;

  // Stats
  private distance = 0;
  private maxDistance = 0;
  private chimesCount = 0;

  // Keyboard controls
  private keys: Record<string, boolean> = {};

  // Dash cooldowns
  private dashCooldown = 0.0; // in seconds
  private maxDashCooldown = 1.0;

  constructor() {}

  public async init() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    if (!this.canvas) {
      console.error("Canvas element not found!");
      return;
    }

    // Set progress bar to 30%
    this.updateProgressBar(30);

    // 1. Initialize Graphics
    graphics.init(this.canvas);
    this.updateProgressBar(60);

    // 2. Initialize Physics
    try {
      await physics.init();
    } catch (err) {
      console.error("Failed to initialize physics engine:", err);
      return;
    }
    this.updateProgressBar(90);

    // 3. Initialize Level Manager
    levelManager.init();

    // Set up window resize listener
    window.addEventListener("resize", () => {
      graphics.resize(window.innerWidth, window.innerHeight);
    });

    // 4. Hook up physics callbacks
    physics.onCollision = (intensity) => {
      audio.playHitSFX(intensity);
    };
    physics.onButtonPressed = (gateId) => {
      physics.openGate(gateId);
      audio.playClickSFX();
      audio.playGateSFX();
    };
    physics.onTrampolineTriggered = () => {
      audio.playLaunchSFX();
      if (physics.playerBody) {
        const pos = physics.playerBody.translation();
        graphics.emitDashParticles(pos.x, pos.y, true);
      }
    };
    physics.onChimeCollected = () => {
      audio.playChimeSFX();
      this.chimesCount++;
      const hudChimes = document.getElementById("hud-chimes");
      if (hudChimes) {
        hudChimes.innerText = this.chimesCount.toString();
      }
      if (physics.playerBody) {
        const pos = physics.playerBody.translation();
        graphics.emitChimeParticles(pos.x, pos.y);
      }
    };

    // 5. Setup Keyboard Event Listeners
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));

    // Show audio consent initialize button
    this.updateProgressBar(100);
    const progress = document.getElementById("loading-progress");
    if (progress) progress.style.width = "100%";

    const btnConsent = document.getElementById("btn-consent");
    const loadingSub = document.querySelector(
      "#loading-overlay .game-subtitle"
    ) as HTMLParagraphElement;
    if (btnConsent) {
      btnConsent.classList.remove("hidden");
      btnConsent.addEventListener("click", () => this.handleConsentInit());
    }
    if (loadingSub) {
      loadingSub.innerText =
        "Click below to initialize Web Audio and start sketches!";
    }

    // Bind menu buttons
    const btnStart = document.getElementById("btn-start");
    if (btnStart) {
      btnStart.addEventListener("click", () => this.startGame());
    }

    const btnResume = document.getElementById("btn-resume");
    if (btnResume) {
      btnResume.addEventListener("click", () => this.togglePause());
    }

    const btnRestart = document.getElementById("btn-restart");
    if (btnRestart) {
      btnRestart.addEventListener("click", () => this.restartGame());
    }

    // Start tick
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.tick(t));
  }

  private updateProgressBar(percent: number) {
    const progress = document.getElementById("loading-progress");
    if (progress) {
      progress.style.width = `${percent}%`;
    }
  }

  // Handle browser audio context consent initialization
  private handleConsentInit() {
    // Resume audio context
    void audio.resume();

    // Play start chime
    audio.playChimeSFX();

    // Transition loading -> menu
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) loadingOverlay.classList.add("hidden");

    this.state = GameState.MENU;
  }

  // Transitions menu -> playing
  private startGame() {
    const menuOverlay = document.getElementById("menu-overlay");
    if (menuOverlay) menuOverlay.classList.add("hidden");

    const hud = document.getElementById("hud");
    if (hud) hud.classList.remove("hidden");

    this.state = GameState.PLAYING;
  }

  // Pause toggle
  private togglePause() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
      const pauseOverlay = document.getElementById("pause-overlay");
      if (pauseOverlay) pauseOverlay.classList.remove("hidden");
    } else if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
      const pauseOverlay = document.getElementById("pause-overlay");
      if (pauseOverlay) pauseOverlay.classList.add("hidden");
    }
  }

  // Restart after death
  private restartGame() {
    const gameoverOverlay = document.getElementById("gameover-overlay");
    if (gameoverOverlay) gameoverOverlay.classList.add("hidden");

    // 1. Reset metrics
    this.distance = 0;
    this.maxDistance = 0;
    this.chimesCount = 0;
    this.dashCooldown = 0.0;

    const hudChimes = document.getElementById("hud-chimes");
    if (hudChimes) hudChimes.innerText = "0";

    // 2. Clear WFC level map and reload starting tiles
    levelManager.destroy();
    levelManager.init();

    // 3. Reset player body position in physics
    physics.resetPlayer();

    // 4. Start play
    this.state = GameState.PLAYING;
  }

  // Input Handlers
  private handleKeyDown(e: KeyboardEvent) {
    const key = e.code;
    this.keys[key] = true;

    if (key === "Escape" || key === "KeyP") {
      this.togglePause();
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    const key = e.code;
    this.keys[key] = false;
  }

  // Main Loop Tick
  private tick(now: number) {
    // Delta time in seconds
    const dt = (now - this.lastTime) / 1000.0;
    this.lastTime = now;

    // Tick game engine depending on state
    if (this.state === GameState.PLAYING) {
      this.updatePlaying(dt);
    } else {
      // Just update graphics outlining (keep sketches vibrating on menu/pause screens)
      graphics.update(dt);
      graphics.renderer.render(graphics.scene, graphics.camera);
    }

    requestAnimationFrame((t) => this.tick(t));
  }

  // Update logic when active playing
  private updatePlaying(dt: number) {
    if (!physics.playerBody) return;

    // 1. Update dash cooldown
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }

    // 2. Apply player inputs
    this.processPlayerInputs();

    // 3. Step physics simulation
    physics.step(dt);

    // 4. Get player position and speed
    const pos = physics.playerBody.translation();
    const vel = physics.playerBody.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

    // 5. Update audio engine (BPM and filter lowpass based on speed & height)
    audio.updateState(speed, pos.y);

    // 6. Update procedural level collapse loading/unloading
    levelManager.update(pos.x, pos.y);

    // 7. Update HUD metrics
    this.distance = Math.max(0, Math.floor(pos.x));
    if (this.distance > this.maxDistance) {
      this.maxDistance = this.distance;
    }

    const hudDistance = document.getElementById("hud-distance");
    if (hudDistance) {
      hudDistance.innerText = `${this.distance}m`;
    }

    const hudSpeed = document.getElementById("hud-speed");
    if (hudSpeed) {
      hudSpeed.innerText = `${Math.floor(speed)} m/s`;
    }

    // 8. Death check (fell off margins - Y coordinate drops below -16 units)
    if (pos.y < -16.0) {
      this.handleGameOver();
      return;
    }

    // 9. Sync player sphere mesh position (special visual handle)
    let pGroup = graphics.getObjectMesh(physics.playerBody.handle);
    if (!pGroup) {
      pGroup = graphics.createPlayerMesh(0.8);
      graphics.setObjectMesh(physics.playerBody.handle, pGroup);
    }
    // Update player mesh
    pGroup.position.set(pos.x, pos.y, 0);
    // Rotate ball texture around Z axis corresponding to 2D rotation of physics body
    const sphereMesh = pGroup.children[0];
    if (sphereMesh) {
      sphereMesh.rotation.z = physics.playerBody.rotation();
    }

    // 10. Direct Camera to follow the player marble smoothly (lerp tracking)
    // Camera is positioned at fixed distance Z=22
    const targetCamX = pos.x + 5.0; // Offset camera slightly ahead of player to see upcoming hurdles
    const targetCamY = pos.y + 1.5;

    graphics.camera.position.x +=
      (targetCamX - graphics.camera.position.x) * 0.065;
    graphics.camera.position.y +=
      (targetCamY - graphics.camera.position.y) * 0.065;

    // 11. Tick graphics updates (particles, vibrating lines) and Render frame
    graphics.update(dt);
    graphics.renderer.render(graphics.scene, graphics.camera);
  }

  // Controls mapper
  private processPlayerInputs() {
    if (!physics.playerBody) return;

    // Reset accumulated forces/torques each tick
    physics.playerBody.resetForces(true);
    physics.playerBody.resetTorques(true);

    const gravitySign = physics.getGravityY() > 0 ? -1.0 : 1.0;

    // Horizontal rolling forces
    // Roll Right (D or ArrowRight)
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) {
      // Apply clockwise torque (inverted if on ceiling to maintain rolling direction)
      physics.playerBody.addTorque(-4.2 * gravitySign, true);
      // Apply horizontal rolling force
      physics.playerBody.addForce({ x: 20.0, y: 0.0 }, true);
    }

    // Roll Left / Brake (A or ArrowLeft)
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) {
      // Apply counter-clockwise torque (inverted if on ceiling)
      physics.playerBody.addTorque(4.2 * gravitySign, true);
      // Apply horizontal force left
      physics.playerBody.addForce({ x: -20.0, y: 0.0 }, true);
    }

    // Dashing triggers (Shift for backward dash, Space for forward dash)
    if (this.dashCooldown <= 0.0) {
      const pos = physics.playerBody.translation();

      // Dash Forwards (Space)
      if (this.keys["Space"]) {
        // Apply massive horizontal impulse and ceiling-relative lift
        physics.playerBody.setLinvel(
          { x: Math.max(physics.playerBody.linvel().x, 0.0), y: 0.0 },
          true
        );
        physics.playerBody.applyImpulse(
          { x: 28.0, y: 3.5 * gravitySign },
          true
        );

        // Trigger effects
        audio.playDashSFX();
        graphics.emitDashParticles(pos.x, pos.y, true);

        // Lock dash
        this.dashCooldown = this.maxDashCooldown;
        this.keys["Space"] = false; // consume input
      }

      // Dash Backwards (ShiftLeft or ShiftRight)
      else if (this.keys["ShiftLeft"] || this.keys["ShiftRight"]) {
        // Apply impulse left
        physics.playerBody.setLinvel(
          { x: Math.min(physics.playerBody.linvel().x, 0.0), y: 0.0 },
          true
        );
        physics.playerBody.applyImpulse(
          { x: -28.0, y: 3.5 * gravitySign },
          true
        );

        audio.playDashSFX();
        graphics.emitDashParticles(pos.x, pos.y, false);

        this.dashCooldown = this.maxDashCooldown;
        this.keys["ShiftLeft"] = false;
        this.keys["ShiftRight"] = false;
      }
    }
  }

  // Handle out of bounds death
  private handleGameOver() {
    this.state = GameState.GAMEOVER;

    // Mute rolling sound
    audio.updateState(0, 0);

    // Hide HUD overlay
    const hud = document.getElementById("hud");
    if (hud) hud.classList.add("hidden");

    // Display final stats
    const summaryDistance = document.getElementById("summary-distance");
    if (summaryDistance) {
      summaryDistance.innerText = `${this.maxDistance}m`;
    }

    const summaryChimes = document.getElementById("summary-chimes");
    if (summaryChimes) {
      summaryChimes.innerText = this.chimesCount.toString();
    }

    // Slide in gameover menu overlay
    const gameoverOverlay = document.getElementById("gameover-overlay");
    if (gameoverOverlay) {
      gameoverOverlay.classList.remove("hidden");
    }
  }
}

// Start game controller on page load
window.addEventListener("DOMContentLoaded", () => {
  const controller = new GameController();
  controller.init().catch((err) => console.error(err));
});
