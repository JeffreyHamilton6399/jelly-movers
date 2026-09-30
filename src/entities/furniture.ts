import { Body } from '../physics/body';
import type { FurnKind } from '../types';

export interface FurnitureSpec {
  label: string;
  w: number;
  h: number;
  mass: number;
  friction: number;
  /** damage multiplier */
  fragility: number;
  pay: number;
}

export const FURNITURE: Record<FurnKind, FurnitureSpec> = {
  box: { label: 'Box', w: 54, h: 50, mass: 1.1, friction: 0.55, fragility: 0.9, pay: 40 },
  couch: { label: 'Couch', w: 150, h: 58, mass: 2.0, friction: 0.3, fragility: 0.6, pay: 80 },
  // on little casters, but heavy: one blob can't budge it alone
  piano: { label: 'Piano', w: 104, h: 90, mass: 5.5, friction: 0.2, fragility: 0.5, pay: 150 },
  lamp: { label: 'Lamp', w: 26, h: 46, mass: 0.35, friction: 0.6, fragility: 2.6, pay: 100 },
};

/** Minimum hit speed (px/s) that dents furniture. */
const DAMAGE_MIN_SPEED = 470;
const MAX_SPACING = 22;

/**
 * Furniture: a rectangle of perimeter points kept rigid by full-strength
 * shape matching. Heavy, slidey, tippable, breakable.
 */
export class Furniture extends Body {
  readonly spec: FurnitureSpec;
  damage = 0;
  /** true while resting inside the truck */
  delivered = false;
  inZoneFor = 0;
  lastDamageAt = -1;

  constructor(
    readonly type: FurnKind,
    x: number,
    y: number
  ) {
    super();
    this.kind = 'furniture';
    this.spec = FURNITURE[type];
    const { w, h, mass, friction } = this.spec;
    const corners = [
      { x: x - w / 2, y: y - h / 2 },
      { x: x + w / 2, y: y - h / 2 },
      { x: x + w / 2, y: y + h / 2 },
      { x: x - w / 2, y: y + h / 2 },
    ];
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const segs = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / MAX_SPACING));
      for (let s = 0; s < segs; s++) {
        pts.push({ x: a.x + ((b.x - a.x) * s) / segs, y: a.y + ((b.y - a.y) * s) / segs });
      }
    }
    for (const p of pts) this.addPoint(p.x, p.y, mass / pts.length, 2.5);
    this.shapeK = 1;
    this.friction = friction;
    this.finalize();
  }

  get broken(): boolean {
    return this.damage >= 100;
  }

  /** payout after damage; broken items still pay a little */
  get pay(): number {
    if (!this.delivered) return 0;
    if (this.broken) return Math.round(this.spec.pay * 0.1);
    return Math.round(this.spec.pay * (1 - (0.7 * this.damage) / 100));
  }

  /** returns damage dealt by a hit of the given speed */
  applyHit(speed: number, time: number): number {
    if (speed < DAMAGE_MIN_SPEED || time - this.lastDamageAt < 0.25) return 0;
    this.lastDamageAt = time;
    const dmg = (speed - DAMAGE_MIN_SPEED) * 0.045 * this.spec.fragility;
    this.damage = Math.min(100, this.damage + dmg);
    return dmg;
  }
}
