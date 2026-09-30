import { Body } from '../physics/body';
import { PhysPoint } from '../physics/point';
import { DistanceConstraint } from '../physics/constraint';
import type { World } from '../physics/world';
import { clamp, polygonArea } from '../physics/math';

export const BLOB = {
  ringCount: 16,
  radius: 27,
  pointRadius: 5.5,
  ringMass: 0.35,
  centerMass: 0.85,
  neighbor: 0.85,
  bend: 0.4,
  spoke: 0.55,
  pressure: 24000,
  maxPressureErr: 0.5,
  maxSpeed: 320,
  groundSteer: 0.1,
  airSteer: 0.045,
  jumpVel: 565,
  coyote: 0.12,
  jumpBuffer: 0.14,
  grabRange: 55,
  grabStiff: 0.09,
  grabDamp: 0.4,
  grabBreak: 135,
  skinFriction: 0.62,
};

export interface BlobInputState {
  moveX: number;
  jumpQueued: boolean;
  grabPressed: boolean;
}

/**
 * Soft-body player blob: ring of points joined by springs + internal
 * pressure (area preservation) so it squishes and springs back.
 */
export class Blob extends Body {
  readonly playerIndex: number;
  readonly color: string;
  readonly dark: string;
  readonly name: string;
  readonly ring: PhysPoint[] = [];
  readonly center: PhysPoint;
  readonly restArea: number;

  input: BlobInputState = { moveX: 0, jumpQueued: false, grabPressed: false };
  jumpQueuedAt = -1;

  grab: DistanceConstraint | null = null;
  grabTarget: Body | null = null;

  // face state
  lookX = 0;
  lookY = 0;
  blinkT = 0;
  nextBlink = 2 + Math.random() * 3;
  mouthMode: 'idle' | 'falling' | 'grab' = 'idle';

  constructor(
    x: number,
    y: number,
    playerIndex: number,
    color: string,
    dark: string,
    name: string
  ) {
    super();
    this.kind = 'blob';
    this.playerIndex = playerIndex;
    this.color = color;
    this.dark = dark;
    this.name = name;
    this.friction = BLOB.skinFriction;
    this.restitution = 0.02;

    const n = BLOB.ringCount;
    this.center = this.addPoint(
      new PhysPoint(x, y, 1 / BLOB.centerMass, 6, BLOB.skinFriction, 0.02)
    );
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * BLOB.radius;
      const py = y + Math.sin(a) * BLOB.radius;
      this.ring.push(
        this.addPoint(
          new PhysPoint(
            px,
            py,
            1 / BLOB.ringMass,
            BLOB.pointRadius,
            BLOB.skinFriction,
            0.02
          )
        )
      );
    }
    for (let i = 0; i < n; i++) {
      this.link(this.ring[i], this.ring[(i + 1) % n], BLOB.neighbor, true);
      this.link(this.ring[i], this.ring[(i + 2) % n], BLOB.bend);
      this.link(this.center, this.ring[i], BLOB.spoke);
    }
    this.restArea = Math.abs(polygonArea(this.ring));
  }

  isGrounded(world: World): boolean {
    const now = world.time;
    const cy = this.centerY;
    for (const p of this.points) {
      if (now - p.lastGroundTime < BLOB.coyote && p.y > cy + 2) return true;
    }
    return false;
  }

  beforeSubstep(world: World): void {
    const h = world.h;
    const grounded = this.isGrounded(world);
    const steer = grounded ? BLOB.groundSteer : BLOB.airSteer;
    const target = this.input.moveX * BLOB.maxSpeed * h;

    for (const p of this.points) {
      if (p.invMass === 0) continue;
      const vx = p.x - p.px;
      const dv = clamp(target - vx, -1.2, 1.2);
      p.px -= dv * steer;
    }

    if (this.input.jumpQueued) {
      this.jumpQueuedAt = world.time;
      this.input.jumpQueued = false;
    }
    if (
      grounded &&
      world.time - this.jumpQueuedAt >= 0 &&
      world.time - this.jumpQueuedAt < BLOB.jumpBuffer
    ) {
      this.jumpQueuedAt = -1;
      for (const p of this.points) {
        p.impulse(0, -BLOB.jumpVel, h);
      }
      world.events.push({ type: 'jump', blobIndex: this.playerIndex });
    } else if (
      this.jumpQueuedAt >= 0 &&
      world.time - this.jumpQueuedAt >= BLOB.jumpBuffer
    ) {
      this.jumpQueuedAt = -1;
    }
  }

  afterIntegrate(world: World): void {
    this.applyPressure(world);
    this.applyViscosity();
  }

  /**
   * Internal jelly viscosity: damp velocity differences between own points.
   * Dissipates pressure ringing so stacked blobs settle instead of
   * oscillating through each other, while keeping overall motion intact.
   */
  private applyViscosity(): void {
    const k = 0.05;
    let ax = 0;
    let ay = 0;
    const pts = this.points;
    for (const p of pts) {
      ax += p.x - p.px;
      ay += p.y - p.py;
    }
    ax /= pts.length;
    ay /= pts.length;
    for (const p of pts) {
      p.px += (p.x - p.px - ax) * k;
      p.py += (p.y - p.py - ay) * k;
    }
  }

  /** internal gas pressure: preserve rest area so the blob springs back */
  private applyPressure(world: World): void {
    const area = Math.abs(polygonArea(this.ring));
    let err = (this.restArea - area) / this.restArea;
    err = clamp(err, -BLOB.maxPressureErr, BLOB.maxPressureErr);
    if (Math.abs(err) < 0.002) return;

    const n = this.ring.length;
    const cx = this.centerX;
    const cy = this.centerY;
    const aSub = err * BLOB.pressure * world.h * world.h;
    for (let i = 0; i < n; i++) {
      const p1 = this.ring[i];
      const p2 = this.ring[(i + 1) % n];
      // outward normal of edge (p1 -> p2), oriented away from the center
      const mx = (p1.x + p2.x) / 2 - cx;
      const my = (p1.y + p2.y) / 2 - cy;
      let ex = p2.y - p1.y;
      let ey = -(p2.x - p1.x);
      const el = Math.hypot(ex, ey) || 1;
      ex /= el;
      ey /= el;
      if (ex * mx + ey * my < 0) {
        ex = -ex;
        ey = -ey;
      }
      p1.px -= ex * aSub * 0.5;
      p1.py -= ey * aSub * 0.5;
      p2.px -= ex * aSub * 0.5;
      p2.py -= ey * aSub * 0.5;
    }
  }

  get grabLength(): number {
    return this.grab ? this.grab.currentLength() : 0;
  }

  /** stick the nearest own ring point to the nearest other-body point */
  tryGrab(world: World): boolean {
    if (this.grab) return false;
    let best: PhysPoint | null = null;
    let bestBody: Body | null = null;
    let bestD = BLOB.grabRange;
    const cx = this.centerX;
    const cy = this.centerY;
    for (const b of world.bodies) {
      if (b === this) continue;
      for (const p of b.points) {
        const d = Math.hypot(p.x - cx, p.y - cy) - p.radius;
        if (d < bestD) {
          bestD = d;
          best = p;
          bestBody = b;
        }
      }
    }
    if (!best || !bestBody) return false;

    let own = this.ring[0];
    let od = Infinity;
    for (const p of this.ring) {
      const d = Math.hypot(p.x - best.x, p.y - best.y);
      if (d < od) {
        od = d;
        own = p;
      }
    }
    const c = new DistanceConstraint(
      own,
      best,
      BLOB.grabStiff,
      false,
      Math.max(6, od * 0.35)
    );
    c.kind = 'grab';
    c.damp = BLOB.grabDamp;
    this.grab = c;
    this.grabTarget = bestBody;
    world.extraConstraints.push(c);
    return true;
  }

  releaseGrab(world: World): boolean {
    if (!this.grab) return false;
    const idx = world.extraConstraints.indexOf(this.grab);
    if (idx >= 0) world.extraConstraints.splice(idx, 1);
    this.grab = null;
    this.grabTarget = null;
    return true;
  }

  updateFace(dt: number, h: number, vxPerSec: number, vyPerSec: number): void {
    // eyes look toward movement / input direction
    const tx = clamp(vxPerSec / 260, -1, 1) * 0.7 + this.input.moveX * 0.5;
    const ty = clamp(vyPerSec / 420, -1, 1);
    const k = 1 - Math.exp(-dt * 8);
    this.lookX += (clamp(tx, -1, 1) - this.lookX) * k;
    this.lookY += (clamp(ty, -1, 1) - this.lookY) * k;

    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0.13;
      this.nextBlink = 2.2 + Math.random() * 3.2;
    }
    if (this.blinkT > 0) this.blinkT -= dt;

    this.mouthMode =
      vyPerSec > 560 ? 'falling' : this.grab ? 'grab' : 'idle';
    void h;
  }
}
