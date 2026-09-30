import type { Body } from './body';

/**
 * A single Verlet physics particle.
 * Velocities are implicit: v = (x - px), expressed in px-per-substep.
 */
export class PhysPoint {
  x: number;
  y: number;
  px: number;
  py: number;
  ax = 0;
  ay = 0;
  invMass: number;
  radius: number;
  friction: number;
  restitution: number;
  body: Body | null = null;
  /** last world-time this point touched something below it */
  lastGroundTime = -1e9;

  constructor(
    x: number,
    y: number,
    invMass = 1,
    radius = 4,
    friction = 0.1,
    restitution = 0.02
  ) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.invMass = invMass;
    this.radius = radius;
    this.friction = friction;
    this.restitution = restitution;
  }

  /** velocity in px per substep */
  get vx(): number {
    return this.x - this.px;
  }

  get vy(): number {
    return this.y - this.py;
  }

  /** add velocity in px-per-substep units */
  addVelocity(dvx: number, dvy: number): void {
    if (this.invMass === 0) return;
    this.px -= dvx;
    this.py -= dvy;
  }

  /** add velocity given in px-per-second */
  impulse(vxPerSec: number, vyPerSec: number, h: number): void {
    if (this.invMass === 0) return;
    this.px -= vxPerSec * h;
    this.py -= vyPerSec * h;
  }

  pin(): void {
    this.invMass = 0;
  }
}
