// Shared game type declarations (initial scaffold for TS migration)
export interface FoodItem { id: string; x: number; y: number; color: string; }

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  r: number; // radius
  c: string; // color
  s: number; // score
  name: string;
}

export interface PlayerServer {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  targetDir: { x: number; y: number };
  speed: number;
  color: string;
  score: number;
  lastInputSeq: number;
  prevFood: Set<string>;
  prevPlayers: Set<string>;
  lastSentPlayers: Map<string, { x: number; y: number; r: number; s: number }>;
}

export interface StateFullJSON {
  t: number;
  full: true;
  players: PlayerSnapshot[];
  addFood: FoodItem[];
  removeFood: string[];
  viewR: number;
  size?: number;
}

export interface StateDeltaJSON {
  t: number;
  full: false;
  add: PlayerSnapshot[];
  upd: Array<Pick<PlayerSnapshot, 'id' | 'x' | 'y' | 'r' | 's'>>;
  rem: string[];
  addFood: FoodItem[];
  removeFood: string[];
  viewR: number;
  size?: number;
}

export type AnyStateJSON = StateFullJSON | StateDeltaJSON;
