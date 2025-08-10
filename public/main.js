// 主程式，組合所有模組
import { app, setGridCanvas } from "./state.js";
import { render } from "./render.js";
import { eventHandlers } from "./events.js";
import { net } from "./net.js";
import { updateFPS, clamp } from "./util.js";
import { drawFood } from "./food.js";

// ====== 主程式細節補齊 ======
let canvas, ctx, W, H;
let viewScale = 1;
let fpsVisible = true;

function buildGridTile() {
  const c = document.createElement("canvas");
  c.width = c.height = 400;
  const gctx = c.getContext("2d");
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
  // 定時發送 input 事件，確保玩家能移動
  setInterval(() => {
    if (app.inGame && !app.dead && net.socket) {
      const cx = window.innerWidth / 2,
        cy = window.innerHeight / 2;
      const dirX = app.mouse.x - cx;
      const dirY = app.mouse.y - cy;
      net.socket.emit("input", { dirX, dirY, seq: ++app.inputSeq });
    }
  }, 50);
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  // 註冊所有 DOM 事件
  const fpsVisibleRef = { value: fpsVisible };
  eventHandlers.register(canvas, net, fpsVisibleRef);
  // 初始化 socket 並註冊所有事件
  net.init(io());
  // 建立背景格線快取
  setGridCanvas(buildGridTile());
  startGame();
}

function startGame() {
  draw();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const players = net.getInterpolatedPlayers();
  const me = players.find((p) => p.id === app.myId);
  // 動態縮放（根據自身半徑）
  let desired = 1;
  if (me) {
    const maxFrac = 0.3;
    desired = Math.min(1, (maxFrac * Math.min(W, H)) / me.r);
    desired = clamp(desired, 0.18, 1);
  }
  viewScale += (desired - viewScale) * 0.12;
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
  render.players(players, me, ctx);
  ctx.restore();
  render.fog(me, ctx, W, H);
  render.hud(me, ctx, W, H);
  render.leaderboard(ctx, W, H);
  updateFPS();
  requestAnimationFrame(draw);
}

window.addEventListener("DOMContentLoaded", initGameApp);
