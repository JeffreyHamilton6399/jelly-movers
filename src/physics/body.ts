import { PhysPoint } from './point';
import { DistanceConstraint } from './constraint';
import { polygonArea, type Vec2 } from './math';
import type { World } from './world';

export type BodyKind = 'blob' | 'furniture';

let nextId = 1;

/**
 * A group of points whose ordered list is also its collision polygon (hull).
 *
 * Shape is held by three position-based tools, all optional:
 *  - distance constraints (skin springs),
 *  - an area constraint (jelly "pressure": squash one way, bulge the other),
 *  - shape matching (pull toward the rest shape at the current rotation).
 * Furniture uses full-strength shape matching, which makes it rigid.
 */
export class Body {
  readonly id = nextId++;
  kind: BodyKind = 'blob';
  readonly points: PhysPoint[] = [];
  readonly constraints: DistanceConstraint[] = [];
  /** rest offsets from the rest centroid, one per point */
  rest: Vec2[] = [];
  restArea = 0;
  mass = 0;

  /** per-iteration shape matching strength (1 = rigid) */
  shapeK = 0;
  /** per-iteration area strength (0 = no pressure) */
  areaK = 0;
  /** multiplier on rest area (>1 inflates) */
  pressure = 1;
  /** 0..1: how strongly the goal shape is rotated back upright */
  uprightK = 0;
  /** extra goal-shape rotation (radians), e.g. leaning into a run */
  lean = 0;
  /** goal-shape scale in world axes (squash & stretch) */
  scaleX = 1;
  scaleY = 1;

  friction = 0.5;
  gravityScale = 1;

  /** measured rotation from shape matching */
  angle = 0;
  cx = 0;
  cy = 0;
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;

  /** hardest approach speed (px/s) this frame, for damage/splat effects */
  hitSpeed = 0;
  hitX = 0;
  hitY = 0;
  /** true if the hardest hit was against the level or furniture (not jelly) */
  hitHard = false;

  addPoint(x: number, y: number, mass: number, radius: number): PhysPoint {
    const p = new PhysPoint(x, y, mass, radius);
    p.body = this;
    this.points.push(p);
    return p;
  }

  link(a: PhysPoint, b: PhysPoint, stiffness: number): DistanceConstraint {
    const c = new DistanceConstraint(a, b, stiffness);
    this.constraints.push(c);
    return c;
  }

  /** call after all points are added: captures the rest shape */
  finalize(): void {
    this.updateCentroid();
    this.rest = this.points.map((p) => ({ x: p.x - this.cx, y: p.y - this.cy }));
    this.restArea = polygonArea(this.points);
    this.mass = 0;
    for (const p of this.points) if (p.invMass > 0) this.mass += 1 / p.invMass;
    this.updateBounds();
  }

  updateCentroid(): void {
    let sx = 0;
    let sy = 0;
    let sm = 0;
    for (const p of this.points) {
      const m = p.invMass > 0 ? 1 / p.invMass : 1e6;
      sx += p.x * m;
      sy += p.y * m;
      sm += m;
    }
    this.cx = sx / sm;
    this.cy = sy / sm;
  }

  updateBounds(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }

  /** average velocity in px/s */
  velocity(h: number): Vec2 {
    let vx = 0;
    let vy = 0;
    for (const p of this.points) {
      vx += p.x - p.px;
      vy += p.y - p.py;
    }
    const n = this.points.length * h;
    return { x: vx / n, y: vy / n };
  }

  /** pull points toward the rest shape, rotated to fit the current pose */
  matchShape(k: number): void {
    this.updateCentroid();
    const { cx, cy } = this;
    let num = 0;
    let den = 0;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const q = this.rest[i];
      const rx = p.x - cx;
      const ry = p.y - cy;
      num += q.x * ry - q.y * rx;
      den += q.x * rx + q.y * ry;
    }
    const a = Math.atan2(num, den);
    this.angle = a;
    const ga = a * (1 - this.uprightK) + this.lean;
    const c = Math.cos(ga);
    const s = Math.sin(ga);
    const sx = this.scaleX;
    const sy = this.scaleY;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.invMass === 0) continue;
      const q = this.rest[i];
      const gx = cx + (c * q.x - s * q.y) * sx;
      const gy = cy + (s * q.x + c * q.y) * sy;
      p.x += (gx - p.x) * k;
      p.y += (gy - p.y) * k;
    }
  }

  /** position-based area constraint (gas pressure) */
  solveArea(k: number): void {
    const pts = this.points;
    const n = pts.length;
    const C = polygonArea(pts) - this.restArea * this.pressure;
    let wsum = 0;
    const gx: number[] = new Array(n);
    const gy: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = pts[(i + n - 1) % n];
      const next = pts[(i + 1) % n];
      gx[i] = 0.5 * (next.y - prev.y);
      gy[i] = 0.5 * (prev.x - next.x);
      wsum += pts[i].invMass * (gx[i] * gx[i] + gy[i] * gy[i]);
    }
    if (wsum < 1e-9) return;
    const lambda = (-C / wsum) * k;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      p.x += lambda * p.invMass * gx[i];
      p.y += lambda * p.invMass * gy[i];
    }
  }

  /** even-odd point-in-polygon test against the hull */
  contains(x: number, y: number): boolean {
    const pts = this.points;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  registerHit(speed: number, x: number, y: number, hard: boolean): void {
    if (speed > this.hitSpeed) {
      this.hitSpeed = speed;
      this.hitX = x;
      this.hitY = y;
      this.hitHard = hard;
    }
  }

  /** hooks */
  preSubstep(_world: World): void {}
}
