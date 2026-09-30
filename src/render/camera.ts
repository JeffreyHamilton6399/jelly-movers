import { clamp, lerp } from '../physics/math';

export interface Viewport {
  w: number;
  h: number;
}

/**
 * Shared camera that smoothly pans and zooms to keep every player on screen.
 */
export class Camera {
  x = 880;
  y = 560;
  zoom = 0.75;
  private tx = 880;
  private ty = 560;
  private tzoom = 0.75;
  private shakeAmp = 0;
  /** seconds since the last shake was added (cooldown guard) */
  private sinceShake = 1;
  viewport: Viewport = { w: 1280, h: 720 };
  worldW = 1760;
  worldH = 1000;

  setViewport(w: number, h: number): void {
    this.viewport.w = w;
    this.viewport.h = h;
  }

  shake(amount: number): void {
    // global cooldown: one shake per 120ms max, so impact storms can never
    // turn into constant violent vibration
    if (this.sinceShake < 0.12) return;
    this.sinceShake = 0;
    this.shakeAmp = Math.min(9, this.shakeAmp + amount);
  }

  followTargets(targets: { x: number; y: number }[], dt: number): void {
    if (targets.length === 0) return;
    const padX = 150;
    const padY = 120;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of targets) {
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.x > maxX) maxX = t.x;
      if (t.y > maxY) maxY = t.y;
    }
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;
    const bw = Math.max(320, maxX - minX);
    const bh = Math.max(300, maxY - minY);
    const z = clamp(
      Math.min(this.viewport.w / bw, this.viewport.h / bh),
      0.42,
      1.05
    );
    this.tzoom = z;
    this.tx = (minX + maxX) / 2;
    this.ty = (minY + maxY) / 2;
    this.update(dt);
  }

  followBox(box: { x: number; y: number; w: number; h: number }, dt: number): void {
    const z = clamp(
      Math.min(this.viewport.w / box.w, this.viewport.h / box.h),
      0.42,
      1.05
    );
    this.tzoom = z;
    this.tx = box.x + box.w / 2;
    this.ty = box.y + box.h / 2;
    this.update(dt);
  }

  update(dt: number): void {
    // clamp target so we don't show too much out-of-world space
    const halfW = this.viewport.w / (2 * this.tzoom);
    const halfH = this.viewport.h / (2 * this.tzoom);
    const cxMin = Math.min(halfW - 120, this.worldW / 2);
    const cxMax = Math.max(this.worldW - halfW + 120, this.worldW / 2);
    const cyMin = Math.min(-40 + halfH, this.worldH / 2);
    const cyMax = Math.max(this.worldH - halfH + 60, this.worldH / 2);
    this.tx = clamp(this.tx, cxMin, cxMax);
    this.ty = clamp(this.ty, cyMin, cyMax);

    const kz = 1 - Math.exp(-dt * 3.2);
    const kp = 1 - Math.exp(-dt * 4.2);
    this.zoom = lerp(this.zoom, this.tzoom, kz);
    this.x = lerp(this.x, this.tx, kp);
    this.y = lerp(this.y, this.ty, kp);
    this.shakeAmp *= Math.exp(-dt * 9);
    this.sinceShake += dt;
  }

  /** visible world rectangle (with a little slack for shake) */
  viewRect(): { x: number; y: number; w: number; h: number } {
    const w = this.viewport.w / this.zoom + 40;
    const h = this.viewport.h / this.zoom + 40;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  apply(ctx: CanvasRenderingContext2D): void {
    const sx = this.shakeAmp > 0.2 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    const sy = this.shakeAmp > 0.2 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    ctx.translate(this.viewport.w / 2, this.viewport.h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x + sx, -this.y + sy);
  }
}
