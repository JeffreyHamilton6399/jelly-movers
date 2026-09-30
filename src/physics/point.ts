import type { Body } from './body';

/**
 * A Verlet particle. Velocity is implicit: (x - px) per substep.
 * `px/py` always hold the position at the start of the current substep,
 * so (x - px) during the solver is "how far this point moved this substep".
 */
export class PhysPoint {
  x: number;
  y: number;
  px: number;
  py: number;
  invMass: number;
  /** collision radius against level geometry */
  radius: number;
  body: Body | null = null;
  /** world time this point was last pushed up by a surface (standing on it) */
  groundTime = -1e9;
  /** what it was standing on (null = level geometry) */
  groundBody: Body | null = null;

  constructor(x: number, y: number, mass: number, radius: number) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.radius = radius;
  }

  /** add velocity in px/s */
  addVelocity(vx: number, vy: number, h: number): void {
    if (this.invMass === 0) return;
    this.px -= vx * h;
    this.py -= vy * h;
  }

  /** set velocity in px/s */
  setVelocity(vx: number, vy: number, h: number): void {
    if (this.invMass === 0) return;
    this.px = this.x - vx * h;
    this.py = this.y - vy * h;
  }
}
