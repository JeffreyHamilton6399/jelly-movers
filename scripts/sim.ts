// Headless physics checks: `npm run sim`. Prints numbers used to tune the feel.
import { World, makeRect, makePoly } from '../src/physics/world';
import { Blob, BLOB } from '../src/entities/blob';
import { Furniture } from '../src/entities/furniture';
import { buildLevel } from '../src/level/level';

const G = 900;
function flatWorld(): World {
  const w = new World();
  w.statics.push(makeRect(-2000, G, 6000, 200, 0.8, 'ground'));
  return w;
}
const run = (w: World, sec: number, each?: (t: number) => void) => {
  for (let i = 0; i < sec * 60; i++) {
    each?.(i / 60);
    w.step();
  }
};
const f1 = (n: number) => n.toFixed(1);
const size = (b: Blob) => `${f1(b.maxX - b.minX)}x${f1(b.maxY - b.minY)}`;
const finite = (w: World) => w.bodies.every((b) => b.points.every((p) => Number.isFinite(p.x + p.y)));

// 1. rest shape
{
  const w = flatWorld();
  const b = w.addBody(new Blob(0, 700, 0, '', '', ''));
  let minH = 999;
  run(w, 3, () => (minH = Math.min(minH, b.maxY - b.minY)));
  console.log(`rest: size ${size(b)}, squash on landing min h ${f1(minH)}, bottom ${f1(b.maxY)}, ok=${finite(w)}`);
}

// 2. run speed + jump height
{
  const w = flatWorld();
  const b = w.addBody(new Blob(0, G - 28, 0, '', '', ''));
  run(w, 0.5);
  b.input.moveX = 1;
  let t60 = -1;
  run(w, 1.2, (t) => {
    if (t60 < 0 && b.velocity(w.h).x > 300) t60 = t;
  });
  console.log(`run: vx ${f1(b.velocity(w.h).x)} px/s, reached 300 in ${f1(t60 * 1000)}ms, size ${size(b)}`);
  b.input.moveX = 0;
  run(w, 0.6);
  console.log(`stop: vx ${f1(b.velocity(w.h).x)}`);
  const y0 = b.cy;
  let top = y0;
  b.input.jumpHeld = true;
  b.queueJump(w.time);
  run(w, 1.2, () => (top = Math.min(top, b.cy)));
  console.log(`jump (held): height ${f1(y0 - top)}`);
  b.input.jumpHeld = false;
  top = b.cy;
  const y1 = b.cy;
  b.queueJump(w.time);
  run(w, 1.2, () => (top = Math.min(top, b.cy)));
  console.log(`jump (tap): height ${f1(y1 - top)}`);
}

// 3. tower of 4
for (const n of [3, 4]) {
  const w = flatWorld();
  const bs: Blob[] = [];
  for (let i = 0; i < n; i++) bs.push(w.addBody(new Blob(0 + (i % 2) * 3, G - 30 - i * 56, i, '', '', '')));
  run(w, 6);
  const desc = bs.map((b) => `(${f1(b.cx)},${f1(b.cy)} ${size(b)})`).join(' ');
  const standing = bs.every((b, i) => i === 0 || b.cy < bs[i - 1].cy - 25);
  console.log(`tower${n}: standing=${standing} ok=${finite(w)} ${desc}`);
}

// 4. tower survives the top blob making small balancing moves
{
  const w = flatWorld();
  const bs: Blob[] = [];
  for (let i = 0; i < 3; i++) bs.push(w.addBody(new Blob(0, G - 30 - i * 56, i, '', '', '')));
  run(w, 2);
  // short balancing taps, alternating direction, like a player steadying the top
  run(w, 3, (t) => (bs[2].input.moveX = t % 0.6 < 0.12 ? (Math.floor(t / 0.6) % 2 ? 1 : -1) : 0));
  bs[2].input.moveX = 0;
  run(w, 2);
  const standing = bs.every((b, i) => i === 0 || b.cy < bs[i - 1].cy - 25);
  console.log(`tower3 wiggle: standing=${standing} ${bs.map((b) => `(${f1(b.cx)},${f1(b.cy)})`).join(' ')}`);
}

// 5. climbing slopes keeps full speed
for (const deg of [15, 36]) {
  const w = flatWorld();
  const rise = Math.tan((deg * Math.PI) / 180) * 2000;
  w.statics.push(makePoly([{ x: 0, y: G }, { x: 2000, y: G - rise }, { x: 2000, y: G }], 0.8, 'ramp', [1, 2]));
  const b = w.addBody(new Blob(-60, G - 28, 0, '', '', ''));
  run(w, 0.3);
  b.input.moveX = 1;
  run(w, 1.5);
  console.log(`slope ${deg}deg: vx ${f1(b.velocity(w.h).x)}`);
}

// 6. piano: one blob can't budge it, two can (flat and up a truck-like ramp)
for (const [mode, ramp] of [['pull', false], ['pull+push', false], ['pull+push', true]] as const) {
  const w = flatWorld();
  if (ramp) {
    w.statics.length = 0;
    w.statics.push(makeRect(-2000, G, 2060, 200, 0.8, 'ground'));
    w.statics.push(makePoly([{ x: 60, y: G }, { x: 300, y: G - 34 }, { x: 300, y: G }], 0.8, 'ramp', [1, 2]));
    w.statics.push(makeRect(300, G - 34, 2000, 34, 0.8, 'bed', [2, 3]));
  }
  const piano = w.addBody(new Furniture('piano', 0, G - 47.5));
  const puller = w.addBody(new Blob(80, G - 28, 0, '', '', ''));
  const pusher = mode === 'pull+push' ? w.addBody(new Blob(-80, G - 28, 1, '', '', '')) : null;
  run(w, 0.6);
  puller.tryGrab(w);
  const x0 = piano.cx;
  run(w, 3, () => {
    puller.input.moveX = 1;
    if (pusher) pusher.input.moveX = 1;
  });
  console.log(`piano ${mode}${ramp ? ' +ramp' : ''}: moved ${f1(piano.cx - x0)} in 3s`);
}

// 7. full level settles without explosions
{
  const level = buildLevel();
  const w = new World();
  w.statics.push(...level.statics);
  const fs = level.furnSpawns.map((f) => w.addBody(new Furniture(f.kind, f.x, f.y)));
  const bs = level.blobSpawns.map((s, i) => w.addBody(new Blob(s.x, s.y, i, '', '', '')));
  run(w, 4);
  console.log(
    `level: ok=${finite(w)} furn ${fs.map((f) => `${f.type}(${f1(f.cx)},${f1(f.cy)}) v=${f1(Math.hypot(f.velocity(w.h).x, f.velocity(w.h).y))}`).join(' ')}`
  );
  console.log(`level blobs ${bs.map((b) => `(${f1(b.cx)},${f1(b.cy)})`).join(' ')}`);
}
void BLOB;
