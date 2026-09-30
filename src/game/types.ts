export type Phase = 'menu' | 'playing' | 'ended';

export interface PlayerDef {
  name: string;
  color: string;
  dark: string;
}

export const PLAYERS: PlayerDef[] = [
  { name: 'Rosie', color: '#FF6B6B', dark: '#D14B4B' },
  { name: 'Mint', color: '#2EC4B6', dark: '#1B9E93' },
  { name: 'Sunny', color: '#FFC53D', dark: '#D9A021' },
  { name: 'Plum', color: '#C79BF2', dark: '#A274D6' },
];

export type FurnKind = 'box' | 'couch' | 'piano' | 'lamp';

export interface SlotSnapshot {
  index: number;
  name: string;
  color: string;
  joined: boolean;
  deviceLabel: string | null;
}

export interface ItemSnapshot {
  kind: FurnKind;
  label: string;
  delivered: boolean;
  damage: number;
  pay: number;
}

export interface ResultSnapshot {
  win: boolean;
  timeUsed: number;
  basePay: number;
  timeBonus: number;
  totalPay: number;
}

export interface GameSnapshot {
  phase: Phase;
  timeLeft: number;
  slots: SlotSnapshot[];
  joinedCount: number;
  canStart: boolean;
  items: ItemSnapshot[];
  deliveredCount: number;
  totalDamage: number;
  pay: number;
  result: ResultSnapshot | null;
}

export const ROUND_TIME = 180;
