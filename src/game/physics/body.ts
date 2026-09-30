import { PhysPoint } from './point';
import { DistanceConstraint } from './constraint';
import type { World } from './world';

export type BodyKind = 'blob' | 'box' | 'couch' | 'piano' | 'lamp';

let nextBodyId = 1;

/**
 * A physics body: a group of points held together by distance constraints.
 * Blobs are soft (springs + pressure); furniture is nearly rigid (stiff braces).
 */
export class Body {
  readonly id = nextBodyId++;
  readonly points: PhysPoint[] = [];
  readonly constraints: DistanceConstraint[] = [];
  /** constraints flagged as collidable perimeter edges */
  readonly edges: DistanceConstraint[] = [];
  kind: BodyKind = 'blob';
  friction = 0.1;
  restitution = 0.02;
  minX = 0;
  minY = 0;
  maxX = 0;
  maxY = 0;

  addPoint(p: PhysPoint): PhysPoint {
    p.body = this;
    this.points.push(p);
    return p;
  }

  link(
    a: PhysPoint,
    b: PhysPoint,
    stiffness: number,
    isEdge = false
  ): DistanceConstraint {
    const c = new DistanceConstraint(a, b, stiffness, isEdge);
    this.constraints.push(c);
    if (isEdge) this.edges.push(c);
    return c;
  }

  updateBounds(): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.points) {
      if (p.x - p.radius < minX) minX = p.x - p.radius;
      if (p.y - p.radius < minY) minY = p.y - p.radius;
      if (p.x + p.radius > maxX) maxX = p.x + p.radius;
      if (p.y + p.radius > maxY) maxY = p.y + p.radius;
    }
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }

  get centerX(): number {
    let s = 0;
    for (const p of this.points) s += p.x;
    return s / this.points.length;
  }

  get centerY(): number {
    let s = 0;
    for (const p of this.points) s += p.y;
    return s / this.points.length;
  }

  get totalMass(): number {
    let m = 0;
    for (const p of this.points) {
      if (p.invMass > 0) m += 1 / p.invMass;
    }
    return m;
  }

  /** average point speed in px/s */
  avgSpeed(h: number): number {
    let s = 0;
    for (const p of this.points) {
      s += Math.hypot(p.x - p.px, p.y - p.py);
    }
    return s / this.points.length / h;
  }

  /** hooks (overridden by Blob) */
  beforeSubstep(_world: World): void {}
  afterIntegrate(_world: World): void {}
}
