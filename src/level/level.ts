import { makePoly, makeRect, type StaticPoly } from '../physics/world';
import type { Vec2 } from '../physics/math';
import type { FurnKind } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Named geometry, shared by physics setup and the renderer. */
export const L = {
  groundY: 900,
  worldLeft: -60,
  worldRight: 1880,

  houseX0: 60,
  houseX1: 1024,
  wallT: 24,
  roofBaseY: 186,
  roofApex: { x: 542, y: 52 },
  doorTop: 740,

  upperY: 600,
  slabT: 18,
  /** stair flight: floating slab, low end is a hop up from the ground */
  stairLow: { x: 170, y: 815 },
  stairHigh: { x: 470, y: 600 },

  shelf: { x0: 820, x1: 1000, y: 390, t: 12 },

  rampX0: 1080,
  bedX0: 1320,
  bedX1: 1700,
  bedY: 866,
  cargoTop: 648,
  cargoRoofT: 16,
  cab: { x0: 1700, x1: 1840, y: 706 },
};

export interface LevelData {
  worldW: number;
  worldH: number;
  statics: StaticPoly[];
  furnSpawns: { kind: FurnKind; x: number; y: number }[];
  blobSpawns: Vec2[];
  truckZone: Rect;
  menuView: Rect;
}

export function buildLevel(): LevelData {
  const s: StaticPoly[] = [];
  const g = L.groundY;

  // ground + world bounds
  s.push(makeRect(-600, g, 3000, 300, 0.8, 'ground'));
  s.push(makeRect(L.worldLeft - 60, -600, 60, g + 600, 0.3, 'bounds', [2]));
  s.push(makeRect(L.worldRight, -600, 60, g + 600, 0.3, 'bounds', [2]));

  // house walls; the right wall has the front door cut out at the bottom
  s.push(makeRect(L.houseX0, L.roofBaseY - 6, L.wallT, g - L.roofBaseY + 6, 0.4, 'wall', [2]));
  s.push(makeRect(L.houseX1 - L.wallT, L.roofBaseY - 6, L.wallT, L.doorTop - L.roofBaseY + 6, 0.4, 'wall'));

  // roof (solid so nobody escapes through the attic)
  s.push(
    makePoly(
      [
        { x: L.houseX0 - 24, y: L.roofBaseY },
        { x: L.roofApex.x, y: L.roofApex.y },
        { x: L.houseX1 + 24, y: L.roofBaseY },
      ],
      0.5,
      'roof'
    )
  );

  // upper floor: from the top of the stairs to the right wall
  s.push(makeRect(L.stairHigh.x, L.upperY, L.houseX1 - L.wallT - L.stairHigh.x, L.slabT, 0.7, 'floor', [1, 3]));

  // the stair flight: collision is a smooth slab, drawn as steps
  const { stairLow: lo, stairHigh: hi } = L;
  s.push(
    makePoly(
      [
        { x: lo.x, y: lo.y },
        { x: hi.x, y: hi.y },
        { x: hi.x, y: hi.y + L.slabT },
        { x: lo.x, y: lo.y + L.slabT },
      ],
      0.8,
      'stairs',
      [1]
    )
  );

  // high shelf for the lamp
  s.push(makeRect(L.shelf.x0, L.shelf.y, L.shelf.x1 - L.shelf.x0, L.shelf.t, 0.7, 'shelf'));

  // truck: ramp, bed, cargo roof, cab
  s.push(
    makePoly(
      [
        { x: L.rampX0, y: g },
        { x: L.bedX0, y: L.bedY },
        { x: L.bedX0, y: g },
      ],
      0.8,
      'ramp',
      [1, 2]
    )
  );
  s.push(makeRect(L.bedX0, L.bedY, L.bedX1 - L.bedX0, g - L.bedY, 0.7, 'truck', [2, 3]));
  s.push(makeRect(L.bedX0 - 10, L.cargoTop - L.cargoRoofT, L.bedX1 - L.bedX0 + 10, L.cargoRoofT, 0.5, 'truck'));
  s.push(makeRect(L.cab.x0, L.cargoTop - L.cargoRoofT, L.cab.x1 - L.cab.x0, g - L.cargoTop + L.cargoRoofT, 0.5, 'cab', [2]));

  return {
    worldW: L.worldRight,
    worldH: 1000,
    statics: s,
    furnSpawns: [
      // centres sit exactly on their surface (half height above it)
      { kind: 'piano', x: 600, y: g - 45 - 2.5 },
      { kind: 'couch', x: 790, y: g - 29 - 2.5 },
      { kind: 'box', x: 640, y: L.upperY - 25 - 2.5 },
      { kind: 'lamp', x: 852, y: L.shelf.y - 23 - 2.5 },
    ],
    blobSpawns: [
      { x: 900, y: g - 30 },
      { x: 958, y: g - 30 },
      { x: 1050, y: g - 30 },
      { x: 1110, y: g - 36 },
    ],
    truckZone: { x: L.bedX0 + 8, y: L.cargoTop, w: L.bedX1 - L.bedX0 - 14, h: L.bedY - L.cargoTop },
    menuView: { x: -40, y: 20, w: 1920, h: 960 },
  };
}
