// 遊戲全域狀態與設定
export const app = {
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
  MODE: "radius",
  SCALE_STRENGTH: 0.6,
  MAX_MULTIPLIER: 1.9,
};

export const GRID_TILE_DIM = 400;
export const FOOD_CHUNK_SIZE = 600;
export let gridCanvas = null;
export let foodChunks = new Map();
export let foodDirtyTimer = 0;

export function setGridCanvas(c) {
  gridCanvas = c;
}
export function setFoodChunks(map) {
  foodChunks = map;
}
export function setFoodDirtyTimer(val) {
  foodDirtyTimer = val;
}

// 食物資料變動時標記重建
export function markFoodDirty() {
  foodDirtyTimer = 2;
}
