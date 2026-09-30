import { World } from './physics/world';
import { Blob, BLOB } from './entities/blob';
import { Furniture } from './entities/furniture';
import { InputManager, deviceLabel } from './input/input';
import { buildLevel, type LevelData } from './level/level';
import { Camera } from './render/camera';
import { Particles } from './render/particles';
import { Renderer, type RenderState } from './render/renderer';
import { SoundFX } from './audio/audio';
import { PLAYERS, ROUND_TIME, type GameSnapshot, type ItemSnapshot, type Phase, type ResultSnapshot, type SlotSnapshot } from './types';

const FRAME_STEPS_MAX = 5;
const WOOD_CHIP_COLORS: Record<string, string> = {
  box: '#C9A66B',
  couch: '#4E8F79',
  piano: '#43344B',
  lamp: '#C98A2B',
};

/**
 * Game orchestrator: fixed-timestep loop, rules, grabbing/carrying,
 * deliveries, damage, pay, camera and snapshot notifications for React.
 */
export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world = new World();
  private level: LevelData = buildLevel();
  private blobs: Blob[] = [];
  private furniture: Furniture[] = [];
  private camera = new Camera();
  private particles = new Particles();
  private renderer: Renderer;
  private sfx = new SoundFX();
  input = new InputManager();

  phase: Phase = 'menu';
  timeLeft = ROUND_TIME;
  debug = false;

  private raf = 0;
  private lastNow = 0;
  private acc = 0;
  private fps = 60;
  private cssW = 1280;
  private cssH = 720;
  private dpr = 1;
  private lastNotify = 0;
  private result: ResultSnapshot | null = null;
  private renderErrLogged = false;
  private onState: (s: GameSnapshot) => void;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, onState: (s: GameSnapshot) => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.onState = onState;
    this.renderer = new Renderer(this.camera, this.particles);

    this.input.attach();
    this.input.onAnyInput = () => this.sfx.unlock();
    this.input.onSlotChange = () => {
      if (this.phase === 'playing') this.spawnMissingPlayers();
      this.notify(true);
    };
    window.addEventListener('resize', this.resize);
    this.resize();
    this.buildMenuScene();
  }

  start(): void {
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.notify(true);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener('resize', this.resize);
  }

  // ------------------------------------------------------------------
  // scene setup
  // ------------------------------------------------------------------

  private freshWorld(): void {
    this.world.reset();
    for (const s of this.level.statics) this.world.addStatic(s);
    this.blobs = [];
    this.furniture = [];
    this.result = null;
  }

  private buildMenuScene(): void {
    this.freshWorld();
    this.phase = 'menu';
    for (let i = 0; i < 4; i++) {
      const def = PLAYERS[i];
      const sp = this.level.blobSpawns[i];
      const blob = new Blob(sp.x, sp.y, i, def.color, def.dark, def.name);
      this.world.addBody(blob);
      this.blobs.push(blob);
    }
    for (const f of this.level.furnSpawns) {
      this.world.addBody(new Furniture(f.kind, f.x, f.y));
    }
    // rebuild furniture list (menu demo shows all items in place)
    this.furniture = this.world.bodies
      .filter((b): b is Furniture => b instanceof Furniture)
      .map((f) => f);
  }

  startRound(): void {
    if (this.input.joinedCount < 1) return;
    this.freshWorld();
    this.phase = 'playing';
    this.timeLeft = ROUND_TIME;
    for (const slot of this.input.slots) {
      if (!slot.joined) continue;
      const def = PLAYERS[slot.index];
      const sp = this.level.blobSpawns[slot.index];
      const blob = new Blob(sp.x, sp.y, slot.index, def.color, def.dark, def.name);
      this.world.addBody(blob);
      this.blobs.push(blob);
    }
    for (const f of this.level.furnSpawns) {
      const furn = new Furniture(f.kind, f.x, f.y);
      this.world.addBody(furn);
      this.furniture.push(furn);
    }
    this.notify(true);
  }

  restart(): void {
    this.startRound();
  }

  toMenu(): void {
    this.input.resetSlots();
    this.buildMenuScene();
    this.notify(true);
  }

  /** late join during play: spawn the blob for newly joined slots */
  private spawnMissingPlayers(): void {
    for (const slot of this.input.slots) {
      if (!slot.joined) continue;
      if (this.blobs.some((b) => b.playerIndex === slot.index)) continue;
      const def = PLAYERS[slot.index];
      const sp = this.level.blobSpawns[slot.index];
      const blob = new Blob(sp.x, sp.y, slot.index, def.color, def.dark, def.name);
      this.world.addBody(blob);
      this.blobs.push(blob);
      this.particles.splat(sp.x, sp.y, def.color, 1);
    }
  }

  // ------------------------------------------------------------------
  // main loop
  // ------------------------------------------------------------------

  private resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.setViewport(w, h);
    this.camera.worldW = this.level.worldW;
    this.camera.worldH = this.level.worldH;
  };

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dtReal = Math.min(0.1, Math.max(0.001, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.fps += (1 / dtReal - this.fps) * 0.06;

    const inputs = this.input.poll();
    this.handleGlobalKeys();

    if (this.phase === 'menu') {
      this.updateDemoAI();
    } else if (this.phase === 'playing') {
      this.applyInputs(inputs);
    }

    // fixed-timestep physics
    this.acc += dtReal;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < FRAME_STEPS_MAX) {
      if (this.phase === 'playing') this.timeLeft -= 1 / 60;
      this.world.step();
      this.acc -= 1 / 60;
      steps++;
    }
    if (steps === FRAME_STEPS_MAX) this.acc = 0;

    this.processEvents();
    this.processImpacts();
    if (this.phase === 'playing') {
      this.checkDeliveries();
      this.checkGrabBreaks();
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRound(false);
      }
    }

    this.updateFaces(dtReal);
    this.particles.update(dtReal);
    this.updateCamera(dtReal);

    const state: RenderState = {
      cssW: this.cssW,
      cssH: this.cssH,
      world: this.world,
      blobs: this.blobs,
      furniture: this.furniture,
      level: this.level,
      phase: this.phase,
      debug: this.debug,
      fps: this.fps,
    };
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    try {
      this.renderer.render(this.ctx, state);
    } catch (err) {
      // never let a draw bug blank the whole canvas every frame silently
      if (!this.renderErrLogged) {
        this.renderErrLogged = true;
        console.error('[JellyMovers] render error:', err);
      }
    }
    this.notifyThrottled(now);
  };

  private handleGlobalKeys(): void {
    if (this.input.hasEdge('F1')) this.debug = !this.debug;
    if (this.phase === 'menu') {
      const spaceStart = this.input.hasEdge('Space') && this.input.slots[0].joined;
      if ((this.input.startRequested || spaceStart) && this.input.joinedCount >= 1) {
        this.startRound();
      }
    } else if (this.phase === 'ended') {
      if (this.input.startRequested || this.input.hasEdge('Enter') || this.input.hasEdge('Space')) {
        this.restart();
      }
    }
  }

  private applyInputs(inputs: (ReturnType<InputManager['poll']>)[number][]): void {
    for (const blob of this.blobs) {
      const inp = inputs[blob.playerIndex];
      if (!inp) continue;
      blob.input.moveX = inp.moveX;
      if (inp.jumpQueued) blob.input.jumpQueued = true;
      if (inp.grabPressed) {
        if (blob.grab) {
          blob.releaseGrab(this.world);
          this.sfx.pip();
          this.particles.spark(blob.centerX, blob.centerY);
        } else if (blob.tryGrab(this.world)) {
          this.sfx.pop();
          this.particles.spark(blob.centerX, blob.centerY);
        }
      }
    }
  }

  private updateDemoAI(): void {
    const t = this.world.time;
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      b.input.moveX = Math.sin(t * 0.55 + i * 2.1) * 0.85;
      if (Math.random() < 0.004) b.input.jumpQueued = true;
      if (b.grab && Math.random() < 0.01) b.releaseGrab(this.world);
      else if (!b.grab && Math.random() < 0.006) b.tryGrab(this.world);
    }
  }

  private processEvents(): void {
    for (const e of this.world.events) {
      if (e.type === 'jump') {
        this.sfx.boing();
      }
    }
    this.world.events.length = 0;
  }

  private processImpacts(): void {
    for (const imp of this.world.impacts) {
      const { speed } = imp;
      // furniture damage
      for (const body of [imp.body, imp.other]) {
        if (body instanceof Furniture) {
          const added = body.applyImpact(speed, this.world.time);
          if (added > 0) {
            const col = WOOD_CHIP_COLORS[body.kind] ?? '#C9A66B';
            this.particles.chips(imp.x, imp.y, col, Math.min(1, speed / 1100));
            this.sfx.thud(Math.min(1, speed / 1400));
            if (speed > 900) this.camera.shake(Math.min(9, (speed - 900) / 130));
          }
        }
      }
      // blob squish feedback
      const blob =
        imp.body instanceof Blob
          ? imp.body
          : imp.other instanceof Blob
            ? imp.other
            : null;
      if (blob && speed > 340) {
        const strength = Math.min(1, (speed - 340) / 800);
        this.sfx.squish(strength);
        this.particles.splat(imp.x, imp.y, blob.color, strength);
        if (speed > 820) this.camera.shake(Math.min(7, (speed - 820) / 150));
      }
    }
    this.world.impacts.length = 0;
  }

  private checkDeliveries(): void {
    const z = this.level.truckZone;
    for (const f of this.furniture) {
      if (f.delivered) continue;
      const cx = f.centerX;
      const cy = f.centerY;
      const inside =
        cx > z.x &&
        cx < z.x + z.w &&
        cy > z.y &&
        cy < z.y + z.h;
      if (inside && f.avgSpeed(this.world.h) < 160) {
        f.delivered = true;
        f.deliveredAt = this.world.time;
        this.sfx.chime();
        this.particles.confetti(cx, cy - 10);
        this.notify(true);
      }
    }
    if (this.furniture.length > 0 && this.furniture.every((f) => f.delivered)) {
      this.endRound(true);
    }
  }

  private checkGrabBreaks(): void {
    for (const b of this.blobs) {
      if (b.grab && b.grabLength > BLOB.grabBreak) {
        b.releaseGrab(this.world);
        this.sfx.pip();
        this.particles.spark(b.centerX, b.centerY);
      }
    }
  }

  private endRound(win: boolean): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const basePay = this.furniture.reduce((s, f) => s + f.pay, 0);
    const timeBonus = win ? Math.round(this.timeLeft * 0.5) : 0;
    this.result = {
      win,
      timeUsed: Math.round(ROUND_TIME - this.timeLeft),
      basePay,
      timeBonus,
      totalPay: basePay + timeBonus,
    };
    if (win) this.sfx.fanfare();
    else this.sfx.sad();
    this.notify(true);
  }

  private updateFaces(dt: number): void {
    const h = this.world.h;
    for (const b of this.blobs) {
      const vx = b.center.vx / h;
      const vy = b.center.vy / h;
      b.updateFace(dt, h, vx, vy);
    }
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'menu') {
      this.camera.followBox(this.level.menuView, dt);
    } else if (this.blobs.length > 0) {
      this.camera.followTargets(
        this.blobs.map((b) => ({ x: b.centerX, y: b.centerY })),
        dt
      );
    }
  }

  // ------------------------------------------------------------------
  // snapshot for React
  // ------------------------------------------------------------------

  private buildSnapshot(): GameSnapshot {
    const slots: SlotSnapshot[] = this.input.slots.map((s) => ({
      index: s.index,
      name: PLAYERS[s.index].name,
      color: PLAYERS[s.index].color,
      joined: s.joined,
      deviceLabel: s.joined ? deviceLabel(s.device, s.padIndex) : null,
    }));
    const items: ItemSnapshot[] = this.furniture.map((f) => ({
      kind: f.kind,
      label: f.spec.label,
      delivered: f.delivered,
      damage: Math.round(f.damage),
      pay: f.pay,
    }));
    const deliveredCount = items.filter((i) => i.delivered).length;
    const totalDamage =
      items.length > 0
        ? Math.round(items.reduce((s, i) => s + i.damage, 0) / items.length)
        : 0;
    return {
      phase: this.phase,
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)),
      slots,
      joinedCount: this.input.joinedCount,
      canStart: this.input.joinedCount >= 1,
      items,
      deliveredCount,
      totalDamage,
      pay: items.reduce((s, i) => s + i.pay, 0),
      result: this.result,
    };
  }

  private notify(force = false): void {
    this.onState(this.buildSnapshot());
    if (force) this.lastNotify = performance.now();
  }

  private notifyThrottled(now: number): void {
    if (now - this.lastNotify > 120) {
      this.lastNotify = now;
      this.notify();
    }
  }
}
