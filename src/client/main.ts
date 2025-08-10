// 主程式 (TypeScript)
/* global console */
import { eventHandlers } from "./events.js";
import { drawFood } from "./food.js";
import { net } from "./net.js";
import { render } from "./render.js";
import { app, setGridCanvas, PlayerClient } from "./state.js";
import { updateFPS, clamp } from "./util.js";

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let W = 0;
let H = 0;
let viewScale = 1;
let fpsVisible = true;
let lastFrameTime = performance.now();
let smoothedFps = 60;

function buildGridTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 400;
  const gctx = c.getContext("2d")!;
  gctx.fillStyle = "#181d24";
  gctx.fillRect(0, 0, 400, 400);
  gctx.strokeStyle = "#222a36";
  gctx.lineWidth = 2;
  gctx.beginPath();
  gctx.moveTo(0, 0);
  gctx.lineTo(400, 0);
  gctx.moveTo(0, 0);
  gctx.lineTo(0, 400);
  gctx.stroke();
  return c;
}

function initGameApp() {
  setInterval(() => {
    if (app.inGame && !app.dead && net.socket) {
      const cx = window.innerWidth / 2,
        cy = window.innerHeight / 2;
      const dirX = app.mouse.x - cx;
      const dirY = app.mouse.y - cy;
      net.socket.emit("input", { dirX, dirY, seq: ++app.inputSeq });
    }
  }, 50);
  canvas = document.getElementById("game") as HTMLCanvasElement;
  ctx = canvas.getContext("2d")!;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  const fpsVisibleRef = { value: fpsVisible };
  eventHandlers.register(canvas, net, fpsVisibleRef);
  // 允許透過 <meta name="api-origin"> 指定遠端伺服器 (對純 FTP 靜態空間友善)
  const meta = document.querySelector('meta[name="api-origin"]') as HTMLMetaElement | null;
  const apiOrigin = meta?.content.trim() || undefined;
  // 動態載入 socket.io (index.html 已放置 __IO_READY_PROMISE)
  const ioReady: Promise<void> = (window as any).__IO_READY_PROMISE || Promise.resolve();
  ioReady.then(() => {
    // 若 socket.io 載入失敗，給用戶提示
    // @ts-ignore
    if (window.__IO_LOAD_FAILED || typeof io === "undefined") {
      console.error("[io] socket.io script not available");
      const msg = document.getElementById("deathMsg");
      if (msg) {
        msg.style.display = "block";
        msg.innerHTML = "無法連線到伺服器 (socket.io 載入失敗)。請檢查伺服器位址或稍後再試。";
      }
      return;
    }
    // global io()
    // @ts-ignore
    const sock = apiOrigin ? io(apiOrigin, { transports: ["websocket", "polling"] }) : io();
    net.init(sock);
  });
  setGridCanvas(buildGridTile());
  draw();
}

function draw() {
  const now = performance.now();
  const dtMs = now - lastFrameTime;
  lastFrameTime = now;
  const instFps = dtMs > 0 ? 1000 / dtMs : 60;
  // Exponential moving average for FPS
  smoothedFps += (instFps - smoothedFps) * 0.1;
  ctx.clearRect(0, 0, W, H);
  const players = net.getInterpolatedPlayers();
  const me = (players as PlayerClient[]).find((p: PlayerClient) => p.id === app.myId);
  let desired = 1;
  if (me) {
    const maxFrac = 0.3;
    desired = Math.min(1, (maxFrac * Math.min(W, H)) / me.r);
    desired = clamp(desired, 0.18, 1);
  }
  // Adaptive smoothing: faster convergence on high FPS, slower on low FPS
  const kBase = 0.14; // base responsiveness
  const fpsNorm = clamp(smoothedFps / 60, 0.3, 2); // normalize around 60 FPS
  const k = kBase * fpsNorm; // scale factor
  viewScale += (desired - viewScale) * k;
  ctx.save();
  if (me) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(viewScale, viewScale);
    ctx.translate(-me.x, -me.y);
  } else {
    ctx.translate(W / 2, H / 2);
    ctx.scale(0.6, 0.6);
    ctx.translate(-app.worldSize / 2, -app.worldSize / 2);
  }
  render.background(ctx);
  drawFood(ctx, me, viewScale);
  render.players(players as any, me as any, ctx);
  ctx.restore();
  render.fog(me as any, ctx, W, H);
  render.hud(me as any, ctx, W, H);
  render.leaderboard(ctx, W, H);
  updateFPS();
  // If dead, ensure name input is visible & focused once
  if (app.dead) {
    const wrap = document.getElementById("nameInputWrap");
    if (wrap && wrap.style.display !== "block") {
      wrap.style.display = "block";
      const restartBtn = document.getElementById("restartBtn");
      if (restartBtn) restartBtn.style.display = "inline-block";
      const input = document.getElementById("playerName") as HTMLInputElement | null;
      if (input) window.setTimeout(() => input.focus(), 0);
    }
  }
  requestAnimationFrame(draw);
}

window.addEventListener("DOMContentLoaded", initGameApp);
