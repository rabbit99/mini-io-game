// 遊戲全域狀態與設定 (TypeScript)
export interface PlayerClient {
  id: string;
  x: number;
  y: number;
  r: number;
  c: string;
  s: number;
  name: string;
}
export interface AppState {
  players: PlayerClient[];
  food: any[];
  viewR: number;
}
export interface AppContext {
  myId: string | null;
  worldSize: number;
  inGame: boolean;
  dead: boolean;
  inputSeq: number;
  mouse: { x: number; y: number };
  basePlayerRadius: number | null;
  basePlayerScore: number;
  state: AppState;
  foodMap: Map<string, { id: string; x: number; y: number; color?: string; c?: string }>;
}

export const app: AppContext = {
  myId: null,
  worldSize: 4000,
  inGame: false,
  dead: false,
  inputSeq: 0,
  mouse: { x: 0, y: 0 },
  basePlayerRadius: null,
  basePlayerScore: 0,
  state: { players: [], food: [], viewR: 0 },
  foodMap: new Map(),
};

export const FOG = {
  ENABLED: true,
  EDGE_OPACITY: 0.58,
  BASE_INNER_FRAC: 0.7,
  BASE_OUTER_FRAC: 0.95,
  MODE: "radius" as "radius" | "score",
  SCALE_STRENGTH: 0.6,
  MAX_MULTIPLIER: 1.9,
};

export const GRID_TILE_DIM = 400;
export const FOOD_CHUNK_SIZE = 600;
export let gridCanvas: HTMLCanvasElement | null = null;
export let foodChunks: Map<
  string,
  { canvas: HTMLCanvasElement; cx: number; cy: number; items: any[] }
> = new Map();
export let foodDirtyTimer = 0;

export function setGridCanvas(c: HTMLCanvasElement) {
  gridCanvas = c;
}
export function setFoodChunks(
  map: Map<string, { canvas: HTMLCanvasElement; cx: number; cy: number; items: any[] }>
) {
  foodChunks = map;
}
export function setFoodDirtyTimer(val: number) {
  foodDirtyTimer = val;
}

// 食物資料變動時標記重建
export function markFoodDirty() {
  foodDirtyTimer = 2;
}
