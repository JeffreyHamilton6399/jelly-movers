import type { World } from '../physics/world';
import type { Blob } from '../entities/blob';
import type { Furniture } from '../entities/furniture';
import { LEVEL, type LevelData } from '../level/level';
import type { Phase } from '../types';
import type { Camera } from './camera';
import type { Particles } from './particles';

export const OUT = '#4A3B32';
const SKY = '#FDF3E1';
const SUN = '#FFD98A';
const CLOUD = '#FFFDF7';
const HILL1 = '#CBE3B4';
const HILL2 = '#C2DCAB';
const GRASS = '#A6DC72';
const GRASS_D = '#7DB84E';
const DIRT = '#E3C189';
const INTERIOR = '#FFF7E2';
const WALL = '#C9A66B';
const WOOD = '#D9A15E';
const WOOD_D = '#B57339';
const STAIR = '#C98A4B';
const ROOF = '#E2725B';
const TRUCK_BOX = '#FBF6E9';
const TRUCK_CAB = '#F2913D';
const GLASS = '#EAF6F2';

const FURN_COLORS: Record<string, { main: string; dark: string; accent: string }> = {
  box: { main: '#E8C893', dark: '#C9A66B', accent: '#FFFDF7' },
  couch: { main: '#6BB59A', dark: '#4E8F79', accent: '#A8D5C2' },
  piano: { main: '#5D4A66', dark: '#43344B', accent: '#E3B23C' },
  lamp: { main: '#F9C74F', dark: '#C98A2B', accent: '#FFF3C4' },
};

const FONT_STACK = '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Segoe Print", cursive';

export interface RenderState {
  cssW: number;
  cssH: number;
  world: World;
  blobs: Blob[];
  furniture: Furniture[];
  level: LevelData;
  phase: Phase;
  debug: boolean;
  fps: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export class Renderer {
  constructor(
    private camera: Camera,
    private particles: Particles
  ) {}

  render(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { cssW, cssH, level } = state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;

    // sky (screen space)
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, cssW, cssH);
    this.drawSunAndClouds(ctx, state);

    ctx.save();
    this.camera.apply(ctx);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    this.drawHills(ctx, level);
    this.drawGround(ctx, level, state);
    this.drawHouse(ctx, level, state);
    this.drawTruck(ctx, level, state);
    this.drawZone(ctx, level, state);

    // soft shadows
    for (const f of state.furniture) this.drawShadow(ctx, f.minX, f.maxX, f.maxY);
    for (const b of state.blobs) this.drawShadow(ctx, b.minX, b.maxX, b.maxY);

    for (const f of state.furniture) this.drawFurniture(ctx, f);
    for (const b of state.blobs) this.drawBlob(ctx, b, state);
    this.drawGrabLinks(ctx, state);

    this.particles.draw(ctx);

    if (state.debug) this.drawDebug(ctx, state);
    ctx.restore();

    if (state.debug) this.drawDebugHud(ctx, state, cssW, cssH);
  }

  // ------------------------------------------------------------------
  // backdrop
  // ------------------------------------------------------------------

  private drawSunAndClouds(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const t = state.world.time;
    // sun (screen space, top-left area)
    const sx = 110;
    const sy = 100;
    ctx.fillStyle = SUN;
    ctx.strokeStyle = 'rgba(74,59,50,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // drifting clouds in world coords, drawn with light parallax feel
    ctx.save();
    const px = this.camera.x * 0.12;
    ctx.translate(-px, 0);
    ctx.fillStyle = CLOUD;
    const clouds = [
      { x: 260, y: 130, s: 1 },
      { x: 900, y: 90, s: 0.8 },
      { x: 1480, y: 180, s: 1.15 },
      { x: 1900, y: 120, s: 0.9 },
    ];
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const cx = ((c.x + t * 9 + 4000) % 2400) - 300;
      ctx.beginPath();
      ctx.arc(cx, c.y, 26 * c.s, 0, Math.PI * 2);
      ctx.arc(cx + 30 * c.s, c.y - 10 * c.s, 32 * c.s, 0, Math.PI * 2);
      ctx.arc(cx + 66 * c.s, c.y, 24 * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHills(ctx: CanvasRenderingContext2D, level: LevelData): void {
    ctx.fillStyle = HILL2;
    ctx.beginPath();
    ctx.ellipse(1350, level.worldH + 60, 620, 180, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HILL1;
    ctx.beginPath();
    ctx.ellipse(320, level.worldH + 70, 560, 170, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGround(ctx: CanvasRenderingContext2D, level: LevelData, state: RenderState): void {
    const gy = level.worldH - 100;
    ctx.fillStyle = GRASS;
    ctx.fillRect(-200, gy, level.worldW + 400, 60);
    ctx.fillStyle = DIRT;
    ctx.fillRect(-200, gy + 60, level.worldW + 400, 90);
    ctx.strokeStyle = GRASS_D;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-200, gy);
    ctx.lineTo(level.worldW + 200, gy);
    ctx.stroke();

    // grass tufts + flowers (fixed pattern)
    ctx.strokeStyle = GRASS_D;
    ctx.lineWidth = 2.5;
    const tufts = [60, 190, 320, 460, 600, 760, 905, 1060, 1250, 1385, 1520, 1640, 1730];
    for (let i = 0; i < tufts.length; i++) {
      const x = tufts[i] + (i % 3) * 7;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x - 4, gy - 10);
      ctx.moveTo(x + 3, gy);
      ctx.lineTo(x + 3, gy - 13);
      ctx.moveTo(x + 7, gy);
      ctx.lineTo(x + 11, gy - 9);
      ctx.stroke();
    }
    const flowers = [
      { x: 130, c: '#FF8FAB' },
      { x: 705, c: '#FFC53D' },
      { x: 985, c: '#FF8FAB' },
      { x: 1300, c: '#FFC53D' },
      { x: 1700, c: '#FF8FAB' },
    ];
    for (const f of flowers) {
      ctx.fillStyle = f.c;
      ctx.beginPath();
      ctx.arc(f.x, gy - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = GRASS_D;
      ctx.beginPath();
      ctx.moveTo(f.x, gy);
      ctx.lineTo(f.x, gy - 5);
      ctx.stroke();
    }
    void state;
  }

  // ------------------------------------------------------------------
  // house
  // ------------------------------------------------------------------

  private drawHouse(ctx: CanvasRenderingContext2D, level: LevelData, state: RenderState): void {
    const L = LEVEL;
    const left = L.houseLeft;
    const right = L.houseRight;
    const top = L.roofBaseY;
    const gy = L.groundY;

    // interior cutaway
    ctx.fillStyle = INTERIOR;
    ctx.fillRect(left, top, right - left, gy - top);

    // wallpaper dots upstairs
    ctx.fillStyle = 'rgba(227,178,60,0.16)';
    for (let y = 230; y < 520; y += 46) {
      for (let x = left + 40; x < right - 30; x += 46) {
        ctx.beginPath();
        ctx.arc(x + ((y / 46) % 2) * 23, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // downstairs wainscot
    ctx.fillStyle = 'rgba(201,166,107,0.28)';
    ctx.fillRect(left, 800, right - left, gy - 800);
    ctx.strokeStyle = 'rgba(74,59,50,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, 800);
    ctx.lineTo(right, 800);
    ctx.stroke();

    // window on back wall + family picture
    ctx.fillStyle = GLASS;
    roundRect(ctx, 480, 245, 92, 72, 8);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(526, 245);
    ctx.lineTo(526, 317);
    ctx.moveTo(480, 281);
    ctx.lineTo(572, 281);
    ctx.lineWidth = 3;
    ctx.stroke();
    // picture frame with tiny blob portrait
    ctx.fillStyle = '#FFFDF7';
    roundRect(ctx, 205, 265, 46, 36, 4);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#FF6B6B';
    ctx.beginPath();
    ctx.arc(228, 283, 9, 0, Math.PI * 2);
    ctx.fill();

    // stairs
    ctx.fillStyle = STAIR;
    ctx.beginPath();
    ctx.moveTo(L.stairsX0, gy);
    for (let i = 0; i < L.stairsSteps; i++) {
      const x = L.stairsX0 + i * L.stairsRun;
      const y = gy - (i + 1) * L.stairsRise;
      ctx.lineTo(x, y);
      ctx.lineTo(x + L.stairsRun, y);
    }
    ctx.lineTo(L.stairsX1, L.upperFloorY);
    ctx.lineTo(L.stairsX1, gy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // riser lines
    ctx.strokeStyle = 'rgba(74,59,50,0.4)';
    ctx.lineWidth = 2;
    for (let i = 1; i < L.stairsSteps; i++) {
      const x = L.stairsX0 + i * L.stairsRun;
      const y = gy - i * L.stairsRise;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + L.stairsRise);
      ctx.stroke();
    }

    // upper floor slab
    ctx.fillStyle = WOOD;
    roundRect(ctx, L.upperSlabFrom - 12, L.upperFloorY - 12, right - L.upperSlabFrom + 22, 26, 8);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(74,59,50,0.25)';
    ctx.lineWidth = 2;
    for (let x = L.upperSlabFrom + 30; x < right - 20; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, L.upperFloorY - 8);
      ctx.lineTo(x, L.upperFloorY + 8);
      ctx.stroke();
    }
    // slab brackets
    ctx.fillStyle = WOOD_D;
    for (const bx of [L.upperSlabFrom + 30, right - 60]) {
      ctx.beginPath();
      ctx.moveTo(bx, L.upperFloorY + 12);
      ctx.lineTo(bx + 26, L.upperFloorY + 12);
      ctx.lineTo(bx, L.upperFloorY + 44);
      ctx.closePath();
      ctx.fill();
    }

    // high shelf
    ctx.fillStyle = WOOD_D;
    roundRect(ctx, L.shelfX0 - 6, L.shelfY - 6, L.shelfX1 - L.shelfX0 + 12, 13, 5);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const bx of [L.shelfX0 + 14, L.shelfX1 - 24]) {
      ctx.fillStyle = WOOD_D;
      ctx.beginPath();
      ctx.moveTo(bx, L.shelfY + 7);
      ctx.lineTo(bx + 16, L.shelfY + 7);
      ctx.lineTo(bx + 6, L.shelfY + 30);
      ctx.closePath();
      ctx.fill();
    }

    // walls
    ctx.fillStyle = WALL;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.5;
    // left wall
    roundRect(ctx, left - 10, top - 4, 20, gy - top + 8, 6);
    ctx.fill();
    ctx.stroke();
    // right wall above door
    roundRect(ctx, right - 10, top - 4, 20, L.doorTop - top + 8, 6);
    ctx.fill();
    ctx.stroke();
    // door threshold strip on the floor (the opening itself stays clear)
    ctx.fillStyle = WOOD_D;
    roundRect(ctx, right - 10, gy - 7, 22, 8, 3);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // door lintel
    ctx.fillStyle = WOOD_D;
    roundRect(ctx, right - 26, L.doorTop - 16, 40, 22, 6);
    ctx.fill();
    ctx.stroke();

    // welcome mat outside the door
    ctx.fillStyle = '#E2725B';
    roundRect(ctx, right + 16, gy - 12, 58, 14, 5);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,253,247,0.7)';
    ctx.beginPath();
    ctx.moveTo(right + 24, gy - 5);
    ctx.lineTo(right + 66, gy - 5);
    ctx.stroke();

    // roof (chimney first)
    ctx.fillStyle = WALL;
    roundRect(ctx, 612, 72, 36, 62, 5);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = ROOF;
    ctx.beginPath();
    ctx.moveTo(left - 16, top + 2);
    ctx.lineTo(L.roofApexX, L.roofApexY - 6);
    ctx.lineTo(right + 16, top + 2);
    ctx.lineTo(right + 4, top + 14);
    ctx.lineTo(left - 4, top + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(74,59,50,0.25)';
    ctx.lineWidth = 2.5;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(left - 10 + (L.roofApexX - left + 6) * t, top - 2 + (L.roofApexY - top) * t);
      ctx.lineTo(left - 2 + (L.roofApexX - left - 20) * t, top + 12 + (L.roofApexY - top) * t);
      ctx.stroke();
    }
    void state;
  }

  // ------------------------------------------------------------------
  // truck + zone
  // ------------------------------------------------------------------

  private drawTruck(ctx: CanvasRenderingContext2D, level: LevelData, state: RenderState): void {
    const L = LEVEL;

    // wheels
    const wheels = [1235, 1455, 1648];
    for (const wx of wheels) {
      ctx.fillStyle = OUT;
      ctx.beginPath();
      ctx.arc(wx, 866, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = DIRT;
      ctx.beginPath();
      ctx.arc(wx, 866, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // container box
    ctx.fillStyle = TRUCK_BOX;
    roundRect(ctx, L.truckBedX0, L.truckWallTop + 4, L.truckBedX1 - L.truckBedX0, L.truckBedY - L.truckWallTop - 4, 12);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 4;
    ctx.stroke();
    // corrugation
    ctx.strokeStyle = 'rgba(74,59,50,0.1)';
    ctx.lineWidth = 3;
    for (let x = L.truckBedX0 + 26; x < L.truckBedX1 - 16; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, L.truckWallTop + 14);
      ctx.lineTo(x, L.truckBedY - 10);
      ctx.stroke();
    }
    // sign
    ctx.fillStyle = ROOF;
    ctx.font = `bold 40px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JELLY MOVERS', (L.truckBedX0 + L.truckBedX1) / 2, L.truckWallTop + 62);
    ctx.fillStyle = 'rgba(74,59,50,0.55)';
    ctx.font = `bold 17px ${FONT_STACK}`;
    ctx.fillText('careful squish, guaranteed wobble', (L.truckBedX0 + L.truckBedX1) / 2, L.truckWallTop + 96);

    // bed platform
    ctx.fillStyle = WOOD_D;
    roundRect(ctx, L.truckBedX0 - 10, L.truckBedY - 4, L.truckBedX1 - L.truckBedX0 + 30, 18, 6);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // cab
    ctx.fillStyle = TRUCK_CAB;
    roundRect(ctx, L.cabX0 + 4, L.cabRoofY, L.cabX1 - L.cabX0 - 6, L.groundY - L.cabRoofY - 24, 14);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = GLASS;
    roundRect(ctx, L.cabX0 + 20, L.cabRoofY + 26, 84, 52, 9);
    ctx.fill();
    ctx.stroke();
    // bumper + light
    ctx.fillStyle = OUT;
    roundRect(ctx, L.cabX1 - 12, L.groundY - 48, 26, 20, 5);
    ctx.fill();
    ctx.fillStyle = SUN;
    ctx.beginPath();
    ctx.arc(L.cabX1 - 16, L.cabRoofY + 110, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ramp
    ctx.save();
    const ax = L.rampX0;
    const ay = L.groundY - 6;
    const bx = L.rampX1;
    const by = L.rampY1 - 4;
    const ang = Math.atan2(by - ay, bx - ax);
    const len = Math.hypot(bx - ax, by - ay);
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = WOOD_D;
    roundRect(ctx, -8, -14, len + 16, 16, 6);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,253,247,0.5)';
    ctx.lineWidth = 2.5;
    for (let d = 24; d < len - 12; d += 26) {
      ctx.beginPath();
      ctx.moveTo(d, -10);
      ctx.lineTo(d, 0);
      ctx.stroke();
    }
    ctx.restore();
    // ramp support
    ctx.strokeStyle = WOOD_D;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(1060, L.groundY - 34);
    ctx.lineTo(1046, L.groundY - 2);
    ctx.stroke();

    void state;
  }

  private drawZone(ctx: CanvasRenderingContext2D, level: LevelData, state: RenderState): void {
    if (state.phase === 'menu') return;
    const z = level.truckZone;
    const t = state.world.time;
    const pulse = 0.5 + 0.3 * Math.sin(t * 3.2);
    ctx.save();
    ctx.strokeStyle = `rgba(226,114,91,${pulse})`;
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 10]);
    roundRect(ctx, z.x, z.y, z.w, z.h, 14);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#E2725B';
    ctx.font = `bold 30px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#FFFDF7';
    ctx.lineWidth = 6;
    const label = 'DROP-OFF';
    ctx.strokeText(label, z.x + z.w / 2, z.y - 24);
    ctx.fillText(label, z.x + z.w / 2, z.y - 24);

    // bouncing arrow
    const ay = z.y - 58 + Math.sin(t * 4) * 7;
    ctx.beginPath();
    ctx.moveTo(z.x + z.w / 2 - 14, ay - 12);
    ctx.lineTo(z.x + z.w / 2 + 14, ay - 12);
    ctx.lineTo(z.x + z.w / 2, ay + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // entities
  // ------------------------------------------------------------------

  private drawShadow(ctx: CanvasRenderingContext2D, minX: number, maxX: number, maxY: number): void {
    const w = (maxX - minX) * 0.42;
    if (w <= 0) return;
    ctx.fillStyle = 'rgba(74,59,50,0.14)';
    ctx.beginPath();
    ctx.ellipse((minX + maxX) / 2, maxY + 4, w, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture): void {
    const cx = (f.tl.x + f.br.x) / 2;
    const cy = (f.tl.y + f.br.y) / 2;
    const angle = Math.atan2(f.tr.y - f.tl.y, f.tr.x - f.tl.x);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // inflate by the collision point radius so the drawn body rests on
    // surfaces exactly where its physics points do
    const pr = f.spec.pointRadius;
    const hw = f.spec.w / 2 + pr;
    const hh = f.spec.h / 2 + pr;
    const col = FURN_COLORS[f.kind];

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (f.kind === 'box') {
      ctx.fillStyle = f.delivered ? '#EFE0BC' : col.main;
      roundRect(ctx, -hw, -hh, w, h, 7);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,253,247,0.85)';
      ctx.fillRect(-6, -hh, 12, h);
      ctx.strokeRect(-6, -hh, 12, h);
      ctx.fillStyle = 'rgba(74,59,50,0.55)';
      roundRect(ctx, hw - 26, hh - 22, 18, 14, 2);
      ctx.fill();
    } else if (f.kind === 'couch') {
      ctx.fillStyle = f.delivered ? '#8FBFAE' : col.main;
      roundRect(ctx, -hw, -hh + 8, w, h - 8, 12);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      // backrest
      ctx.fillStyle = col.dark;
      roundRect(ctx, -hw + 2, -hh, 26, h, 10);
      ctx.fill();
      ctx.stroke();
      // armrest
      roundRect(ctx, hw - 24, -hh + 4, 22, h - 10, 8);
      ctx.fill();
      ctx.stroke();
      // cushions
      ctx.fillStyle = f.delivered ? '#BCD9CE' : col.accent;
      roundRect(ctx, -hw + 30, -hh + 14, w - 58, h - 30, 9);
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,59,50,0.5)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -hh + 16);
      ctx.lineTo(0, hh - 18);
      ctx.stroke();
    } else if (f.kind === 'piano') {
      ctx.fillStyle = f.delivered ? '#75627E' : col.main;
      roundRect(ctx, -hw, -hh, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      // lid
      ctx.strokeStyle = 'rgba(255,253,247,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-hw + 8, -hh + 9);
      ctx.lineTo(hw - 20, -hh + 9);
      ctx.stroke();
      // keys on the front face
      ctx.fillStyle = '#FFF6E0';
      roundRect(ctx, hw - 14, -hh + 12, 10, 34, 3);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = OUT;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(hw - 13, -hh + 14 + i * 7, 5, 3);
      }
      // pedals
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(0, hh - 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (f.kind === 'lamp') {
      ctx.strokeStyle = f.delivered ? '#A98B6F' : '#8A5A44';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, hh);
      ctx.lineTo(0, -hh + 12);
      ctx.stroke();
      // base
      ctx.fillStyle = f.delivered ? '#A98B6F' : '#8A5A44';
      ctx.beginPath();
      ctx.ellipse(0, hh - 2, 12, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2;
      ctx.stroke();
      // shade
      ctx.fillStyle = f.delivered ? '#E8D9A8' : col.main;
      ctx.beginPath();
      ctx.moveTo(-8, -hh);
      ctx.lineTo(8, -hh);
      ctx.lineTo(17, -hh + 15);
      ctx.lineTo(-17, -hh + 15);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // glow
      if (!f.delivered) {
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(0, -hh + 15, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // cracks when damaged
    if (f.damage > 45 && !f.delivered) {
      ctx.strokeStyle = `rgba(74,59,50,${Math.min(0.75, f.damage / 130)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.5, -hh);
      ctx.lineTo(-hw * 0.3, -hh * 0.2);
      ctx.lineTo(-hw * 0.55, hh * 0.3);
      ctx.moveTo(hw * 0.4, -hh * 0.7);
      ctx.lineTo(hw * 0.2, 0);
      ctx.lineTo(hw * 0.5, hh * 0.6);
      ctx.stroke();
    }
    if (f.broken) {
      ctx.fillStyle = 'rgba(74,59,50,0.18)';
      roundRect(ctx, -hw, -hh, w, h, 7);
      ctx.fill();
    }
    ctx.restore();

    // damage meter (unrotated)
    if (f.damage > 3 && !f.delivered) {
      const bw = 46;
      const bx = cx - bw / 2;
      const by = f.minY - 18;
      ctx.fillStyle = 'rgba(74,59,50,0.8)';
      roundRect(ctx, bx - 2, by - 2, bw + 4, 10, 5);
      ctx.fill();
      const ratio = Math.min(1, f.damage / 100);
      ctx.fillStyle = ratio < 0.3 ? '#7DB84E' : ratio < 0.7 ? '#FFC53D' : '#FF6B6B';
      roundRect(ctx, bx, by, bw * ratio, 6, 3);
      ctx.fill();
    }

    // delivered badge
    if (f.delivered) {
      const bx = cx + w / 2 - 4;
      const by = f.minY - 14;
      ctx.fillStyle = '#7DB84E';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, by, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#FFFDF7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.lineTo(bx - 1, by + 5);
      ctx.lineTo(bx + 6, by - 5);
      ctx.stroke();
    }
  }

  private drawBlob(ctx: CanvasRenderingContext2D, b: Blob, state: RenderState): void {
    const ring = b.ring;
    const n = ring.length;

    // smooth closed path through ring points
    ctx.beginPath();
    const m0x = (ring[0].x + ring[1].x) / 2;
    const m0y = (ring[0].y + ring[1].y) / 2;
    ctx.moveTo(m0x, m0y);
    for (let i = 1; i <= n; i++) {
      const p = ring[i % n];
      const q = ring[(i + 1) % n];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // jelly shine
    const cx = b.center.x;
    const cy = b.center.y;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - 9, cy - 12, 7, 4.5, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // ---- face ----
    const lx = b.lookX;
    const ly = b.lookY;
    const eyeDX = 9.5;
    const eyeY = cy - 5 + ly * 2;
    const blink = b.blinkT > 0;

    for (const side of [-1, 1]) {
      const ex = cx + side * eyeDX + lx * 3.5;
      if (blink) {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex - 5, eyeY);
        ctx.lineTo(ex + 5, eyeY);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#FFFDF7';
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(ex, eyeY, 6.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = OUT;
        ctx.beginPath();
        ctx.arc(ex + lx * 2.6, eyeY + ly * 2.2, 2.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // blush
    ctx.fillStyle = 'rgba(255,143,171,0.35)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * 15, cy + 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // mouth
    const my = cy + 8;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    if (b.mouthMode === 'falling') {
      ctx.fillStyle = OUT;
      ctx.beginPath();
      ctx.arc(cx + lx * 2, my, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.mouthMode === 'grab') {
      ctx.fillStyle = OUT;
      ctx.beginPath();
      ctx.arc(cx + lx * 2, my - 2, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx + lx * 2, my - 3, 6, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }

    if (state.debug) {
      // blob label
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `10px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${b.name}`, cx, b.minY - 6);
    }
  }

  private drawGrabLinks(ctx: CanvasRenderingContext2D, state: RenderState): void {
    for (const b of state.blobs) {
      if (!b.grab) continue;
      const c = b.grab;
      ctx.strokeStyle = b.dark;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(c.a.x, c.a.y);
      ctx.lineTo(c.b.x, c.b.y);
      ctx.stroke();
      ctx.fillStyle = b.dark;
      for (const p of [c.a, c.b]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------------
  // debug
  // ------------------------------------------------------------------

  private drawDebug(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { world, blobs, furniture } = state;

    // statics
    ctx.strokeStyle = 'rgba(255,0,255,0.55)';
    ctx.lineWidth = 2;
    for (const s of world.statics) {
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
      ctx.stroke();
    }

    // constraints
    for (const b of world.bodies) {
      const isBlob = b.kind === 'blob';
      ctx.lineWidth = 1;
      for (const c of b.constraints) {
        ctx.strokeStyle = isBlob ? 'rgba(0,255,255,0.25)' : 'rgba(255,165,0,0.5)';
        ctx.beginPath();
        ctx.moveTo(c.a.x, c.a.y);
        ctx.lineTo(c.b.x, c.b.y);
        ctx.stroke();
      }
    }
    // grab constraints
    ctx.strokeStyle = 'rgba(120,255,80,0.9)';
    ctx.lineWidth = 2.5;
    for (const c of world.extraConstraints) {
      ctx.beginPath();
      ctx.moveTo(c.a.x, c.a.y);
      ctx.lineTo(c.b.x, c.b.y);
      ctx.stroke();
    }

    // points
    for (const b of world.bodies) {
      for (const p of b.points) {
        const grounded = world.time - p.lastGroundTime < 0.12;
        ctx.fillStyle = grounded ? '#44FF44' : b.kind === 'blob' ? '#FFFFFF' : '#FFAA00';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // AABB
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    }

    // blob pressure readout
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    for (const b of blobs) {
      ctx.fillText(b.name, b.centerX, b.minY - 20);
    }
    for (const f of furniture) {
      ctx.fillText(`${f.kind} dmg:${f.damage.toFixed(0)}`, f.centerX, f.minY - 32);
    }
  }

  private drawDebugHud(
    ctx: CanvasRenderingContext2D,
    state: RenderState,
    cssW: number,
    _cssH: number
  ): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, 8, 250, 92);
    ctx.fillStyle = '#9CFF9C';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const pts = state.world.bodies.reduce((s, b) => s + b.points.length, 0);
    ctx.fillText(`fps ${state.fps.toFixed(0)}  phase ${state.phase}`, 16, 14);
    ctx.fillText(`bodies ${state.world.bodies.length}  points ${pts}`, 16, 30);
    ctx.fillText(`zoom ${this.camera.zoom.toFixed(2)}  time ${state.world.time.toFixed(1)}s`, 16, 46);
    ctx.fillText(`impacts(queued) ${state.world.impacts.length}`, 16, 62);
    ctx.fillText(`statics ${state.world.statics.length}`, 16, 78);
    void cssW;
    ctx.restore();
  }
}
