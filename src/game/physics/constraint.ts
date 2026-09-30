import type { PhysPoint } from './point';
import { clamp } from './math';

/** Max positional correction per solve, keeps the solver from exploding. */
const MAX_CORRECTION = 24;

export class DistanceConstraint {
  readonly a: PhysPoint;
  readonly b: PhysPoint;
  rest: number;
  stiffness: number;
  isEdge: boolean;
  kind: 'structural' | 'grab' = 'structural';
  /** relative velocity damping along the constraint axis (grab springs) */
  damp = 0;

  constructor(
    a: PhysPoint,
    b: PhysPoint,
    stiffness = 1,
    isEdge = false,
    rest?: number
  ) {
    this.a = a;
    this.b = b;
    this.rest = rest ?? Math.hypot(b.x - a.x, b.y - a.y);
    this.stiffness = stiffness;
    this.isEdge = isEdge;
  }

  solve(): void {
    const { a, b } = this;
    const w = a.invMass + b.invMass;
    if (w === 0) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return;
    const nx = dx / d;
    const ny = dy / d;

    // velocity damping along the axis (kills spring oscillation)
    if (this.damp > 0) {
      const rel =
        (b.x - b.px - (a.x - a.px)) * nx +
        (b.y - b.py - (a.y - a.py)) * ny;
      const j = rel * this.damp;
      a.px += nx * j * (a.invMass / w);
      a.py += ny * j * (a.invMass / w);
      b.px -= nx * j * (b.invMass / w);
      b.py -= ny * j * (b.invMass / w);
    }

    // diff is the fractional length error; clamp the absolute correction for safety
    const err = clamp((d - this.rest) / d, -0.5, 0.5) * this.stiffness;
    const corr = clamp(err * d, -MAX_CORRECTION, MAX_CORRECTION);
    const f = corr / d / w;
    const ax = dx * f * a.invMass;
    const ay = dy * f * a.invMass;
    const bx = dx * f * b.invMass;
    const by = dy * f * b.invMass;
    a.x += ax;
    a.y += ay;
    b.x -= bx;
    b.y -= by;
  }

  currentLength(): number {
    return Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
  }
}
