/**
 * Hand-drawn line helpers. Everything is deterministic per `seed`, so a shape
 * holds still until the global "boil" frame changes (a few times a second),
 * which gives the gentle line-wobble of hand-drawn animation.
 */

export interface Pt {
  x: number;
  y: number;
}

export const INK = '#3B3229';
export const PAPER = '#F3EAD7';
export const FONT = '"Patrick Hand", "Gochi Hand", "Segoe Print", "Comic Sans MS", cursive';

/** stable pseudo-random in [-1, 1] */
export function rnd(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Resample a polyline into ~step-long pieces, nudging each vertex a little. */
function wobble(pts: Pt[], closed: boolean, seed: number, amp: number, step: number): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let k = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const parts = Math.max(1, Math.round(len / step));
    for (let j = 0; j < parts; j++) {
      const t = j / parts;
      const m = j === 0 ? 0.5 : 1; // corners stay put-ish
      out.push({
        x: a.x + (b.x - a.x) * t + rnd(seed + k * 1.31) * amp * m,
        y: a.y + (b.y - a.y) * t + rnd(seed + k * 2.17 + 50) * amp * m,
      });
      k++;
    }
  }
  if (!closed) {
    const last = pts[n - 1];
    out.push({ x: last.x + rnd(seed + k) * amp * 0.5, y: last.y + rnd(seed + k + 9) * amp * 0.5 });
  }
  return out;
}

/** smooth path through points using midpoint quadratics */
function smooth(path: Path2D | CanvasRenderingContext2D, pts: Pt[], closed: boolean): void {
  const n = pts.length;
  if (n < 2) return;
  if (!closed) {
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      path.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    path.lineTo(pts[n - 1].x, pts[n - 1].y);
    return;
  }
  const m0x = (pts[n - 1].x + pts[0].x) / 2;
  const m0y = (pts[n - 1].y + pts[0].y) / 2;
  path.moveTo(m0x, m0y);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    path.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  path.closePath();
}

/** A wobbly, smooth line or closed shape. */
export function wobblyPath(pts: Pt[], closed: boolean, seed: number, amp = 1.2, step = 16): Path2D {
  const path = new Path2D();
  smooth(path, wobble(pts, closed, seed, amp, step), closed);
  return path;
}

/**
 * Sketchy outline: each edge is its own slightly bowed stroke that overshoots
 * the corners, like a quick pen drawing.
 */
export function sketchEdges(pts: Pt[], closed: boolean, seed: number, overshoot = 3, bow = 1.4): Path2D {
  const path = new Path2D();
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const s = seed + i * 7.7;
    const o0 = overshoot * (0.4 + 0.6 * Math.abs(rnd(s)));
    const o1 = overshoot * (0.4 + 0.6 * Math.abs(rnd(s + 1)));
    const ax = a.x - ux * o0 + rnd(s + 2) * 0.8;
    const ay = a.y - uy * o0 + rnd(s + 3) * 0.8;
    const bx = b.x + ux * o1 + rnd(s + 4) * 0.8;
    const by = b.y + uy * o1 + rnd(s + 5) * 0.8;
    const bend = rnd(s + 6) * bow * Math.min(1, len / 60);
    path.moveTo(ax, ay);
    path.quadraticCurveTo((ax + bx) / 2 - uy * bend, (ay + by) / 2 + ux * bend, bx, by);
  }
  return path;
}

export function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 18): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

/** Closed Catmull-Rom spline through points (for jelly outlines). */
export function blobPath(pts: Pt[], tension = 0.5): Path2D {
  const path = new Path2D();
  const n = pts.length;
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const t = tension / 3;
    path.bezierCurveTo(
      p1.x + (p2.x - p0.x) * t,
      p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t,
      p2.y - (p3.y - p1.y) * t,
      p2.x,
      p2.y
    );
  }
  path.closePath();
  return path;
}

/**
 * Pen hatching clipped to a path: parallel strokes at `angle`, used for
 * shadows and shading instead of gradients.
 */
export function hatch(
  ctx: CanvasRenderingContext2D,
  clip: Path2D,
  box: { x: number; y: number; w: number; h: number },
  seed: number,
  spacing = 7,
  angle = -0.9,
  color = INK,
  alpha = 0.18,
  width = 1.1
): void {
  ctx.save();
  ctx.clip(clip);
  ctx.strokeStyle = color;
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = width;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = Math.hypot(box.w, box.h) / 2 + 4;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const path = new Path2D();
  let i = 0;
  for (let d = -r; d <= r; d += spacing) {
    const ox = cx - uy * d + rnd(seed + i) * 1.2;
    const oy = cy + ux * d + rnd(seed + i + 3) * 1.2;
    path.moveTo(ox - ux * r, oy - uy * r);
    path.lineTo(ox + ux * r + rnd(seed + i + 5) * 2, oy + uy * r);
    i++;
  }
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Paper grain as a transparent speckle texture. It's shown by a static CSS
 * overlay (see main.ts), so it costs nothing per frame.
 */
export function makePaperTexture(size = 200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const fleck = Math.random() < 0.012;
    img.data[i * 4] = 110;
    img.data[i * 4 + 1] = 90;
    img.data[i * 4 + 2] = 60;
    img.data[i * 4 + 3] = fleck ? 70 : Math.random() * 26;
  }
  g.putImageData(img, 0, 0);
  // a few long fibres
  g.strokeStyle = 'rgba(120, 100, 70, 0.12)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * 10 + 4, y + Math.sin(a) * 10, x + Math.cos(a) * 22, y + Math.sin(a) * 22);
    g.stroke();
  }
  return c;
}
