import { L } from '../level/level';
import {
  INK,
  ellipsePts,
  rectPts,
  rnd,
  sketchEdges,
  wobblyPath,
  type Pt,
} from './sketch';

const C = {
  hillFar: '#D5DFC4',
  hillNear: '#C5D6AC',
  grass: '#A9C47F',
  grassDark: '#7E9A5A',
  dirt: '#D9BE92',
  wallpaperUp: '#F0E1C2',
  wallpaperDown: '#E9DDC3',
  stripe: '#E3CFA9',
  wood: '#C89B6D',
  woodDark: '#9C6B45',
  roof: '#C0695A',
  roofDark: '#9E4F42',
  glass: '#D3E4E2',
  door: '#6F9FB0',
  truck: '#EFE6D2',
  truckIn: '#E3D6BD',
  cab: '#6F9FB0',
  bed: '#8B7F72',
  tyre: '#4A413A',
  hub: '#D8CCB8',
  trunk: '#8A6446',
  leaves: '#9DBB78',
  leavesDark: '#86A663',
  stripeRed: '#E8735A',
  rug: '#D98C6F',
  frame: '#9C6B45',
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/**
 * The static set, drawn in ink and flat washes. Paths are cached per boil
 * frame so the lines wobble a little a few times a second, like a flip-book.
 */
export class LevelArt {
  private cache = new Map<string, Path2D>();
  private boil = 0;
  private ctx!: CanvasRenderingContext2D;

  private P(key: string, make: (seed: number) => Path2D): Path2D {
    const k = key + '|' + this.boil;
    let p = this.cache.get(k);
    if (!p) {
      p = make(hashStr(key) + this.boil * 101.3);
      this.cache.set(k, p);
    }
    return p;
  }

  /** flat colour wash, slightly off-register from its outline */
  private fill(key: string, pts: Pt[], color: string, alpha = 1): void {
    const ctx = this.ctx;
    const path = this.P('f:' + key, (s) => wobblyPath(pts, true, s, 1.2, 22));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  }

  private edges(key: string, pts: Pt[], closed = true, width = 2.2, alpha = 1, overshoot = 3.5): void {
    const ctx = this.ctx;
    const path = this.P('e:' + key, (s) => sketchEdges(pts, closed, s, overshoot));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK;
    ctx.lineWidth = width;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }

  private line(key: string, pts: Pt[], width = 2, color = INK, alpha = 1, amp = 1): void {
    const ctx = this.ctx;
    const path = this.P('l:' + key, (s) => wobblyPath(pts, false, s, amp, 18));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }

  private shape(key: string, pts: Pt[], color: string, width = 2.2): void {
    this.fill(key, pts, color);
    this.edges(key, pts, true, width);
  }

  private hatch(key: string, pts: Pt[], spacing = 7, angle = -0.9, alpha = 0.16): void {
    const ctx = this.ctx;
    const clip = this.P('hc:' + key, () => {
      const p = new Path2D();
      p.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) p.lineTo(q.x, q.y);
      p.closePath();
      return p;
    });
    const lines = this.P('hl:' + key, (s) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0;
      const h = Math.max(...ys) - y0;
      const cx = x0 + w / 2;
      const cy = y0 + h / 2;
      const r = Math.hypot(w, h) / 2 + 6;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const p = new Path2D();
      let i = 0;
      for (let d = -r; d <= r; d += spacing) {
        const ox = cx - uy * d + rnd(s + i) * 1.3;
        const oy = cy + ux * d + rnd(s + i + 3) * 1.3;
        p.moveTo(ox - ux * r, oy - uy * r);
        p.lineTo(ox + ux * r, oy + uy * r + rnd(s + i + 5) * 2);
        i++;
      }
      return p;
    });
    ctx.save();
    ctx.clip(clip);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.stroke(lines);
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, boil: number): void {
    this.ctx = ctx;
    this.boil = boil;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawHills();
    this.drawTree(1215, 900, 1);
    this.drawTree(-10, 900, 0.8);
    this.drawHouse();
    this.drawGround();
    this.drawTruck();
  }

  // ------------------------------------------------------------------

  private drawHills(): void {
    const g = L.groundY;
    const far: Pt[] = [];
    const near: Pt[] = [];
    for (let x = -600; x <= 2500; x += 80) {
      far.push({ x, y: g - 150 - Math.sin(x * 0.0031) * 70 - Math.sin(x * 0.011) * 16 });
      near.push({ x, y: g - 70 - Math.sin(x * 0.0045 + 2) * 45 - Math.sin(x * 0.017) * 10 });
    }
    const farShape = [...far, { x: 2500, y: g + 10 }, { x: -600, y: g + 10 }];
    const nearShape = [...near, { x: 2500, y: g + 10 }, { x: -600, y: g + 10 }];
    this.fill('hillFar', farShape, C.hillFar);
    this.line('hillFarLine', far, 1.6, INK, 0.35);
    this.fill('hillNear', nearShape, C.hillNear);
    this.line('hillNearLine', near, 1.8, INK, 0.45);
  }

  private drawTree(x: number, groundY: number, s: number): void {
    const k = `tree${x}`;
    const trunk: Pt[] = [
      { x: x - 9 * s, y: groundY },
      { x: x - 6 * s, y: groundY - 150 * s },
      { x: x + 6 * s, y: groundY - 150 * s },
      { x: x + 9 * s, y: groundY },
    ];
    this.shape(k + 't', trunk, C.trunk, 2);
    const blobs = [
      [0, -200, 62],
      [-48, -165, 44],
      [46, -168, 46],
      [-10, -250, 44],
    ];
    for (let i = 0; i < blobs.length; i++) {
      const [ox, oy, r] = blobs[i];
      const pts = ellipsePts(x + ox * s, groundY + oy * s, r * s, r * 0.85 * s, 14);
      this.fill(k + 'c' + i, pts, i % 2 ? C.leavesDark : C.leaves);
    }
    for (let i = 0; i < blobs.length; i++) {
      const [ox, oy, r] = blobs[i];
      const pts = ellipsePts(x + ox * s, groundY + oy * s, r * s, r * 0.85 * s, 14);
      const path = this.P(k + 'co' + i, (sd) => wobblyPath(pts, true, sd, 2.4, 14));
      this.ctx.strokeStyle = INK;
      this.ctx.lineWidth = 1.8;
      this.ctx.globalAlpha = 0.7;
      this.ctx.stroke(path);
      this.ctx.globalAlpha = 1;
    }
  }

  private drawHouse(): void {
    const g = L.groundY;
    const x0 = L.houseX0;
    const x1 = L.houseX1;
    const up = L.upperY;
    const T = L.wallT;

    // interior walls (cutaway view)
    const upRoom = rectPts(x0, L.roofBaseY, x1 - x0, up - L.roofBaseY);
    const downRoom = rectPts(x0, up, x1 - x0, g - up);
    this.fill('upRoom', upRoom, C.wallpaperUp);
    this.fill('downRoom', downRoom, C.wallpaperDown);
    // wallpaper stripes upstairs, little dots downstairs
    for (let x = x0 + 40; x < x1 - 20; x += 44) {
      this.line('stripe' + x, [{ x, y: L.roofBaseY + 20 }, { x, y: up - 4 }], 5, C.stripe, 0.7, 0.8);
    }
    for (let x = x0 + 50; x < x1 - 20; x += 60) {
      for (let y = up + 50; y < g - 30; y += 56) {
        const dx = ((y / 56) | 0) % 2 ? 30 : 0;
        this.fill(`dot${x},${y}`, ellipsePts(x + dx, y, 3, 3, 6), C.stripe);
      }
    }
    // shade under the upper floor and in the attic corners
    this.hatch('ceilShade', rectPts(L.stairHigh.x, up + L.slabT, x1 - T - L.stairHigh.x, 46), 7, -0.9, 0.13);
    this.hatch(
      'attic',
      [
        { x: x0, y: L.roofBaseY },
        { x: L.roofApex.x, y: L.roofApex.y + 30 },
        { x: x1, y: L.roofBaseY },
      ],
      8,
      0.8,
      0.12
    );

    // windows
    this.window(560, 300, 110, 110);
    this.window(700, 680, 90, 90);
    this.window(215, 330, 90, 100);
    // picture frame + clock + rug
    this.shape('pic', rectPts(730, 300, 60, 48), '#F5EDD9', 2);
    this.fill('picBlob', ellipsePts(760, 330, 14, 11, 12), '#E8735A');
    this.edges('picBlobE', ellipsePts(760, 330, 14, 11, 12), true, 1.4, 0.8, 0);
    this.shape('clock', ellipsePts(390, 690, 22, 22, 16), '#F5EDD9', 2);
    this.line('clockHands', [{ x: 390, y: 676 }, { x: 390, y: 690 }, { x: 401, y: 696 }], 2);
    this.fill('rug', ellipsePts(720, g - 3, 170, 7, 20), C.rug, 0.8);

    // stairs: stringer + sawtooth steps + banister
    const lo = L.stairLow;
    const hi = L.stairHigh;
    const slab = [lo, hi, { x: hi.x, y: hi.y + L.slabT }, { x: lo.x, y: lo.y + L.slabT }];
    this.shape('stringer', slab, C.woodDark);
    const steps = 12;
    const saw: Pt[] = [];
    const dx = (hi.x - lo.x) / steps;
    const dy = (hi.y - lo.y) / steps;
    for (let i = 0; i < steps; i++) {
      const sx = lo.x + dx * i;
      const sy = lo.y + dy * i;
      // riser goes up from half a step below the line, tread overhangs half a step
      saw.push({ x: sx, y: sy - dy * 0.5 });
      saw.push({ x: sx, y: sy + dy * 0.5 });
    }
    saw.push({ x: hi.x, y: hi.y + dy * 0.5 });
    const stepsShape = [...saw, { x: hi.x, y: hi.y + L.slabT }, { x: lo.x, y: lo.y + L.slabT }];
    this.fill('steps', stepsShape, C.wood);
    this.edges('stepsE', saw, false, 2);
    const rail = [
      { x: lo.x + 6, y: lo.y - 70 },
      { x: hi.x - 6, y: hi.y - 70 + 2 },
    ];
    for (let i = 0; i <= 10; i++) {
      const t = 0.03 + (i / 10) * 0.94;
      const bx = lo.x + (hi.x - lo.x) * t;
      const by = lo.y + (hi.y - lo.y) * t;
      this.line('bal' + i, [{ x: bx, y: by - 70 + 2 }, { x: bx, y: by }], 1.6, INK, 0.55);
    }
    this.line('rail', rail, 4, C.woodDark);
    this.line('railInk', rail, 1.6);

    // upper floor slab
    const slabUp = rectPts(hi.x, up, x1 - T - hi.x, L.slabT);
    this.shape('slabUp', slabUp, C.wood);
    for (let x = hi.x + 70; x < x1 - T; x += 90) {
      this.line('plank' + x, [{ x, y: up + 2 }, { x, y: up + L.slabT - 2 }], 1.3, INK, 0.5);
    }

    // shelf + brackets
    const sh = L.shelf;
    this.shape('shelf', rectPts(sh.x0, sh.y, sh.x1 - sh.x0, sh.t), C.wood);
    for (const bx of [sh.x0 + 24, sh.x1 - 30]) {
      this.shape(
        'bracket' + bx,
        [
          { x: bx, y: sh.y + sh.t },
          { x: bx + 18, y: sh.y + sh.t },
          { x: bx, y: sh.y + sh.t + 22 },
        ],
        C.woodDark,
        1.6
      );
    }

    // outer walls (wood siding)
    const left = rectPts(x0, L.roofBaseY - 6, T, g - L.roofBaseY + 6);
    const right = rectPts(x1 - T, L.roofBaseY - 6, T, L.doorTop - L.roofBaseY + 6);
    this.shape('wallL', left, C.wood);
    this.shape('wallR', right, C.wood);
    for (let y = L.roofBaseY + 30; y < g; y += 34) {
      this.line('sidL' + y, [{ x: x0 + 3, y }, { x: x0 + T - 3, y }], 1.2, INK, 0.45);
      if (y < L.doorTop) this.line('sidR' + y, [{ x: x1 - T + 3, y }, { x: x1 - 3, y }], 1.2, INK, 0.45);
    }

    // front door: frame, and the door swung open outside
    this.line('doorFrame', [{ x: x1 - T, y: g }, { x: x1 - T, y: L.doorTop }, { x: x1, y: L.doorTop }], 2.4);
    const leaf = [
      { x: x1, y: L.doorTop + 2 },
      { x: x1 + 38, y: L.doorTop + 14 },
      { x: x1 + 38, y: g - 12 },
      { x: x1, y: g - 2 },
    ];
    this.shape('doorLeaf', leaf, C.door);
    this.fill('knob', ellipsePts(x1 + 30, L.doorTop + 90, 3.5, 3.5, 8), '#E9B949');

    // roof + chimney
    this.shape('chimney', rectPts(790, 70, 44, 110), C.roofDark);
    const roof = [
      { x: x0 - 24, y: L.roofBaseY },
      { x: L.roofApex.x, y: L.roofApex.y },
      { x: x1 + 24, y: L.roofBaseY },
    ];
    this.shape('roof', roof, C.roof, 2.6);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const y = L.roofApex.y + (L.roofBaseY - L.roofApex.y) * t;
      const half = (x1 - x0 + 48) * 0.5 * t;
      const pts: Pt[] = [];
      for (let x = L.roofApex.x - half + 10; x < L.roofApex.x + half - 10; x += 26) {
        pts.push({ x, y: y + 5 }, { x: x + 13, y: y + 11 });
      }
      if (pts.length > 1) this.line('shingle' + i, pts, 1.3, INK, 0.45, 0.6);
    }
  }

  private window(x: number, y: number, w: number, h: number): void {
    const k = `win${x},${y}`;
    this.shape(k, rectPts(x, y, w, h), C.glass, 2.2);
    this.line(k + 'h', [{ x, y: y + h / 2 }, { x: x + w, y: y + h / 2 }], 2);
    this.line(k + 'v', [{ x: x + w / 2, y }, { x: x + w / 2, y: y + h }], 2);
    // glare scribble
    this.line(k + 'g', [{ x: x + 10, y: y + 26 }, { x: x + 24, y: y + 10 }], 2, '#FFFFFF', 0.8);
    // sill
    this.shape(k + 's', rectPts(x - 8, y + h, w + 16, 8), C.wood, 1.8);
  }

  private drawGround(): void {
    const g = L.groundY;
    const x0 = -700;
    const x1 = 2600;
    this.fill('dirt', rectPts(x0, g + 14, x1 - x0, 400), C.dirt);
    this.fill('grass', rectPts(x0, g, x1 - x0, 18), C.grass);
    this.line('groundLine', [{ x: x0, y: g }, { x: x1, y: g }], 2.4);
    this.line('grassEdge', [{ x: x0, y: g + 16 }, { x: x1, y: g + 16 }], 1.2, C.grassDark, 0.7, 2);
    // tufts
    for (let x = x0 + 20; x < x1; x += 37) {
      if (x > L.houseX0 - 10 && x < L.houseX1) continue;
      if (x > L.rampX0 - 10 && x < L.cab.x1) continue;
      const h = 7 + Math.abs(rnd(x)) * 7;
      this.line('tuft' + x, [{ x: x - 5, y: g - h * 0.6 }, { x, y: g + 1 }, { x: x + 3, y: g - h }], 1.5, C.grassDark, 0.9, 0.4);
    }
    // pebbles
    for (let x = x0 + 40; x < x1; x += 83) {
      const y = g + 40 + Math.abs(rnd(x + 5)) * 50;
      this.edges('peb' + x, ellipsePts(x, y, 5, 3, 7), true, 1.2, 0.35, 0);
    }
  }

  private drawTruck(): void {
    const g = L.groundY;
    const bx0 = L.bedX0;
    const bx1 = L.bedX1;
    const top = L.cargoTop;
    const rt = L.cargoRoofT;

    // ramp planks
    const ramp = [
      { x: L.rampX0, y: g },
      { x: bx0, y: L.bedY },
      { x: bx0, y: g },
    ];
    this.shape('ramp', ramp, C.wood);
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const x = L.rampX0 + (bx0 - L.rampX0) * t;
      const y = g + (L.bedY - g) * t;
      this.line('rampPlank' + i, [{ x, y: y + 2 }, { x: x + 3, y: g - 1 }], 1.2, INK, 0.5);
    }

    // cargo interior (open back: we see inside)
    const inside = rectPts(bx0, top, bx1 - bx0, L.bedY - top);
    this.fill('cargoIn', inside, C.truckIn);
    this.hatch('cargoShade', rectPts(bx0, top, bx1 - bx0, 40), 6, -0.9, 0.14);
    for (let x = bx0 + 60; x < bx1; x += 64) {
      this.line('rib' + x, [{ x, y: top + 4 }, { x, y: L.bedY - 4 }], 1.4, INK, 0.3);
    }

    // roof + sign board
    this.shape('cargoRoof', rectPts(bx0 - 10, top - rt, bx1 - bx0 + 10, rt), C.truck);
    this.shape('sign', rectPts(bx0 + 30, top - rt - 58, bx1 - bx0 - 60, 54), C.truck);
    this.line('signStripe', [{ x: bx0 + 36, y: top - rt - 12 }, { x: bx1 - 36, y: top - rt - 12 }], 5, C.stripeRed, 0.9);

    // bed / chassis
    this.shape('bed', rectPts(bx0, L.bedY, bx1 - bx0, g - L.bedY - 16), C.bed);
    this.shape('bumper', rectPts(bx0 - 14, L.bedY + 10, 16, 14), C.tyre, 1.8);

    // cab
    const cx0 = L.cab.x0;
    const cx1 = L.cab.x1;
    const cab = [
      { x: cx0, y: top - rt },
      { x: cx1 - 50, y: top - rt },
      { x: cx1 - 6, y: L.cab.y },
      { x: cx1, y: L.cab.y + 20 },
      { x: cx1, y: g - 20 },
      { x: cx0, y: g - 20 },
    ];
    this.shape('cab', cab, C.cab, 2.4);
    this.shape(
      'cabWin',
      [
        { x: cx0 + 30, y: top + 6 },
        { x: cx1 - 58, y: top + 6 },
        { x: cx1 - 26, y: L.cab.y + 6 },
        { x: cx0 + 30, y: L.cab.y + 6 },
      ],
      C.glass,
      2
    );
    this.line('cabDoor', [{ x: cx0 + 22, y: L.cab.y + 18 }, { x: cx0 + 22, y: g - 28 }, { x: cx1 - 30, y: g - 28 }], 1.4, INK, 0.6);
    this.fill('headlight', ellipsePts(cx1 - 6, g - 60, 6, 9, 10), '#F7E3A1');
    this.edges('headlightE', ellipsePts(cx1 - 6, g - 60, 6, 9, 10), true, 1.4, 0.9, 0);
    this.line('handle', [{ x: cx0 + 32, y: L.cab.y + 34 }, { x: cx0 + 48, y: L.cab.y + 34 }], 3);

    // wheels
    for (const wx of [bx0 + 70, bx1 - 70, cx0 + 72]) {
      const k = 'wheel' + wx;
      this.fill(k, ellipsePts(wx, g - 22, 24, 24, 16), C.tyre);
      this.edges(k, ellipsePts(wx, g - 22, 24, 24, 16), true, 2, 1, 0);
      this.fill(k + 'h', ellipsePts(wx, g - 22, 9, 9, 10), C.hub);
      this.edges(k + 'h', ellipsePts(wx, g - 22, 9, 9, 10), true, 1.4, 0.8, 0);
    }
  }
}
