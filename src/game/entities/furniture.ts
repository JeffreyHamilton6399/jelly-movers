import { Body, type BodyKind } from '../physics/body';
import { PhysPoint } from '../physics/point';
import type { FurnKind } from '../types';

export interface FurnitureSpec {
  label: string;
  w: number;
  h: number;
  pointMass: number;
  pointRadius: number;
  friction: number;
  fragility: number;
  pay: number;
  midPoints: boolean;
}

export const FURNITURE_SPECS: Record<FurnKind, FurnitureSpec> = {
  box: {
    label: 'Box',
    w: 62,
    h: 62,
    pointMass: 0.9,
    pointRadius: 6,
    friction: 0.1,
    fragility: 1.0,
    pay: 40,
    midPoints: false,
  },
  couch: {
    label: 'Couch',
    w: 150,
    h: 62,
    pointMass: 1.4,
    pointRadius: 7,
    friction: 0.09,
    fragility: 0.8,
    pay: 70,
    midPoints: true,
  },
  piano: {
    label: 'Piano',
    w: 92,
    h: 78,
    pointMass: 4.5,
    pointRadius: 7,
    friction: 0.06,
    fragility: 0.5,
    pay: 120,
    midPoints: true,
  },
  lamp: {
    label: 'Lamp',
    w: 26,
    h: 34,
    pointMass: 0.35,
    pointRadius: 4.5,
    friction: 0.12,
    fragility: 3.2,
    pay: 90,
    midPoints: false,
  },
};

/**
 * Furniture: points tied with very stiff constraints (nearly rigid) + mass.
 * Takes damage from hard impacts.
 */
export class Furniture extends Body {
  readonly spec: FurnitureSpec;
  readonly kind: FurnKind;
  readonly tl: PhysPoint;
  readonly tr: PhysPoint;
  readonly br: PhysPoint;
  readonly bl: PhysPoint;
  readonly tm: PhysPoint | null = null;
  readonly bm: PhysPoint | null = null;
  damage = 0;
  delivered = false;
  deliveredAt = -1;
  lastDamageAt = -1;

  constructor(kind: FurnKind, x: number, y: number) {
    super();
    this.kind = kind;
    this.spec = FURNITURE_SPECS[kind];
    const { w, h, pointMass, pointRadius, friction } = this.spec;
    const hw = w / 2;
    const hh = h / 2;
    const inv = 1 / pointMass;
    const mk = (px: number, py: number) =>
      new PhysPoint(px, py, inv, pointRadius, friction, 0.02);

    this.tl = this.addPoint(mk(x - hw, y - hh));
    this.tr = this.addPoint(mk(x + hw, y - hh));
    this.br = this.addPoint(mk(x + hw, y + hh));
    this.bl = this.addPoint(mk(x - hw, y + hh));
    if (this.spec.midPoints) {
      this.tm = this.addPoint(mk(x, y - hh));
      this.bm = this.addPoint(mk(x, y + hh));
    }

    // perimeter edges (collidable) + stiff braces => nearly rigid
    if (this.tm && this.bm) {
      this.link(this.tl, this.tm, 1, true);
      this.link(this.tm, this.tr, 1, true);
      this.link(this.tr, this.br, 1, true);
      this.link(this.br, this.bm, 1, true);
      this.link(this.bm, this.bl, 1, true);
      this.link(this.bl, this.tl, 1, true);
      this.link(this.tl, this.br, 1);
      this.link(this.tr, this.bl, 1);
      this.link(this.tm, this.bl, 1);
      this.link(this.tm, this.br, 1);
      this.link(this.bm, this.tl, 1);
      this.link(this.bm, this.tr, 1);
    } else {
      this.link(this.tl, this.tr, 1, true);
      this.link(this.tr, this.br, 1, true);
      this.link(this.br, this.bl, 1, true);
      this.link(this.bl, this.tl, 1, true);
      this.link(this.tl, this.br, 1);
      this.link(this.tr, this.bl, 1);
    }
  }

  get bodyKind(): BodyKind {
    return this.kind;
  }

  get broken(): boolean {
    return this.damage >= 100;
  }

  /** payout accounting for damage; broken items pay almost nothing */
  get pay(): number {
    if (!this.delivered) return 0;
    if (this.broken) return Math.round(this.spec.pay * 0.15);
    return Math.round(
      this.spec.pay * (1 - 0.65 * Math.min(this.damage, 100) / 100)
    );
  }

  /** returns damage added from an impact of given speed */
  applyImpact(speed: number, time: number): number {
    if (speed < 600) return 0;
    if (time - this.lastDamageAt < 0.3) return 0;
    this.lastDamageAt = time;
    const dmg = (speed - 600) * 0.011 * this.spec.fragility;
    this.damage = Math.min(100, this.damage + dmg);
    return dmg;
  }
}
