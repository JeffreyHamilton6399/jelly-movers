import { Body } from '../physics/body';
import { GrabConstraint } from '../physics/constraint';
import { clamp, closestOnSegment } from '../physics/math';
import type { PhysPoint } from '../physics/point';
import type { World } from '../physics/world';

export const BLOB = {
  points: 20,
  radius: 26,
  mass: 1,
  pointRadius: 2.5,
  /** skin springs between neighbours (per iteration) */
  skinK: 0.3,
  /** gas pressure (per iteration) */
  areaK: 0.45,
  /** pull back to round (per iteration) - low = squishier */
  shapeK: 0.02,
  uprightK: 0.3,

  maxSpeed: 330,
  accelGround: 3400,
  accelAir: 1800,
  brake: 2600,
  frictionIdle: 1.2,
  frictionMove: 0.05,
  /** speed/accel multiplier while standing on another blob */
  balance: 0.4,
  /** px/s^2 per px off-centre: how strongly a resting blob recentres on the one below */
  stickCenter: 200,

  jumpVel: 800,
  coyote: 0.09,
  jumpBuffer: 0.13,
  /** extra gravity when jump is released early / when falling */
  shortHopGravity: 2.6,
  fallGravity: 1.3,

  grabReach: 24,
  /** px per solve the grab can pull; limits how much one blob can haul */
  grip: 0.4,
  grabBreak: 85,
};

export interface BlobInput {
  moveX: number;
  jumpHeld: boolean;
}

/**
 * Player blob: a ring of points with skin springs, gas pressure and a soft
 * pull back toward round. It squashes on landings, stretches on jumps,
 * leans into runs and wobbles back.
 */
export class Blob extends Body {
  input: BlobInput = { moveX: 0, jumpHeld: false };
  private jumpPressedAt = -1e9;
  private lastJumpAt = -1e9;
  justJumped = false;
  lastSplatAt = -1e9;

  grab: GrabConstraint | null = null;
  grabbed: Body | null = null;

  facing = 1;
  waddle = 0;
  // face (updated per frame)
  lookX = 0;
  lookY = 0;
  blink = 0;
  nextBlink = 1.5 + Math.random() * 3;

  constructor(
    x: number,
    y: number,
    readonly playerIndex: number,
    readonly color: string,
    readonly dark: string,
    readonly name: string
  ) {
    super();
    this.kind = 'blob';
    const n = BLOB.points;
    const m = BLOB.mass / n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.addPoint(x + Math.cos(a) * BLOB.radius, y + Math.sin(a) * BLOB.radius, m, BLOB.pointRadius);
    }
    for (let i = 0; i < n; i++) this.link(this.points[i], this.points[(i + 1) % n], BLOB.skinK);
    this.shapeK = BLOB.shapeK;
    this.areaK = BLOB.areaK;
    this.uprightK = BLOB.uprightK;
    this.friction = BLOB.frictionIdle;
    this.finalize();
  }

  queueJump(time: number): void {
    this.jumpPressedAt = time;
  }

  /** touched ground within `window` seconds (default: coyote time, for jumping) */
  isGrounded(time: number, window = BLOB.coyote): boolean {
    for (const p of this.points) {
      if (time - p.groundTime < window && p.y > this.cy) return true;
    }
    return false;
  }

  /** the body we're standing on, if any (null = the level, or airborne) */
  support(time: number): Body | null {
    let found: Body | null = null;
    for (const p of this.points) {
      if (time - p.groundTime < 0.05 && p.y > this.cy && p.groundBody) {
        found = p.groundBody;
        if (found.kind === 'blob') break;
      }
    }
    return found;
  }

  preSubstep(world: World): void {
    const h = world.h;
    const t = world.time;
    const grounded = this.isGrounded(t);
    const v = this.velocity(h);
    const mx = this.input.moveX;
    const support = this.support(t);
    const onJelly = support?.kind === 'blob';
    const sv = support ? support.velocity(h) : { x: 0, y: 0 };

    // --- run: accelerate toward a target speed (relative to what we stand on) with a capped force ---
    let dv = 0;
    if (mx !== 0) {
      const balance = onJelly ? BLOB.balance : 1;
      const accel = (grounded ? BLOB.accelGround : BLOB.accelAir) * balance;
      dv = clamp(sv.x + mx * BLOB.maxSpeed * balance - v.x, -accel * h, accel * h);
      // never brake a faster-than-max fling while holding the same direction
      if (Math.sign(dv) !== Math.sign(mx) && Math.abs(v.x - sv.x) > BLOB.maxSpeed) dv *= 0.15;
      this.facing = mx > 0 ? 1 : -1;
    } else if (grounded) {
      dv = clamp(sv.x - v.x, -BLOB.brake * h, BLOB.brake * h);
      if (onJelly && support) {
        // jelly is sticky: settle back toward the middle of the blob below
        const off = support.cx - this.cx;
        if (Math.abs(off) < BLOB.radius) dv += off * BLOB.stickCenter * h;
      }
    }
    if (dv !== 0) {
      for (const p of this.points) p.px -= dv * h;
      // push back on whatever we stand on (running on a friend shoves them)
      if (support) {
        const k = (dv * h * this.mass) / support.mass;
        for (const p of support.points) if (p.invMass > 0) p.px += k;
      }
    }
    this.friction = mx !== 0 ? BLOB.frictionMove : BLOB.frictionIdle;

    // --- jump (buffered + coyote time) ---
    if (grounded && t - this.jumpPressedAt < BLOB.jumpBuffer && t - this.lastJumpAt > 0.18) {
      this.jumpPressedAt = -1e9;
      this.lastJumpAt = t;
      this.justJumped = true;
      const R = BLOB.radius;
      for (const p of this.points) {
        // top points get a little more lift than the bottom: a stretchy take-off
        const lift = BLOB.jumpVel * (1 + 0.16 * clamp((this.cy - p.y) / R, -1, 1));
        const pvx = (p.x - p.px) / h;
        const pvy = Math.min((p.y - p.py) / h, 0);
        p.setVelocity(pvx, pvy - lift, h);
      }
    }

    // --- variable jump height / snappier falls ---
    // (airborne only: walking up a slope also has upward velocity)
    if (this.isGrounded(t, 0.02)) this.gravityScale = 1;
    else if (v.y < -60 && !this.input.jumpHeld && t - this.lastJumpAt < 0.6) this.gravityScale = BLOB.shortHopGravity;
    else if (v.y > 60) this.gravityScale = BLOB.fallGravity;
    else this.gravityScale = 1;

    // --- goal shape: lean into runs, waddle on the ground, stretch in the air ---
    const speedFrac = clamp(v.x / BLOB.maxSpeed, -1, 1);
    this.lean = speedFrac * 0.14;
    let sy = 1;
    if (grounded && Math.abs(v.x) > 40) {
      this.waddle += Math.abs(v.x) * h * 0.045;
      sy = 1 - 0.07 * Math.abs(Math.sin(this.waddle));
    } else if (!grounded) {
      sy = 1 + clamp(Math.abs(v.y) / 2600, 0, 0.14);
    }
    this.scaleY = sy;
    this.scaleX = 1 / sy;
  }

  /** stick the blob point closest to something it's touching onto it */
  tryGrab(world: World): boolean {
    if (this.grab) return false;
    let bestD2 = BLOB.grabReach * BLOB.grabReach;
    let own: PhysPoint | null = null;
    let hit: { body: Body; a: PhysPoint; b: PhysPoint; t: number } | null = null;
    const reach = BLOB.grabReach;
    for (const other of world.bodies) {
      if (other === this) continue;
      if (other.minX > this.maxX + reach || other.maxX < this.minX - reach) continue;
      if (other.minY > this.maxY + reach || other.maxY < this.minY - reach) continue;
      const op = other.points;
      for (const p of this.points) {
        for (let i = 0; i < op.length; i++) {
          const a = op[i];
          const b = op[(i + 1) % op.length];
          const c = closestOnSegment(p.x, p.y, a.x, a.y, b.x, b.y);
          if (c.d2 < bestD2) {
            bestD2 = c.d2;
            own = p;
            hit = { body: other, a, b, t: c.t };
          }
        }
      }
    }
    if (own && hit) {
      this.grab = new GrabConstraint(own, { kind: 'edge', a: hit.a, b: hit.b, t: hit.t }, 0.55, 2, BLOB.grip);
      this.grabbed = hit.body;
      world.grabs.push(this.grab);
      return true;
    }
    // nothing loose nearby: cling to the level itself
    let best: { p: PhysPoint; x: number; y: number } | null = null;
    let bd = reach * 0.8;
    for (const p of this.points) {
      const s = world.nearestStatic(p.x, p.y, bd);
      if (s) {
        bd = Math.hypot(s.x - p.x, s.y - p.y);
        best = { p, x: s.x, y: s.y };
      }
    }
    if (best) {
      this.grab = new GrabConstraint(best.p, { kind: 'anchor', x: best.x, y: best.y }, 0.5, 2);
      this.grabbed = null;
      world.grabs.push(this.grab);
      return true;
    }
    return false;
  }

  releaseGrab(world: World): boolean {
    if (!this.grab) return false;
    const i = world.grabs.indexOf(this.grab);
    if (i >= 0) world.grabs.splice(i, 1);
    this.grab = null;
    this.grabbed = null;
    return true;
  }

  updateFace(dt: number, h: number): void {
    const v = this.velocity(h);
    const tx = clamp(v.x / 280 + this.input.moveX * 0.5, -1, 1);
    const ty = clamp(v.y / 700, -1, 1);
    const k = 1 - Math.exp(-dt * 10);
    this.lookX += (tx - this.lookX) * k;
    this.lookY += (ty - this.lookY) * k;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.12;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    if (this.blink > 0) this.blink -= dt;
  }
}
