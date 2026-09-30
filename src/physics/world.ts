import type { Body } from './body';
import type { PhysPoint } from './point';
import type { GrabConstraint } from './constraint';
import { closestOnSegment, type Vec2 } from './math';

/** A solid convex polygon of level geometry. */
export interface StaticPoly {
  pts: Vec2[];
  /** outward unit normal for edge i (pts[i] -> pts[i+1]) */
  normals: Vec2[];
  /** internal edges (buried in / flush with other solids): never used as a push-out direction */
  internal: boolean[];
  friction: number;
  tag: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function makePoly(pts: Vec2[], friction = 0.6, tag = 'solid', internalEdges: number[] = []): StaticPoly {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  const normals: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    let nx = b.y - a.y;
    let ny = -(b.x - a.x);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // orient away from the centroid
    if ((a.x - cx) * nx + (a.y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    normals.push({ x: nx, y: ny });
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    pts,
    normals,
    internal: pts.map((_, i) => internalEdges.includes(i)),
    friction,
    tag,
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** edges: 0 top, 1 right, 2 bottom, 3 left */
export function makeRect(
  x: number,
  y: number,
  w: number,
  h: number,
  friction = 0.6,
  tag = 'solid',
  internalEdges: number[] = []
): StaticPoly {
  return makePoly(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    friction,
    tag,
    internalEdges
  );
}

export const PHYS = {
  dt: 1 / 60,
  substeps: 8,
  iterations: 2,
  gravity: 2200,
  /** px/s cap per point, keeps everything tunnel-proof */
  maxSpeed: 2400,
  /** fraction of velocity kept per second in the air */
  airKeep: 0.9,
  /** approach speed (px/s) that counts as a hit */
  hitMin: 280,
};

/** Friction coefficients combine like this (geometric mean). */
function mix(a: number, b: number): number {
  return Math.sqrt(a * b);
}

/**
 * Position-based Verlet world: blobs, furniture and level geometry in one system.
 * Fixed 60 Hz step split into substeps; each substep integrates, then runs a
 * few solver iterations of shape constraints -> grabs -> body contacts -> level.
 */
export class World {
  time = 0;
  readonly h = PHYS.dt / PHYS.substeps;
  readonly bodies: Body[] = [];
  readonly statics: StaticPoly[] = [];
  readonly grabs: GrabConstraint[] = [];
  gravity = PHYS.gravity;

  addBody<T extends Body>(b: T): T {
    this.bodies.push(b);
    return b;
  }

  removeBody(b: Body): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    for (let j = this.grabs.length - 1; j >= 0; j--) {
      const g = this.grabs[j];
      if (g.p.body === b || (g.target.kind === 'edge' && g.target.a.body === b)) this.grabs.splice(j, 1);
    }
  }

  reset(): void {
    this.bodies.length = 0;
    this.statics.length = 0;
    this.grabs.length = 0;
    this.time = 0;
  }

  step(): void {
    for (const b of this.bodies) b.hitSpeed = 0;
    for (let s = 0; s < PHYS.substeps; s++) this.substep();
  }

  private substep(): void {
    this.time += this.h;
    for (const b of this.bodies) b.preSubstep(this);
    this.integrate();
    for (let it = 0; it < PHYS.iterations; it++) {
      for (const b of this.bodies) {
        for (const c of b.constraints) c.solve();
        if (b.areaK > 0) b.solveArea(b.areaK);
        if (b.shapeK > 0) b.matchShape(b.shapeK);
      }
      for (const g of this.grabs) g.solve();
      this.collideBodies();
      this.collideStatics();
    }
    for (const b of this.bodies) {
      b.updateBounds();
      b.updateCentroid();
    }
  }

  private integrate(): void {
    const h = this.h;
    const maxStep = PHYS.maxSpeed * h;
    const keep = Math.pow(PHYS.airKeep, h);
    for (const b of this.bodies) {
      const gy = this.gravity * b.gravityScale * h * h;
      for (const p of b.points) {
        if (p.invMass === 0) continue;
        let vx = (p.x - p.px) * keep;
        let vy = (p.y - p.py) * keep;
        const sp2 = vx * vx + vy * vy;
        if (sp2 > maxStep * maxStep) {
          const k = maxStep / Math.sqrt(sp2);
          vx *= k;
          vy *= k;
        }
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + gy;
      }
    }
  }

  // ------------------------------------------------------------------
  // level geometry
  // ------------------------------------------------------------------

  private collideStatics(): void {
    for (const b of this.bodies) {
      for (const s of this.statics) {
        if (b.minX > s.maxX + 8 || b.maxX < s.minX - 8 || b.minY > s.maxY + 8 || b.maxY < s.minY - 8) continue;
        for (const p of b.points) this.pointVsStatic(p, s, b);
      }
    }
  }

  private pointVsStatic(p: PhysPoint, s: StaticPoly, body: Body): void {
    if (p.invMass === 0) return;
    const r = p.radius;
    if (p.x < s.minX - r || p.x > s.maxX + r || p.y < s.minY - r || p.y > s.maxY + r) return;
    let maxSep = -Infinity;
    let bi = 0;
    for (let i = 0; i < s.pts.length; i++) {
      const v = s.pts[i];
      const n = s.normals[i];
      const sep = (p.x - v.x) * n.x + (p.y - v.y) * n.y;
      if (sep >= r) return;
      if (sep > maxSep && !s.internal[i]) {
        maxSep = sep;
        bi = i;
      }
    }
    const n = s.normals[bi];
    const pen = r - maxSep;
    const vn = (p.x - p.px) * n.x + (p.y - p.py) * n.y;

    p.x += n.x * pen;
    p.y += n.y * pen;
    // deep starts (spawns, squeezes) must not turn into a launch
    if (pen > 4) {
      p.px += n.x * (pen - 4);
      p.py += n.y * (pen - 4);
    }

    // Coulomb friction: the normal push this iteration is the "normal force"
    const tx = -n.y;
    const ty = n.x;
    const vt = (p.x - p.px) * tx + (p.y - p.py) * ty;
    const budget = mix(body.friction, s.friction) * pen;
    const dt = Math.abs(vt) <= budget ? vt : Math.sign(vt) * budget;
    p.x -= tx * dt;
    p.y -= ty * dt;

    if (n.y < -0.5) {
      p.groundTime = this.time;
      p.groundBody = null;
    }
    if (vn < 0) {
      const speed = -vn / this.h;
      if (speed > PHYS.hitMin) body.registerHit(speed, p.x, p.y, true);
    }
  }

  // ------------------------------------------------------------------
  // body vs body: every point of one body is pushed out of the other's hull
  // ------------------------------------------------------------------

  private collideBodies(): void {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        if (A.minX > B.maxX || B.minX > A.maxX || A.minY > B.maxY || B.minY > A.maxY) continue;
        this.pointsVsHull(A, B);
        this.pointsVsHull(B, A);
      }
    }
  }

  private pointsVsHull(P: Body, Q: Body): void {
    const qp = Q.points;
    const n = qp.length;
    for (const p of P.points) {
      if (p.x < Q.minX || p.x > Q.maxX || p.y < Q.minY || p.y > Q.maxY) continue;
      if (!Q.contains(p.x, p.y)) continue;

      // nearest hull edge = shortest way out
      let best = Infinity;
      let bi = 0;
      let bt = 0;
      let bx = 0;
      let by = 0;
      for (let i = 0; i < n; i++) {
        const a = qp[i];
        const b = qp[(i + 1) % n];
        const c = closestOnSegment(p.x, p.y, a.x, a.y, b.x, b.y);
        if (c.d2 < best) {
          best = c.d2;
          bi = i;
          bt = c.t;
          bx = c.x;
          by = c.y;
        }
      }
      const d = Math.sqrt(best);
      if (d < 1e-6) continue;
      const nx = (bx - p.x) / d;
      const ny = (by - p.y) / d;
      const a = qp[bi];
      const b = qp[(bi + 1) % n];
      const t = bt;
      const wp = p.invMass;
      const wa = a.invMass * (1 - t) * (1 - t);
      const wb = b.invMass * t * t;
      const w = wp + wa + wb;
      if (w === 0) continue;

      // relative motion this substep (before correction) for friction + hits
      const rx = p.x - p.px - ((a.x - a.px) * (1 - t) + (b.x - b.px) * t);
      const ry = p.y - p.py - ((a.y - a.py) * (1 - t) + (b.y - b.py) * t);
      const vn = rx * nx + ry * ny;

      const s = d / w;
      p.x += nx * s * wp;
      p.y += ny * s * wp;
      a.x -= nx * s * (1 - t) * a.invMass;
      a.y -= ny * s * (1 - t) * a.invMass;
      b.x -= nx * s * t * b.invMass;
      b.y -= ny * s * t * b.invMass;

      // friction on the tangential slip
      const tx = -ny;
      const ty = nx;
      const vt = rx * tx + ry * ty;
      const budget = mix(P.friction, Q.friction) * d;
      const cut = Math.abs(vt) <= budget ? vt : Math.sign(vt) * budget;
      const f = cut / w;
      p.x -= tx * f * wp;
      p.y -= ty * f * wp;
      a.x += tx * f * (1 - t) * a.invMass;
      a.y += ty * f * (1 - t) * a.invMass;
      b.x += tx * f * t * b.invMass;
      b.y += ty * f * t * b.invMass;

      if (ny < -0.5) {
        p.groundTime = this.time;
        p.groundBody = Q;
      } else if (ny > 0.5) {
        a.groundTime = this.time;
        b.groundTime = this.time;
        a.groundBody = P;
        b.groundBody = P;
      }

      if (vn > 0) {
        // p was moving deeper into Q
        const speed = vn / this.h;
        if (speed > PHYS.hitMin) {
          const hardForP = Q.kind === 'furniture';
          const hardForQ = P.kind === 'furniture';
          P.registerHit(speed, p.x, p.y, hardForP);
          Q.registerHit(speed, p.x, p.y, hardForQ);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // queries
  // ------------------------------------------------------------------

  /** y of the first level surface straight below (x, y), or null */
  surfaceBelow(x: number, y: number): number | null {
    let best: number | null = null;
    for (const s of this.statics) {
      if (x < s.minX || x > s.maxX || s.maxY < y) continue;
      const n = s.pts.length;
      for (let i = 0; i < n; i++) {
        const a = s.pts[i];
        const b = s.pts[(i + 1) % n];
        if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
        const t = (x - a.x) / (b.x - a.x);
        const sy = a.y + (b.y - a.y) * t;
        if (sy >= y - 2 && (best === null || sy < best)) best = sy;
      }
    }
    return best;
  }

  /** nearest point on level geometry within maxDist of (x, y) */
  nearestStatic(x: number, y: number, maxDist: number): Vec2 | null {
    let best: Vec2 | null = null;
    let bd = maxDist * maxDist;
    for (const s of this.statics) {
      if (x < s.minX - maxDist || x > s.maxX + maxDist || y < s.minY - maxDist || y > s.maxY + maxDist) continue;
      const n = s.pts.length;
      for (let i = 0; i < n; i++) {
        const a = s.pts[i];
        const b = s.pts[(i + 1) % n];
        const c = closestOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (c.d2 < bd) {
          bd = c.d2;
          best = { x: c.x, y: c.y };
        }
      }
    }
    return best;
  }
}
