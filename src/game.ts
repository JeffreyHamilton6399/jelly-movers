import { World, PHYS } from './physics/world';
import { Blob, BLOB } from './entities/blob';
import { Furniture } from './entities/furniture';
import { InputManager, type PlayerInput } from './input/input';
import { buildLevel, type LevelData } from './level/level';
import { Camera } from './render/camera';
import { Particles } from './render/particles';
import { Renderer } from './render/renderer';
import { SoundFX } from './audio/audio';
import { PLAYERS, ROUND_TIME, type Phase, type RoundResult } from './types';

const MAX_STEPS_PER_FRAME = 4;
const CHIP_COLORS = { box: '#B48A57', couch: '#5E857E', piano: '#433540', lamp: '#C9A24A' };

export interface GameView {
  phase: Phase;
  timeLeft: number;
  joined: boolean[];
  delivered: number;
  total: number;
  pay: number;
  result: RoundResult | null;
}

/**
 * Orchestrates the fixed-timestep loop, rules (delivery, damage, pay, timer),
 * grabbing, and effects. UI lives in the DOM overlay and just reads GameView.
 */
export class Game {
  private ctx: CanvasRenderingContext2D;
  private world = new World();
  private level: LevelData = buildLevel();
  private blobs: Blob[] = [];
  private furniture: Furniture[] = [];
  private camera = new Camera();
  private particles = new Particles();
  private renderer: Renderer;
  private sfx = new SoundFX();
  readonly input = new InputManager();

  phase: Phase = 'menu';
  timeLeft = ROUND_TIME;
  debug = false;
  private result: RoundResult | null = null;

  private last = 0;
  private acc = 0;
  private clock = 0;
  private fps = 60;
  private cssW = 1280;
  private cssH = 720;
  private dpr = 1;
  private zonePulse = 0;
  private lastViewAt = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private onView: (v: GameView) => void
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.renderer = new Renderer(this.camera, this.particles);
    this.input.attach();
    this.input.onAnyInput = () => this.sfx.unlock();
    this.input.onSlotChange = () => {
      this.spawnJoinedBlobs();
      this.pushView();
    };
    window.addEventListener('resize', this.resize);
    this.resize();
    this.setupScene();
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.frame);
    this.pushView();
  }

  // ------------------------------------------------------------------
  // scene
  // ------------------------------------------------------------------

  private setupScene(): void {
    this.world.reset();
    this.world.statics.push(...this.level.statics);
    this.blobs = [];
    this.furniture = this.level.furnSpawns.map((f) => this.world.addBody(new Furniture(f.kind, f.x, f.y)));
    this.spawnJoinedBlobs();
  }

  /** every joined player gets a blob (in the menu too, so you can wiggle while waiting) */
  private spawnJoinedBlobs(): void {
    for (const slot of this.input.slots) {
      if (!slot.joined || this.blobs.some((b) => b.playerIndex === slot.index)) continue;
      const def = PLAYERS[slot.index];
      const sp = this.level.blobSpawns[slot.index];
      const blob = this.world.addBody(new Blob(sp.x, sp.y - 40, slot.index, def.color, def.dark, def.name));
      this.blobs.push(blob);
      this.particles.splat(sp.x, sp.y, def.color, 0.8);
      this.sfx.pop();
    }
  }

  startRound(): void {
    if (this.input.joinedCount < 1) return;
    this.phase = 'playing';
    this.timeLeft = ROUND_TIME;
    this.result = null;
    this.setupScene();
    this.pushView();
  }

  toMenu(): void {
    this.phase = 'menu';
    this.result = null;
    this.setupScene();
    this.pushView();
  }

  // ------------------------------------------------------------------
  // loop
  // ------------------------------------------------------------------

  private resize = (): void => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.camera.setViewport(this.cssW, this.cssH);
    this.camera.worldW = this.level.worldW;
    this.camera.worldH = this.level.worldH;
  };

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.clock += dt;
    this.fps += (1 / dt - this.fps) * 0.05;

    const inputs = this.input.poll();
    this.handleGlobalKeys();
    this.applyInputs(inputs);

    // fixed-timestep physics: identical feel at 30, 60 or 144 Hz
    this.acc += dt;
    let steps = 0;
    while (this.acc >= PHYS.dt && steps < MAX_STEPS_PER_FRAME) {
      this.world.step();
      this.afterStep();
      if (this.phase === 'playing') this.timeLeft -= PHYS.dt;
      this.acc -= PHYS.dt;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;

    if (this.phase === 'playing') {
      this.checkDeliveries(dt);
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRound(false);
      }
    }

    for (const b of this.blobs) b.updateFace(dt, this.world.h);
    this.particles.update(dt);
    this.zonePulse = Math.max(0, this.zonePulse - dt * 1.5);
    this.updateCamera(dt);

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.renderer.render(this.ctx, {
      cssW: this.cssW,
      cssH: this.cssH,
      time: this.clock,
      world: this.world,
      blobs: this.blobs,
      furniture: this.furniture,
      level: this.level,
      showZone: this.phase !== 'menu' || this.blobs.length > 0,
      zonePulse: this.zonePulse,
      debug: this.debug,
      fps: this.fps,
      dpr: this.dpr,
    });

    if (now - this.lastViewAt > 150) this.pushView();
  };

  private handleGlobalKeys(): void {
    if (this.input.hasEdge('F1')) this.debug = !this.debug;
    const start = this.input.startRequested || this.input.hasEdge('Enter');
    if (start && this.phase !== 'playing' && this.input.joinedCount > 0) this.startRound();
  }

  private applyInputs(inputs: (PlayerInput | null)[]): void {
    for (const b of this.blobs) {
      const inp = inputs[b.playerIndex];
      if (!inp) continue;
      b.input.moveX = inp.moveX;
      b.input.jumpHeld = inp.jumpHeld;
      if (inp.jumpQueued) b.queueJump(this.world.time);
      if (inp.grabPressed) {
        if (b.grab) {
          b.releaseGrab(this.world);
          this.sfx.pip();
        } else if (b.tryGrab(this.world)) {
          this.sfx.pop();
          const q = b.grab!.targetPos();
          this.particles.spark(q.x, q.y);
        } else {
          this.sfx.pip();
        }
      }
    }
  }

  /** effects + rules that react to what the physics did this step */
  private afterStep(): void {
    for (const b of this.blobs) {
      if (b.justJumped) {
        b.justJumped = false;
        this.sfx.boing();
        this.particles.dust(b.cx, b.maxY);
      }
      // grabs that get yanked too far pop off
      if (b.grab && b.grab.length() > BLOB.grabBreak) {
        const q = b.grab.targetPos();
        b.releaseGrab(this.world);
        this.sfx.pip();
        this.particles.spark(q.x, q.y);
      }
      if (b.hitSpeed > 360 && this.world.time - b.lastSplatAt > 0.15) {
        b.lastSplatAt = this.world.time;
        const k = Math.min(1, (b.hitSpeed - 360) / 900);
        this.sfx.squish(k);
        this.particles.splat(b.hitX, b.hitY, b.color, k);
        if (b.hitSpeed > 1000) this.camera.shake(2 + k * 4);
      }
    }
    for (const f of this.furniture) {
      if (!f.hitHard) continue;
      const dmg = f.applyHit(f.hitSpeed, this.world.time);
      if (dmg > 0 && this.phase !== 'menu') {
        this.particles.chips(f.hitX, f.hitY, CHIP_COLORS[f.type], Math.min(1, dmg / 20));
        this.sfx.thud(Math.min(1, f.hitSpeed / 1300));
        if (dmg > 8) this.camera.shake(Math.min(7, dmg * 0.3));
      } else if (this.phase === 'menu') {
        f.damage = 0;
      }
    }
  }

  private checkDeliveries(dt: number): void {
    const z = this.level.truckZone;
    let changed = false;
    for (const f of this.furniture) {
      const inside = f.cx > z.x && f.cx < z.x + z.w && f.cy > z.y && f.cy < z.y + z.h;
      const v = f.velocity(this.world.h);
      const settled = Math.hypot(v.x, v.y) < 60;
      f.inZoneFor = inside && settled ? f.inZoneFor + dt : inside ? f.inZoneFor : 0;
      const nowDelivered = inside && f.inZoneFor > 0.4;
      if (nowDelivered !== f.delivered) {
        f.delivered = nowDelivered;
        changed = true;
        if (nowDelivered) {
          this.sfx.chime();
          this.particles.confetti(f.cx, f.minY - 10);
          this.zonePulse = 1;
        }
      }
    }
    if (changed) this.pushView();
    if (this.furniture.every((f) => f.delivered)) this.endRound(true);
  }

  private endRound(win: boolean): void {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';
    const items = this.furniture.map((f) => ({
      kind: f.type,
      label: f.spec.label,
      delivered: f.delivered,
      damage: Math.round(f.damage),
      pay: f.pay,
    }));
    const basePay = items.reduce((s, i) => s + i.pay, 0);
    const timeBonus = win ? Math.round(this.timeLeft * 0.5) : 0;
    this.result = {
      win,
      items,
      delivered: items.filter((i) => i.delivered).length,
      totalDamage: Math.round(items.reduce((s, i) => s + i.damage, 0) / items.length),
      basePay,
      timeBonus,
      totalPay: basePay + timeBonus,
    };
    if (win) this.sfx.fanfare();
    else this.sfx.sad();
    this.pushView();
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'menu' || this.blobs.length === 0) {
      this.camera.followBox(this.level.menuView, dt);
      return;
    }
    const targets = this.blobs.map((b) => ({ x: b.cx, y: b.cy }));
    // keep grabbed furniture in frame too
    for (const b of this.blobs) if (b.grabbed) targets.push({ x: b.grabbed.cx, y: b.grabbed.cy });
    this.camera.followTargets(targets, dt);
  }

  private pushView(): void {
    this.lastViewAt = performance.now();
    this.onView({
      phase: this.phase,
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)),
      joined: this.input.slots.map((s) => s.joined),
      delivered: this.furniture.filter((f) => f.delivered).length,
      total: this.furniture.length,
      pay: this.furniture.reduce((s, f) => s + f.pay, 0),
      result: this.result,
    });
  }
}
