// 工具函式
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// 玩家名稱快取繪製
const nameCanvasCache = new Map();
export function getNameCanvas(name, fontPx) {
  const key = name + ":" + fontPx;
  if (nameCanvasCache.has(key)) return nameCanvasCache.get(key);
  const canvas = document.createElement("canvas");
  const ctx2 = canvas.getContext("2d");
  ctx2.font = `bold ${fontPx}px system-ui,sans-serif`;
  const w = Math.ceil(ctx2.measureText(name).width) + 8;
  const h = fontPx + 4;
  canvas.width = w;
  canvas.height = h;
  ctx2.font = `bold ${fontPx}px system-ui,sans-serif`;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.fillStyle = "#fff";
  ctx2.strokeStyle = "#222";
  ctx2.lineWidth = 4;
  ctx2.strokeText(name, w / 2, h / 2);
  ctx2.fillText(name, w / 2, h / 2);
  const result = { canvas, w, h };
  nameCanvasCache.set(key, result);
  return result;
}

// FPS 計算
let lastFpsUpdate = 0,
  frameCount = 0;
export function updateFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsUpdate > 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    const fpsElem = document.getElementById("fps");
    if (fpsElem) fpsElem.textContent = fps;
    lastFpsUpdate = now;
    frameCount = 0;
  }
}
