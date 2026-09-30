import type { PhysPoint } from './point';

/** Keeps two points at a rest distance. stiffness is per solver iteration (0..1). */
export class DistanceConstraint {
  rest: number;

  constructor(
    readonly a: PhysPoint,
    readonly b: PhysPoint,
    public stiffness = 1,
    rest?: number
  ) {
    this.rest = rest ?? Math.hypot(b.x - a.x, b.y - a.y);
  }

  solve(): void {
    const { a, b } = this;
    const w = a.invMass + b.invMass;
    if (w === 0) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return;
    const s = ((d - this.rest) / d / w) * this.stiffness;
    a.x += dx * s * a.invMass;
    a.y += dy * s * a.invMass;
    b.x -= dx * s * b.invMass;
    b.y -= dy * s * b.invMass;
  }
}

/** What a grab is stuck to: a spot along another body's edge, or a fixed world spot. */
export type GrabTarget =
  | { kind: 'edge'; a: PhysPoint; b: PhysPoint; t: number }
  | { kind: 'anchor'; x: number; y: number };

/**
 * A blob's sticky hand: pulls one blob point toward a spot on another body
 * (or the level). Rope-like: only pulls, never pushes, so held things can
 * still collide naturally.
 */
export class GrabConstraint {
  constructor(
    readonly p: PhysPoint,
    readonly target: GrabTarget,
    public stiffness = 0.6,
    public rest = 2,
    /** grip strength: max correction (px) per solve, so a lone blob strains against heavy loads */
    public maxCorrection = Infinity
  ) {}

  targetPos(): { x: number; y: number } {
    const g = this.target;
    if (g.kind === 'anchor') return { x: g.x, y: g.y };
    return {
      x: g.a.x + (g.b.x - g.a.x) * g.t,
      y: g.a.y + (g.b.y - g.a.y) * g.t,
    };
  }

  length(): number {
    const q = this.targetPos();
    return Math.hypot(q.x - this.p.x, q.y - this.p.y);
  }

  solve(): void {
    const { p, target: g } = this;
    const q = this.targetPos();
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.rest || d < 1e-9) return;
    const nx = dx / d;
    const ny = dy / d;
    const C = Math.min(d - this.rest, this.maxCorrection);
    if (g.kind === 'anchor') {
      if (p.invMass === 0) return;
      p.x += nx * C * this.stiffness;
      p.y += ny * C * this.stiffness;
      return;
    }
    const t = g.t;
    const wa = g.a.invMass * (1 - t) * (1 - t);
    const wb = g.b.invMass * t * t;
    const w = p.invMass + wa + wb;
    if (w === 0) return;
    const s = (C / w) * this.stiffness;
    p.x += nx * s * p.invMass;
    p.y += ny * s * p.invMass;
    g.a.x -= nx * s * (1 - t) * g.a.invMass;
    g.a.y -= ny * s * (1 - t) * g.a.invMass;
    g.b.x -= nx * s * t * g.b.invMass;
    g.b.y -= ny * s * t * g.b.invMass;
  }
}
