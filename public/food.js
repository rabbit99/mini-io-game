// 食物快取與分塊渲染
import {
  app,
  FOOD_CHUNK_SIZE,
  foodChunks,
  foodDirtyTimer,
  setFoodChunks,
  setFoodDirtyTimer,
} from "./state.js";

// 重建食物區塊：依 chunk 分組並繪製到各自離屏 canvas
export function rebuildFoodChunks() {
  const newMap = new Map();
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
  // 繪製內容
  for (const ch of newMap.values()) {
    const ctx2 = ch.canvas.getContext("2d");
    ctx2.clearRect(0, 0, FOOD_CHUNK_SIZE, FOOD_CHUNK_SIZE);
    for (const f of ch.items) {
      ctx2.beginPath();
      ctx2.arc(
        f.x - ch.cx * FOOD_CHUNK_SIZE,
        f.y - ch.cy * FOOD_CHUNK_SIZE,
        7,
        0,
        Math.PI * 2
      );
      ctx2.fillStyle = f.color || f.c || "#ff0";
      ctx2.fill();
    }
  }
  setFoodChunks(newMap);
}

// 內部：遞減 dirty 計時並在需要時重建
function ensureChunks() {
  if (foodDirtyTimer > 0) {
    setFoodDirtyTimer(foodDirtyTimer - 1);
    if (foodDirtyTimer - 1 === 0) {
      rebuildFoodChunks();
    }
  }
}

// 主繪製：若食物量大使用 chunk，否則直接畫點
export function drawFood(ctx, me, viewScale) {
  ensureChunks();
  const total = app.foodMap.size;
  const useChunks = total > 250 && foodChunks.size; // 閾值可調
  if (!useChunks) {
    for (const f of app.foodMap.values()) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = f.color || "#ff0";
      ctx.fill();
    }
    return;
  }
  // 視野裁切（加 padding）
  let minX = 0,
    minY = 0,
    maxX = Infinity,
    maxY = Infinity;
  if (me) {
    const halfW = (window.innerWidth / viewScale) * 0.5;
    const halfH = (window.innerHeight / viewScale) * 0.5;
    const pad = 600; // 額外緩衝，避免快速移動邊緣空白
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
      const ch = foodChunks.get(key);
      if (!ch) continue;
      ctx.drawImage(ch.canvas, cx * FOOD_CHUNK_SIZE, cy * FOOD_CHUNK_SIZE);
    }
  }
}
