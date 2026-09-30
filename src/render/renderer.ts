import type { World } from '../physics/world';
import type { Blob } from '../entities/blob';
import type { Furniture } from '../entities/furniture';
import type { LevelData } from '../level/level';
import type { Camera } from './camera';
import type { Particles } from './particles';
import { LevelArt } from './levelArt';
import {
  FONT,
  INK,
  PAPER,
  blobPath,
  makePaperTexture,
  rectPts,
  rnd,
  sketchEdges,
  wobblyPath,
  type Pt,
} from './sketch';

export interface RenderState {
  cssW: number;
  cssH: number;
  time: number;
  world: World;
  blobs: Blob[];
  furniture: Furniture[];
  level: LevelData;
  showZone: boolean;
  zonePulse: number;
  debug: boolean;
  fps: number;
}

const SKY = '#DCE7E3';

const FURN_COLORS = {
  box: { main: '#D8B27E', dark: '#B48A57', light: '#EADBB8' },
  couch: { main: '#7FA7A0', dark: '#5E857E', light: '#A3C4BD' },
  piano: { main: '#5E4B56', dark: '#433540', light: '#7C6874' },
  lamp: { main: '#F2D27A', dark: '#C9A24A', light: '#FFF1C4' },
};

const BOIL_FPS = 7;

export class Renderer {
  private art = new LevelArt();
  private paper: CanvasPattern | null = null;

  constructor(
    private camera: Camera,
    private particles: Particles
  ) {}

  render(ctx: CanvasRenderingContext2D, s: RenderState): void {
    const boil = Math.floor(s.time * BOIL_FPS) % 3;
    if (!this.paper) this.paper = ctx.createPattern(makePaperTexture(), 'repeat');

    // sky wash (screen space) + drifting pencil clouds
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, s.cssW, s.cssH);
    this.drawClouds(ctx, s, boil);

    ctx.save();
    this.camera.apply(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.art.draw(ctx, boil);
    if (s.showZone) this.drawZone(ctx, s, boil);

    for (const f of s.furniture) this.drawShadow(ctx, s.world, f.cx, f.maxY, f.maxX - f.minX);
    for (const b of s.blobs) this.drawShadow(ctx, s.world, b.cx, b.maxY, b.maxX - b.minX);

    for (const f of s.furniture) this.drawFurniture(ctx, f, boil);
    for (const b of s.blobs) this.drawBlob(ctx, b, s, boil);
    this.drawGrabs(ctx, s);
    this.particles.draw(ctx);
    for (const f of s.furniture) this.drawDamageMeter(ctx, f, boil);

    if (s.debug) this.drawDebug(ctx, s);
    ctx.restore();

    // paper grain over everything, then a soft vignette
    if (this.paper) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = this.paper;
      ctx.fillRect(0, 0, s.cssW, s.cssH);
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(
      s.cssW / 2,
      s.cssH / 2,
      Math.min(s.cssW, s.cssH) * 0.45,
      s.cssW / 2,
      s.cssH / 2,
      Math.max(s.cssW, s.cssH) * 0.75
    );
    vg.addColorStop(0, 'rgba(90,70,40,0)');
    vg.addColorStop(1, 'rgba(90,70,40,0.16)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, s.cssW, s.cssH);

    if (s.debug) this.drawDebugHud(ctx, s);
  }

  // ------------------------------------------------------------------

  private drawClouds(ctx: CanvasRenderingContext2D, s: RenderState, boil: number): void {
    const clouds = [
      { x: 120, y: 90, r: 1 },
      { x: 620, y: 60, r: 0.75 },
      { x: 1100, y: 130, r: 1.15 },
      { x: 1600, y: 80, r: 0.9 },
    ];
    const span = s.cssW + 400;
    ctx.save();
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const x = ((((c.x - this.camera.x * 0.08 + s.time * 6) % span) + span) % span) - 200;
      const y = c.y;
      const pts: Pt[] = [];
      const bumps = 7;
      for (let k = 0; k < bumps * 3; k++) {
        const a = (k / (bumps * 3)) * Math.PI * 2;
        const bump = k % 3 === 1 ? 1.18 : 1;
        pts.push({ x: x + Math.cos(a) * 70 * c.r * bump, y: y + Math.sin(a) * 26 * c.r * bump * (a > 0 && a < Math.PI ? 0.6 : 1) });
      }
      const path = wobblyPath(pts, true, i * 17 + boil * 3, 1.5, 12);
      ctx.fillStyle = '#F7F2E6';
      ctx.fill(path);
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.6;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawZone(ctx: CanvasRenderingContext2D, s: RenderState, boil: number): void {
    const z = s.level.truckZone;
    ctx.save();
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -s.time * 12;
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.35 + s.zonePulse * 0.5;
    ctx.lineWidth = 2.2;
    ctx.stroke(sketchEdges(rectPts(z.x + 6, z.y + 6, z.w - 12, z.h - 10), true, 900 + boil, 0, 1.5));
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = INK;
    ctx.font = `26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('load it in here!', z.x + z.w / 2, z.y + 44);
    ctx.restore();
  }

  private drawShadow(ctx: CanvasRenderingContext2D, world: World, x: number, bottom: number, width: number): void {
    const sy = world.surfaceBelow(x, bottom - 4);
    if (sy === null) return;
    const gap = sy - bottom;
    if (gap > 320) return;
    const k = 1 - Math.max(0, gap) / 320;
    ctx.fillStyle = `rgba(59, 50, 41, ${0.2 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, sy + 1, width * 0.5 * (0.5 + 0.5 * k), 4.5 * k + 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------------
  // jelly
  // ------------------------------------------------------------------

  private drawBlob(ctx: CanvasRenderingContext2D, b: Blob, s: RenderState, boil: number): void {
    const path = blobPath(b.points);
    const cx = b.cx;
    const cy = b.cy;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const R = (w + h) / 4;

    ctx.fillStyle = b.color;
    ctx.fill(path);

    // shading: a darker crescent low on the body, a wet highlight up top
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = b.dark;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(cx + R * 0.28, cy + R * 1.05, R * 1.25, R * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = '#FFFFFF';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - R * 0.12, cy - R * 0.1, R * 0.62, Math.PI * 1.12, Math.PI * 1.42);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ink outline, drawn twice a hair apart like a pen going round
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.stroke(path);
    ctx.save();
    ctx.translate(rnd(b.id * 3 + boil) * 0.9, rnd(b.id * 5 + boil) * 0.9);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.1;
    ctx.stroke(path);
    ctx.restore();

    this.drawFace(ctx, b, cx, cy, w / 52, h / 52, s);

    // player number, small and friendly
    ctx.fillStyle = b.dark;
    ctx.globalAlpha = 0.85;
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(b.playerIndex + 1), cx, b.minY - 8);
    ctx.globalAlpha = 1;
  }

  private drawFace(ctx: CanvasRenderingContext2D, b: Blob, cx: number, cy: number, sx: number, sy: number, s: RenderState): void {
    const fx = cx + b.lookX * 7 * sx;
    const fy = cy - 4 * sy + b.lookY * 3.5;
    const eyeDx = 8.5 * sx;
    const v = b.velocity(s.world.h);

    // cheeks
    ctx.fillStyle = '#E98B7F';
    ctx.globalAlpha = 0.35;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(fx + d * (eyeDx + 6), fy + 7 * sy, 4.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // eyes
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    for (const d of [-1, 1]) {
      const ex = fx + d * eyeDx;
      if (b.blink > 0) {
        ctx.beginPath();
        ctx.moveTo(ex - 3.5, fy);
        ctx.quadraticCurveTo(ex, fy + 2.5, ex + 3.5, fy);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.ellipse(ex, fy, 3.2, 4.4 * Math.min(1.25, Math.max(0.7, sy)), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ex - 1 + b.lookX, fy - 1.6, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
    }

    // mouth
    const my = fy + 9 * sy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (v.y > 520) {
      ctx.ellipse(fx, my + 1, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.grab) {
      // effort face: tight little wiggle
      ctx.moveTo(fx - 5, my);
      ctx.quadraticCurveTo(fx - 2.5, my - 2, fx, my);
      ctx.quadraticCurveTo(fx + 2.5, my + 2, fx + 5, my);
      ctx.stroke();
    } else if (Math.abs(v.x) > 200) {
      ctx.moveTo(fx - 5, my - 1);
      ctx.quadraticCurveTo(fx, my + 7, fx + 5, my - 1);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.moveTo(fx - 4, my);
      ctx.quadraticCurveTo(fx, my + 4, fx + 4, my);
      ctx.stroke();
    }
  }

  private drawGrabs(ctx: CanvasRenderingContext2D, s: RenderState): void {
    for (const b of s.blobs) {
      const g = b.grab;
      if (!g) continue;
      const q = g.targetPos();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(g.p.x, g.p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------
  // furniture
  // ------------------------------------------------------------------

  private drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture, boil: number): void {
    const { w, h } = f.spec;
    const col = FURN_COLORS[f.type];
    const seed = f.id * 31 + boil * 7;
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.angle);
    const x = -w / 2;
    const y = -h / 2;

    const shape = (pts: Pt[], fill: string, width = 2.2, k = 0) => {
      ctx.fillStyle = fill;
      ctx.fill(wobblyPath(pts, true, seed + k, 0.7, 20));
      ctx.strokeStyle = INK;
      ctx.lineWidth = width;
      ctx.stroke(sketchEdges(pts, true, seed + k + 3, 2.5, 1));
    };
    const line = (pts: Pt[], width = 1.5, alpha = 1, color = INK) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke(wobblyPath(pts, false, seed + pts[0].x, 0.5, 14));
      ctx.globalAlpha = 1;
    };

    if (f.type === 'box') {
      shape(rectPts(x, y, w, h), col.main);
      ctx.fillStyle = col.light;
      ctx.fillRect(-w * 0.12, y + 1, w * 0.24, h - 2);
      line([{ x: -w * 0.12, y }, { x: -w * 0.12, y: -h * 0.1 }], 1.2, 0.6);
      line([{ x: w * 0.12, y }, { x: w * 0.12, y: -h * 0.1 }], 1.2, 0.6);
      line([{ x: x + 6, y: y + h * 0.62 }, { x: x + 14, y: y + h * 0.5 }, { x: x + 22, y: y + h * 0.62 }], 1.5, 0.7);
      line([{ x: x + 14, y: y + h * 0.5 }, { x: x + 14, y: y + h * 0.8 }], 1.5, 0.7);
    } else if (f.type === 'couch') {
      const arm = 18;
      shape(rectPts(x + arm - 4, y, w - arm * 2 + 8, h * 0.62), col.dark, 2.2, 1);
      shape(rectPts(x + arm - 2, y + h * 0.48, w - arm * 2 + 4, h * 0.34), col.light, 2, 2);
      line([{ x: 0, y: y + h * 0.5 }, { x: 0, y: y + h * 0.8 }], 1.4, 0.7);
      shape(rectPts(x, y + 12, arm, h - 20), col.main, 2.2, 3);
      shape(rectPts(x + w - arm, y + 12, arm, h - 20), col.main, 2.2, 4);
      shape(rectPts(x + arm, y + h * 0.8, w - arm * 2, h * 0.2 - 8), col.main, 2, 5);
      for (const lx of [x + 8, x + w - 14]) shape(rectPts(lx, y + h - 9, 6, 9), '#7A5638', 1.4, 6 + lx);
    } else if (f.type === 'piano') {
      shape(rectPts(x, y + 6, w, h - 14), col.main, 2.4);
      shape(rectPts(x - 3, y, w + 6, 10), col.dark, 2.2, 1);
      const ky = y + h * 0.42;
      shape(rectPts(x + 5, ky, w - 10, 12), '#FBF6EA', 1.8, 2);
      ctx.fillStyle = INK;
      for (let i = 0; i < 12; i++) {
        if (i % 7 === 2 || i % 7 === 6) continue;
        ctx.fillRect(x + 11 + i * ((w - 20) / 12), ky, 3.5, 7);
      }
      line([{ x: x + 10, y: ky + 22 }, { x: x + w - 10, y: ky + 22 }], 1.2, 0.5, col.light);
      shape(rectPts(x + 14, y + 14, w - 28, h * 0.22), col.light, 1.4, 3);
      for (const lx of [x + 14, x + w - 14]) {
        ctx.fillStyle = '#2E2A26';
        ctx.beginPath();
        ctx.arc(lx, y + h - 5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // lamp: glow, shade, stem, base
      if (!f.broken) {
        const glow = ctx.createRadialGradient(0, y + 10, 2, 0, y + 10, 46);
        glow.addColorStop(0, 'rgba(255, 226, 140, 0.5)');
        glow.addColorStop(1, 'rgba(255, 226, 140, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-50, y - 40, 100, 100);
      }
      line([{ x: 0, y: y + 18 }, { x: 0, y: y + h - 6 }], 3, 1, '#7A5638');
      shape(rectPts(x + 2, y + h - 7, w - 4, 7), '#9C6B45', 1.6, 1);
      shape(
        [
          { x: x + 6, y },
          { x: x + w - 6, y },
          { x: x + w, y: y + 20 },
          { x, y: y + 20 },
        ],
        col.main,
        2,
        2
      );
    }

    // cracks as it takes damage
    const cracks = Math.floor(f.damage / 20);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < cracks; i++) {
      const s0 = f.id * 13 + i * 5.3;
      let px = rnd(s0) * w * 0.35;
      let py = rnd(s0 + 1) * h * 0.35;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        px += rnd(s0 + k + 2) * 9;
        py += 5 + Math.abs(rnd(s0 + k + 7)) * 4;
        ctx.lineTo(px, Math.min(py, h / 2 - 2));
      }
      ctx.stroke();
    }
    if (f.broken) {
      ctx.fillStyle = 'rgba(80, 70, 60, 0.3)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  private drawDamageMeter(ctx: CanvasRenderingContext2D, f: Furniture, boil: number): void {
    const bw = f.type === 'lamp' ? 34 : 46;
    const bh = 7;
    const x = f.cx - bw / 2;
    const y = f.minY - 18;
    const d = Math.min(100, f.damage) / 100;
    ctx.fillStyle = PAPER;
    ctx.fillRect(x, y, bw, bh);
    // green -> tomato as it gets hurt
    const r = Math.round(127 + (232 - 127) * d);
    const g = Math.round(176 + (115 - 176) * d);
    const b = Math.round(105 + (90 - 105) * d);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, bw * (1 - d), bh);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke(sketchEdges(rectPts(x, y, bw, bh), true, f.id * 7 + boil, 1.5, 0.5));
    if (f.delivered) {
      ctx.strokeStyle = '#5A8A47';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 2);
      ctx.lineTo(x - 9, y + 8);
      ctx.lineTo(x - 2, y - 4);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------
  // debug (F1)
  // ------------------------------------------------------------------

  private drawDebug(ctx: CanvasRenderingContext2D, s: RenderState): void {
    ctx.save();
    ctx.lineWidth = 1;
    for (const st of s.world.statics) {
      const n = st.pts.length;
      for (let i = 0; i < n; i++) {
        const a = st.pts[i];
        const b = st.pts[(i + 1) % n];
        ctx.strokeStyle = st.internal[i] ? 'rgba(0,120,255,0.35)' : 'rgba(0,120,255,0.9)';
        ctx.setLineDash(st.internal[i] ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const b of s.world.bodies) {
      ctx.strokeStyle = 'rgba(255,0,120,0.6)';
      for (const c of b.constraints) {
        ctx.beginPath();
        ctx.moveTo(c.a.x, c.a.y);
        ctx.lineTo(c.b.x, c.b.y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,160,80,0.8)';
      ctx.beginPath();
      b.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      for (const p of b.points) {
        const grounded = s.world.time - p.groundTime < 0.05;
        ctx.fillStyle = grounded ? '#00B050' : '#FF0066';
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(b.cx, b.cy);
      ctx.lineTo(b.cx + Math.sin(b.angle) * 16, b.cy - Math.cos(b.angle) * 16);
      ctx.stroke();
    }
    ctx.strokeStyle = '#FF8800';
    ctx.lineWidth = 2;
    for (const g of s.world.grabs) {
      const q = g.targetPos();
      ctx.beginPath();
      ctx.moveTo(g.p.x, g.p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    const z = s.level.truckZone;
    ctx.strokeStyle = 'rgba(255,136,0,0.8)';
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.restore();
  }

  private drawDebugHud(ctx: CanvasRenderingContext2D, s: RenderState): void {
    const pts = s.world.bodies.reduce((n, b) => n + b.points.length, 0);
    const lines = [
      `fps ${s.fps.toFixed(0)}`,
      `bodies ${s.world.bodies.length}  points ${pts}  grabs ${s.world.grabs.length}`,
      'F1: hide physics debug',
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(8, s.cssH - 78, 300, 70);
    ctx.fillStyle = '#000';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, 16, s.cssH - 58 + i * 18));
  }
}

