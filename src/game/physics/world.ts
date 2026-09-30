import { PhysPoint } from './point';
import { DistanceConstraint } from './constraint';
import { Body } from './body';
import type { Blob } from '../entities/blob';
import { clamp } from './math';

export interface StaticSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  halfW: number;
  friction: number;
  restitution: number;
  tag: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function makeSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfW = 8,
  friction = 0.12,
  tag = 'wall',
  restitution = 0.02
): StaticSegment {
  const r = halfW + 12; // include typical point radius margin
  return {
    ax,
    ay,
    bx,
    by,
    halfW,
    friction,
    restitution,
    tag,
    minX: Math.min(ax, bx) - r,
    minY: Math.min(ay, by) - r,
    maxX: Math.max(ax, bx) + r,
    maxY: Math.max(ay, by) + r,
  };
}

export interface Impact {
  x: number;
  y: number;
  /** approach speed in px/s */
  speed: number;
  body: Body | null;
  other: Body | null;
  otherStatic: boolean;
}

export interface WorldEvent {
  type: 'jump';
  blobIndex: number;
}

export const PHYS = {
  gravity: 2100,
  dt: 1 / 60,
  substeps: 4,
  iterations: 5,
  collisionPasses: 2,
  damping: 0.998,
  maxPointSpeed: 12, // px per substep (~2900 px/s)
  impactMinSpeed: 300,
  maxImpacts: 96,
  /** min seconds between impact events reported by a single point */
  impactCooldown: 0.1,
};

/**
 * Verlet physics world. One system for blobs + furniture + level geometry so
 * everything interacts naturally. Fixed timestep with substeps for stability.
 */
export class World {
  time = 0;
  readonly h = PHYS.dt / PHYS.substeps;
  readonly bodies: Body[] = [];
  readonly statics: StaticSegment[] = [];
  /** extra constraints (grabs) solved together with body constraints */
  readonly extraConstraints: DistanceConstraint[] = [];
  readonly impacts: Impact[] = [];
  readonly events: WorldEvent[] = [];
  gravity = PHYS.gravity;
  /** jelly cling: lateral tower re-centering strength (px/s^2) */
  blobCohesion = 1600;

  addBody(b: Body): Body {
    this.bodies.push(b);
    b.updateBounds();
    return b;
  }

  addStatic(s: StaticSegment): void {
    this.statics.push(s);
  }

  reset(): void {
    this.bodies.length = 0;
    this.statics.length = 0;
    this.extraConstraints.length = 0;
    this.impacts.length = 0;
    this.events.length = 0;
  }

  step(): void {
    for (let s = 0; s < PHYS.substeps; s++) {
      this.substep();
    }
  }

  private substep(): void {
    this.time += this.h;
    for (const b of this.bodies) b.beforeSubstep(this);
    this.integrate();
    for (const b of this.bodies) b.afterIntegrate(this);
    this.applyBlobCohesion();
    // Snapshot TRUE velocities now: all real forces are applied, but the
    // constraint solver has not yet moved positions. Collisions resolve
    // against these so solver kicks can never masquerade as momentum.
    for (const b of this.bodies) {
      for (const p of b.points) {
        p.sx = p.x - p.px;
        p.sy = p.y - p.py;
      }
    }
    for (let pass = 0; pass < PHYS.collisionPasses; pass++) {
      for (let it = 0; it < PHYS.iterations; it++) {
        for (const b of this.bodies) {
          for (const c of b.constraints) c.solve();
        }
        for (const c of this.extraConstraints) c.solve();
      }
      // Dynamics BEFORE statics: a dynamic contact (e.g. a neighbor blob
      // pressing down) must not be the last word of a pass, otherwise it
      // re-penetrates points into the ground every substep and the static
      // correction never runs after it (permanent sinking + eaten jumps).
      this.collideDynamics();
      this.collideStatics();
    }
    // End-of-substep velocity rebuild: px is recomputed from the TRUE
    // velocity (sx), which only ever contains real forces (gravity,
    // pressure, steering, impulses). Constraint-solver positional kicks
    // therefore never survive into the next integrate as fake momentum —
    // a deeply squeezed blob recovers its shape positionally instead of
    // winding up like a spring and exploding.
    for (const b of this.bodies) {
      for (const p of b.points) {
        if (p.invMass === 0) continue;
        p.px = p.x - p.sx;
        p.py = p.y - p.sy;
      }
    }
    for (const b of this.bodies) b.updateBounds();
  }

  /**
   * Blob pair forces (jelly cling):
   * 1. Center-drag: touching blobs damp their RELATIVE center velocity, which
   *    dissipates the roll/tumble mode so towers settle instead of orbiting.
   *    It never fights gravity (both blobs fall together) and barely affects
   *    walking away from a friend.
   * 2. Weak lateral centering: the upper blob drifts back over the lower one.
   */
  private applyBlobCohesion(): void {
    const a = this.blobCohesion;
    if (a <= 0) return;
    const h2 = this.h * this.h;
    const drag = 0.02; // fraction of relative center velocity per substep
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      if (A.kind !== 'blob') continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (B.kind !== 'blob') continue;
        if (
          A.minX > B.maxX ||
          B.minX > A.maxX ||
          A.minY > B.maxY ||
          B.minY > A.maxY
        )
          continue;

        // relative center velocity (per-substep units), from true velocities
        const ab = A as Blob;
        const bb = B as Blob;
        const rvx = bb.center.x - bb.center.px - (ab.center.x - ab.center.px);
        const rvy = bb.center.y - bb.center.py - (ab.center.y - ab.center.py);
        const half = drag * 0.5;
        for (const p of A.points) {
          p.px -= rvx * half;
          p.py -= rvy * half;
        }
        for (const p of B.points) {
          p.px += rvx * half;
          p.py += rvy * half;
        }

        // gentle lateral centering of the upper blob over the lower one.
        // Only for real TOWERS (centers ~40+ apart vertically): the old
        // 14px threshold glued side-by-side blobs into a dead overlap mass
        // that pinned both to the ground and ate their jumps.
        const heightDiff = Math.abs(A.centerY - B.centerY);
        if (heightDiff > 40 && heightDiff < 80) {
          const top = A.centerY < B.centerY ? A : B;
          const bottom = top === A ? B : A;
          const dx = bottom.centerX - top.centerX;
          const adx = Math.abs(dx);
          if (adx > 2 && adx < 34) {
            const k =
              Math.min(1, (heightDiff - 14) / 26) *
              Math.min(1, (34 - adx) / 16 + 0.3) *
              a *
              Math.sign(dx) *
              h2;
            for (const p of top.points) p.px -= k;
          }
        }
      }
    }
  }

  private integrate(): void {
    const h = this.h;
    const gh2 = this.gravity * h * h;
    const damp = PHYS.damping;
    const maxV = PHYS.maxPointSpeed;
    for (const b of this.bodies) {
      for (const p of b.points) {
        if (p.invMass === 0) continue;
        let vx = (p.x - p.px) * damp;
        let vy = (p.y - p.py) * damp;
        const sp2 = vx * vx + vy * vy;
        if (sp2 > maxV * maxV) {
          const k = maxV / Math.sqrt(sp2);
          vx *= k;
          vy *= k;
        }
        p.px = p.x;
        p.py = p.y;
        const nx = p.x + vx + p.ax * h * h;
        const ny = p.y + vy + p.ay * h * h + gh2;
        p.ax = 0;
        p.ay = 0;
        if (Number.isFinite(nx) && Number.isFinite(ny)) {
          p.x = nx;
          p.y = ny;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Static geometry collisions
  // ------------------------------------------------------------------

  private collideStatics(): void {
    for (const b of this.bodies) {
      for (const p of b.points) {
        for (const s of this.statics) {
          if (
            p.x + p.radius < s.minX ||
            p.x - p.radius > s.maxX ||
            p.y + p.radius < s.minY ||
            p.y - p.radius > s.maxY
          )
            continue;
          this.collidePointSegment(p, s);
        }
      }
    }
  }

  private collidePointSegment(p: PhysPoint, s: StaticSegment): void {
    if (p.invMass === 0) return;
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const len2 = ex * ex + ey * ey;
    let t = ((p.x - s.ax) * ex + (p.y - s.ay) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.ax + ex * t;
    const cy = s.ay + ey * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const r = p.radius + s.halfW;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;

    // capture TRUE velocity (before positional correction) from the snapshot
    const vx0 = p.sx;
    const vy0 = p.sy;

    let d = Math.sqrt(d2);
    let nx: number;
    let ny: number;
    if (d < 1e-6) {
      const l = Math.sqrt(len2);
      nx = -ey / l;
      ny = ex / l;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      d = 0;
    } else {
      nx = dx / d;
      ny = dy / d;
    }
    const pen = r - d;
    p.x += nx * pen;
    p.y += ny * pen;

    const tx = -ny;
    const ty = nx;
    let vn = vx0 * nx + vy0 * ny;
    const vt = vx0 * tx + vy0 * ty;
    const approach = vn < 0 ? -vn : 0;

    let jn = 0;
    if (vn < 0) {
      const e = Math.min(0.2, p.restitution + s.restitution);
      jn = -vn * (1 + e);
      vn = -vn * e;
    }
    // Coulomb-ish friction budget: normal impulse, at least the gravity load
    const bias = this.gravity * this.h * this.h;
    const jnEff = Math.max(jn, bias);
    const mu = Math.min(1.2, p.friction + s.friction);
    const jt = clamp(-vt, -mu * jnEff, mu * jnEff);

    const nvx = tx * (vt + jt) + nx * vn;
    const nvy = ty * (vt + jt) + ny * vn;
    p.px = p.x - nvx;
    p.py = p.y - nvy;
    p.sx = nvx;
    p.sy = nvy;

    if (ny < -0.55) p.lastGroundTime = this.time;

    if (approach > 0) {
      const speed = approach / this.h;
      if (
        speed > PHYS.impactMinSpeed &&
        this.impacts.length < PHYS.maxImpacts &&
        p.body &&
        this.time - p.lastImpactAt > PHYS.impactCooldown
      ) {
        p.lastImpactAt = this.time;
        this.impacts.push({
          x: cx,
          y: cy,
          speed,
          body: p.body,
          other: null,
          otherStatic: true,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Dynamic body collisions
  // ------------------------------------------------------------------

  private collideDynamics(): void {
    const n = this.bodies.length;
    for (let i = 0; i < n; i++) {
      const A = this.bodies[i];
      for (let j = i + 1; j < n; j++) {
        const B = this.bodies[j];
        if (
          A.minX > B.maxX ||
          B.minX > A.maxX ||
          A.minY > B.maxY ||
          B.minY > A.maxY
        )
          continue;
        this.collidePair(A, B);
      }
    }
  }

  private collidePair(A: Body, B: Body): void {
    for (const pa of A.points) {
      for (const pb of B.points) {
        this.resolvePointPoint(pa, pb);
      }
    }
    for (const pa of A.points) {
      for (const e of B.edges) {
        this.resolvePointEdge(pa, e.a, e.b);
      }
    }
    for (const pb of B.points) {
      for (const e of A.edges) {
        this.resolvePointEdge(pb, e.a, e.b);
      }
    }
  }

  private resolvePointPoint(a: PhysPoint, b: PhysPoint): void {
    const w = a.invMass + b.invMass;
    if (w === 0) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const r = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 < 1e-12) return;

    // capture TRUE velocities (before positional correction) from snapshots
    let avx = a.sx;
    let avy = a.sy;
    let bvx = b.sx;
    let bvy = b.sy;

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const pen = (r - d) / w;
    a.x -= nx * pen * a.invMass;
    a.y -= ny * pen * a.invMass;
    b.x += nx * pen * b.invMass;
    b.y += ny * pen * b.invMass;

    // relative velocity of b with respect to a
    let rvx = bvx - avx;
    let rvy = bvy - avy;
    let vn = rvx * nx + rvy * ny;
    const vt = rvx * -ny + rvy * nx;
    const approach = vn < 0 ? -vn : 0;

    const bias = this.gravity * this.h * this.h * 2;
    const bothBlobs = a.body?.kind === 'blob' && b.body?.kind === 'blob';
    if (vn < 0) {
      // jelly-on-jelly is fully inelastic so blobs rest on each other
      const e = bothBlobs ? 0 : (a.restitution + b.restitution) * 0.5;
      const J = (-vn * (1 + e)) / w;
      avx -= nx * J * a.invMass;
      avy -= ny * J * a.invMass;
      bvx += nx * J * b.invMass;
      bvy += ny * J * b.invMass;
      vn = -vn * e;
    }
    // friction: reduce relative tangential velocity
    let Jt: number;
    if (bothBlobs) {
      // jelly skin sticks: viscous velocity matching (blobs cling into towers)
      Jt = (-vt / w) * 0.45;
    } else {
      const mu = Math.min(1.2, a.friction + b.friction);
      const budget = Math.max(approach, bias);
      Jt = clamp(-vt / w, -mu * budget, mu * budget);
    }
    avx -= -ny * Jt * a.invMass;
    avy -= nx * Jt * a.invMass;
    bvx += -ny * Jt * b.invMass;
    bvy += nx * Jt * b.invMass;

    // rebuild previous positions from resolved velocities, keep snapshot true
    a.px = a.x - avx;
    a.py = a.y - avy;
    a.sx = avx;
    a.sy = avy;
    b.px = b.x - bvx;
    b.py = b.y - bvy;
    b.sx = bvx;
    b.sy = bvy;

    // n points from a to b: if ny > 0, b is lower => a rests on b
    if (ny > 0.55) a.lastGroundTime = this.time;
    if (ny < -0.55) b.lastGroundTime = this.time;

    const speed = approach / this.h;
    if (
      speed > PHYS.impactMinSpeed &&
      this.impacts.length < PHYS.maxImpacts &&
      this.time - a.lastImpactAt > PHYS.impactCooldown
    ) {
      a.lastImpactAt = this.time;
      this.impacts.push({
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        speed,
        body: a.body,
        other: b.body,
        otherStatic: false,
      });
    }
  }

  private resolvePointEdge(p: PhysPoint, ea: PhysPoint, eb: PhysPoint): void {
    const wp = p.invMass;
    const wa = ea.invMass;
    const wb = eb.invMass;
    if (wp + wa + wb === 0) return;
    const ex = eb.x - ea.x;
    const ey = eb.y - ea.y;
    const len2 = ex * ex + ey * ey;
    if (len2 < 1e-9) return;
    let t = ((p.x - ea.x) * ex + (p.y - ea.y) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ea.x + ex * t;
    const cy = ea.y + ey * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const r = p.radius + (ea.radius + eb.radius) * 0.5;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 < 1e-12) return;

    // capture TRUE velocities (before positional correction) from snapshots
    let pvx = p.sx;
    let pvy = p.sy;
    let avx = ea.sx;
    let avy = ea.sy;
    let bvx = eb.sx;
    let bvy = eb.sy;

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const pen = r - d;
    // effective inverse mass of the edge at param t
    const invE = (1 - t) * (1 - t) * wa + t * t * wb;
    const wTot = wp + invE;
    if (wTot === 0) return;

    const share = pen / wTot;
    p.x += nx * share * wp;
    p.y += ny * share * wp;
    const back = share * invE;
    ea.x -= nx * back * (1 - t);
    ea.y -= ny * back * (1 - t);
    eb.x -= nx * back * t;
    eb.y -= ny * back * t;

    // relative velocity of p with respect to the edge contact point
    const vcx = avx * (1 - t) + bvx * t;
    const vcy = avy * (1 - t) + bvy * t;
    let rvx = pvx - vcx;
    let rvy = pvy - vcy;
    let vn = rvx * nx + rvy * ny;
    const vt = rvx * -ny + rvy * nx;
    const approach = vn < 0 ? -vn : 0;

    const bias = this.gravity * this.h * this.h * 2;
    const bothBlobs = p.body?.kind === 'blob' && ea.body?.kind === 'blob';
    if (vn < 0) {
      const e = bothBlobs
        ? 0
        : (p.restitution + ea.restitution + eb.restitution) / 3;
      const J = (-vn * (1 + e)) / wTot;
      pvx += nx * J * wp;
      pvy += ny * J * wp;
      const jE = J * invE;
      avx -= nx * jE * (1 - t);
      avy -= ny * jE * (1 - t);
      bvx -= nx * jE * t;
      bvy -= ny * jE * t;
      vn = -vn * e;
    }
    let Jt: number;
    if (bothBlobs) {
      Jt = (-vt / wTot) * 0.45;
    } else {
      const mu = Math.min(
        1.2,
        p.friction + (ea.friction + eb.friction) * 0.5
      );
      const budget = Math.max(approach, bias);
      Jt = clamp(-vt / wTot, -mu * budget, mu * budget);
    }
    pvx += -ny * Jt * wp;
    pvy += nx * Jt * wp;
    const jtE = Jt * invE;
    avx -= -ny * jtE * (1 - t);
    avy -= nx * jtE * (1 - t);
    bvx -= -ny * jtE * t;
    bvy -= nx * jtE * t;

    // rebuild previous positions, keep snapshot velocities true
    p.px = p.x - pvx;
    p.py = p.y - pvy;
    p.sx = pvx;
    p.sy = pvy;
    ea.px = ea.x - avx;
    ea.py = ea.y - avy;
    ea.sx = avx;
    ea.sy = avy;
    eb.px = eb.x - bvx;
    eb.py = eb.y - bvy;
    eb.sx = bvx;
    eb.sy = bvy;

    // p above edge (pushed up)
    if (ny < -0.55) p.lastGroundTime = this.time;
    else if (ny > 0.55) {
      ea.lastGroundTime = this.time;
      eb.lastGroundTime = this.time;
    }

    const speed = approach / this.h;
    if (
      speed > PHYS.impactMinSpeed &&
      this.impacts.length < PHYS.maxImpacts &&
      this.time - p.lastImpactAt > PHYS.impactCooldown
    ) {
      p.lastImpactAt = this.time;
      this.impacts.push({
        x: cx,
        y: cy,
        speed,
        body: p.body,
        other: ea.body,
        otherStatic: false,
      });
    }
  }
}
