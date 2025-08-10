// 工具函式 (TypeScript)
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// 玩家名稱快取繪製
interface NameCanvasCacheEntry {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}
const nameCanvasCache = new Map<string, NameCanvasCacheEntry>();
export function getNameCanvas(name: string, fontPx: number): NameCanvasCacheEntry {
  const key = name + ":" + fontPx;
  const cached = nameCanvasCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const ctx2 = canvas.getContext("2d")!;
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
let lastFpsUpdate = 0;
let frameCount = 0;
export function updateFPS(): void {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsUpdate > 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    const fpsElem = document.getElementById("fps");
    if (fpsElem) fpsElem.textContent = String(fps);
    lastFpsUpdate = now;
    frameCount = 0;
  }
}
