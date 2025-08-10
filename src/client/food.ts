// 食物快取與分塊渲染 (TypeScript)
import {
  app,
  FOOD_CHUNK_SIZE,
  foodChunks,
  foodDirtyTimer,
  setFoodChunks,
  setFoodDirtyTimer,
} from "./state.js";

export interface FoodChunk {
  canvas: HTMLCanvasElement;
  cx: number;
  cy: number;
  items: Array<{ id: string; x: number; y: number; color?: string; c?: string }>;
}

// 重建食物區塊：依 chunk 分組並繪製到各自離屏 canvas
export function rebuildFoodChunks(): void {
  const newMap = new Map<string, FoodChunk>();
  for (const f of app.foodMap.values()) {
    const cx = Math.floor(f.x / FOOD_CHUNK_SIZE);
    const cy = Math.floor(f.y / FOOD_CHUNK_SIZE);
    const key = cx + "," + cy;
    let ch = newMap.get(key);
    if (!ch) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = FOOD_CHUNK_SIZE;
      ch = { canvas, cx, cy, items: [] };
      newMap.set(key, ch);
    }
    ch.items.push(f);
  }
  for (const ch of newMap.values()) {
    const ctx2 = ch.canvas.getContext("2d")!;
    ctx2.clearRect(0, 0, FOOD_CHUNK_SIZE, FOOD_CHUNK_SIZE);
    for (const f of ch.items) {
      ctx2.beginPath();
      ctx2.arc(f.x - ch.cx * FOOD_CHUNK_SIZE, f.y - ch.cy * FOOD_CHUNK_SIZE, 7, 0, Math.PI * 2);
      ctx2.fillStyle = (f as any).color || (f as any).c || "#ff0";
      ctx2.fill();
    }
  }
  setFoodChunks(newMap);
}

function ensureChunks(): void {
  if (foodDirtyTimer > 0) {
    setFoodDirtyTimer(foodDirtyTimer - 1);
    if (foodDirtyTimer - 1 === 0) rebuildFoodChunks();
  }
}

export function drawFood(
  ctx: CanvasRenderingContext2D,
  me: { x: number; y: number } | undefined,
  viewScale: number
): void {
  ensureChunks();
  const total = app.foodMap.size;
  const useChunks = total > 250 && foodChunks.size;
  if (!useChunks) {
    for (const f of app.foodMap.values()) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = (f as any).color || "#ff0";
      ctx.fill();
    }
    return;
  }
  let minX = 0,
    minY = 0,
    maxX = Infinity,
    maxY = Infinity;
  if (me) {
    const halfW = (window.innerWidth / viewScale) * 0.5;
    const halfH = (window.innerHeight / viewScale) * 0.5;
    const pad = 600;
    minX = me.x - halfW - pad;
    maxX = me.x + halfW + pad;
    minY = me.y - halfH - pad;
    maxY = me.y + halfH + pad;
  }
  const cMinX = Math.floor(Math.max(0, minX) / FOOD_CHUNK_SIZE);
  const cMaxX = Math.floor(Math.max(0, maxX) / FOOD_CHUNK_SIZE);
  const cMinY = Math.floor(Math.max(0, minY) / FOOD_CHUNK_SIZE);
  const cMaxY = Math.floor(Math.max(0, maxY) / FOOD_CHUNK_SIZE);
  for (let cx = cMinX; cx <= cMaxX; cx++) {
    for (let cy = cMinY; cy <= cMaxY; cy++) {
      const key = cx + "," + cy;
      const ch = foodChunks.get(key) as FoodChunk | undefined;
      if (!ch) continue;
      ctx.drawImage(ch.canvas, cx * FOOD_CHUNK_SIZE, cy * FOOD_CHUNK_SIZE);
    }
  }
}
