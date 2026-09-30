# Jelly Movers

A 2D local co-op physics game in the browser. You're squishy jelly blobs running a moving
company: get the box, couch, piano and lamp out of the house and into the truck before the
3-minute timer runs out. The piano needs two blobs; the lamp sits on a high shelf, so stack up.

TypeScript + Vite + Canvas 2D. No engine: a custom position-based Verlet physics engine runs
blobs, furniture and level geometry in one system.

## Controls

| Player | Move    | Jump             | Grab / release    |
| ------ | ------- | ---------------- | ----------------- |
| P1     | A / D   | Space (or W)     | E                 |
| P2     | ← / →   | Enter (or ↑)     | Shift             |
| Pads   | stick / d-pad | A          | X / B             |

Press any key or pad button to join, and Enter (or a pad's Start) to begin. Hold jump to jump higher.
**F1** toggles the physics debug view.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + static build into dist/
npm run sim      # headless physics checks (tower stability, piano needs 2, slopes...)
```

## Deploy (Vercel)

Import the repo in Vercel. `vercel.json` sets the Vite preset, `npm run build`, and `dist/` as
the output, so no extra config is needed.

## Layout

```
src/
  physics/   points, constraints, bodies (shape matching + area pressure), world solver
  entities/  Blob (player jelly) and Furniture
  input/     keyboard + Gamepad API, join slots
  level/     the house + truck geometry
  render/    camera, hand-drawn sketch helpers, level art, renderer, particles
  audio/     Web Audio synth sounds
  ui/        DOM menu / HUD / end screen
  game.ts    fixed-timestep loop and rules
scripts/sim.ts  headless tuning checks
```
