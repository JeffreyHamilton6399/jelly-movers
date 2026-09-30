import { makeSegment, type StaticSegment } from '../physics/world';
import type { FurnKind } from '../types';

export interface FurnSpawn {
  kind: FurnKind;
  x: number;
  y: number;
}

export interface TruckZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelData {
  worldW: number;
  worldH: number;
  statics: StaticSegment[];
  furnSpawns: FurnSpawn[];
  blobSpawns: { x: number; y: number }[];
  truckZone: TruckZone;
  menuView: { x: number; y: number; w: number; h: number };
}

export const LEVEL = {
  groundY: 900,
  houseLeft: 90,
  houseRight: 820,
  doorTop: 760,
  upperFloorY: 560,
  upperSlabFrom: 430,
  stairsX0: 170,
  stairsX1: 430,
  stairsSteps: 10,
  stairsRise: 34,
  stairsRun: 26,
  shelfY: 410,
  shelfX0: 660,
  shelfX1: 812,
  roofApexX: 455,
  roofApexY: 58,
  roofBaseY: 170,
  truckBedX0: 1150,
  truckBedX1: 1560,
  truckBedY: 840,
  truckWallTop: 668,
  cabX0: 1560,
  cabX1: 1700,
  cabRoofY: 655,
  rampX0: 940,
  rampX1: 1148,
  rampY1: 842,
};

export function buildLevel(): LevelData {
  const statics: StaticSegment[] = [];
  const seg = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    halfW: number,
    friction: number,
    tag: string
  ) => statics.push(makeSegment(ax, ay, bx, by, halfW, friction, tag));

  // ground + bounds (segments are thin: the visual surface is the line itself)
  seg(-100, LEVEL.groundY, 1790, LEVEL.groundY, 5, 0.12, 'ground');
  seg(-70, LEVEL.groundY, -70, 150, 6, 0.1, 'bounds');

  // house walls (door opening on the right wall, ground level)
  seg(LEVEL.houseLeft, LEVEL.groundY, LEVEL.houseLeft, LEVEL.roofBaseY, 6, 0.1, 'wall');
  seg(LEVEL.houseRight, LEVEL.doorTop, LEVEL.houseRight, LEVEL.roofBaseY, 6, 0.1, 'wall');

  // upper floor slab (stair hole from stairsX0..upperSlabFrom)
  seg(LEVEL.upperSlabFrom, LEVEL.upperFloorY, LEVEL.houseRight, LEVEL.upperFloorY, 7, 0.12, 'floor');

  // stairs: treads + risers
  for (let i = 0; i < LEVEL.stairsSteps; i++) {
    const x = LEVEL.stairsX0 + i * LEVEL.stairsRun;
    const y = LEVEL.groundY - (i + 1) * LEVEL.stairsRise;
    seg(x, y, x + LEVEL.stairsRun, y, 5, 0.12, 'stairs');
    seg(x, y, x, y + LEVEL.stairsRise, 5, 0.12, 'stairs');
  }

  // high shelf for the lamp
  seg(LEVEL.shelfX0, LEVEL.shelfY, LEVEL.shelfX1, LEVEL.shelfY, 5, 0.12, 'shelf');

  // roof
  seg(LEVEL.houseLeft, LEVEL.roofBaseY, LEVEL.roofApexX, LEVEL.roofApexY, 6, 0.1, 'roof');
  seg(LEVEL.roofApexX, LEVEL.roofApexY, LEVEL.houseRight, LEVEL.roofBaseY, 6, 0.1, 'roof');

  // moving truck: bed + walls + cab
  seg(LEVEL.truckBedX0, LEVEL.truckBedY, LEVEL.truckBedX1, LEVEL.truckBedY, 7, 0.12, 'truck');
  seg(LEVEL.truckBedX0, LEVEL.truckBedY, LEVEL.truckBedX0, LEVEL.truckWallTop, 6, 0.1, 'truckwall');
  seg(LEVEL.truckBedX1, LEVEL.truckBedY, LEVEL.truckBedX1, LEVEL.truckWallTop, 6, 0.1, 'truckwall');
  seg(LEVEL.cabX0 + 8, LEVEL.cabRoofY, LEVEL.cabX1 - 2, LEVEL.cabRoofY, 6, 0.1, 'cab');
  seg(LEVEL.cabX1 - 2, LEVEL.cabRoofY, LEVEL.cabX1 - 2, LEVEL.groundY - 10, 6, 0.1, 'cab');

  // loading ramp (gentle slope)
  seg(LEVEL.rampX0, LEVEL.groundY, LEVEL.rampX1, LEVEL.rampY1, 6, 0.08, 'ramp');

  return {
    worldW: 1760,
    worldH: 1000,
    statics,
    furnSpawns: [
      // bottom points placed exactly at each surface's rest height,
      // footprints spaced to not overlap (incl. point radii)
      { kind: 'piano', x: 490, y: 849 },
      { kind: 'box', x: 585, y: 858 },
      { kind: 'couch', x: 710, y: 857 },
      { kind: 'lamp', x: 735, y: 383 },
    ],
    blobSpawns: [
      { x: 845, y: 852 },
      { x: 872, y: 832 },
      { x: 899, y: 852 },
      { x: 926, y: 832 },
    ],
    truckZone: { x: 1162, y: 662, w: 388, h: 174 },
    menuView: { x: 40, y: 20, w: 1560, h: 940 },
  };
}
