export type Phase = 'menu' | 'playing' | 'ended';

export type FurnKind = 'box' | 'couch' | 'piano' | 'lamp';

export interface PlayerDef {
  name: string;
  color: string;
  dark: string;
}

/** crayon-box colours: soft, a little dusty, easy to tell apart */
export const PLAYERS: PlayerDef[] = [
  { name: 'Tomato', color: '#E8735A', dark: '#B8503C' },
  { name: 'Pickle', color: '#7FB069', dark: '#5A8A47' },
  { name: 'Butter', color: '#F2C14E', dark: '#C99A2E' },
  { name: 'Berry', color: '#9B7BC7', dark: '#735A9E' },
];

export const ROUND_TIME = 180;

export interface ItemResult {
  kind: FurnKind;
  label: string;
  delivered: boolean;
  damage: number;
  pay: number;
}

export interface RoundResult {
  win: boolean;
  items: ItemResult[];
  delivered: number;
  totalDamage: number;
  basePay: number;
  timeBonus: number;
  totalPay: number;
}
