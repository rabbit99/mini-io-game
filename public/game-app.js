// ===== Grid & Food Chunking =====
const GRID_TILE_DIM = 400;
let gridCanvas = null;
function buildGridTile() {
  const c = document.createElement("canvas");
  c.width = c.height = GRID_TILE_DIM;
  const gctx = c.getContext("2d");
  gctx.fillStyle = "#181d24";
  gctx.fillRect(0, 0, GRID_TILE_DIM, GRID_TILE_DIM);
  gctx.strokeStyle = "#222a36";
  gctx.lineWidth = 2;
  gctx.beginPath();
  gctx.moveTo(0, 0);
  gctx.lineTo(GRID_TILE_DIM, 0);
  gctx.moveTo(0, 0);
  gctx.lineTo(0, GRID_TILE_DIM);
  gctx.stroke();
  return c;
}
gridCanvas = buildGridTile();

const FOOD_CHUNK_SIZE = 600;
const foodChunks = new Map(); // key: chunkKey(cx,cy) => {canvas, cx, cy}
let foodDirtyTimer = 0;
function chunkKey(cx, cy) {
  return cx + "," + cy;
}
function rebuildFoodChunks() {
  foodChunks.clear();
  // 將所有食物依 chunk 分組
  for (const f of app.foodMap.values()) {
    const cx = Math.floor(f.x / FOOD_CHUNK_SIZE);
    const cy = Math.floor(f.y / FOOD_CHUNK_SIZE);
    const key = chunkKey(cx, cy);
    let ch = foodChunks.get(key);
    if (!ch) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = FOOD_CHUNK_SIZE;
      ch = { canvas, cx, cy, items: [] };
      foodChunks.set(key, ch);
    }
    ch.items.push(f);
  }
  // 繪製每個 chunk
  for (const ch of foodChunks.values()) {
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
}

// 當食物有變動時，觸發重建
function markFoodDirty() {
  foodDirtyTimer = 2;
}

// ===== Name Canvas Cache =====
const nameCanvasCache = new Map();
function getNameCanvas(name, fontPx) {
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
// =============================
// Mini IO Game - Modular Client
// =============================

// ===== UI & DOM =====
let canvas, ctx, W, H;

function initGameApp() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  eventHandlers.register();
  startGame();
}

// ===== App State =====
const app = {
  myId: null,
  worldSize: 4000,
  inGame: false,
  dead: false,
  inputSeq: 0,
  mouse: { x: 0, y: 0 },
  basePlayerRadius: null,
  basePlayerScore: 0,
  state: { players: [], food: [], viewR: 0 },
  foodMap: new Map(), // id -> {id,x,y,color}
};

// ===== Fog Settings =====
const FOG = {
  ENABLED: true,
  EDGE_OPACITY: 0.58,
  BASE_INNER_FRAC: 0.7,
  BASE_OUTER_FRAC: 0.95,
  MODE: "radius", // 'radius' | 'score' | 'none'
  SCALE_STRENGTH: 0.6,
  MAX_MULTIPLIER: 1.9,
};

// ===== Networking & Interpolation =====
const net = {
  socket: io(),
  playerSnapshots: [], // push {t, players:Map}
  playerVel: new Map(), // id -> {vx, vy}
  NET_INTERP_DELAY: 100, // ms back in time for interpolation
  lastPlayers: new Map(),
  lastPlayersTime: 0,
};

// ===== Event Handlers Module =====
const eventHandlers = {
  onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  },
  onMouseMove(e) {
    app.mouse.x = e.clientX;
    app.mouse.y = e.clientY;
  },
  onKeyDown(e) {
    if (e.key === "F3" || e.key === "f3") {
      fpsVisible = !fpsVisible;
      if (!fpsVisible) document.getElementById("fps").textContent = "";
    }
  },
  onStartBtn() {
    const name = (document.getElementById("playerName").value || "").trim();
    net.socket.emit("join", { name });
    document.getElementById("nameInputWrap").style.display = "none";
  },
  sendInput() {
    if (!app.myId || !app.inGame || app.dead) return;
    const me = app.state.players.find((p) => p.id === app.myId);
    if (!me) return;
    const cx = W / 2,
      cy = H / 2;
    const dirX = app.mouse.x - cx;
    const dirY = app.mouse.y - cy;
    net.socket.emit("input", { dirX, dirY, seq: ++app.inputSeq });
  },
  register() {
    window.addEventListener("resize", eventHandlers.onResize);
    canvas.addEventListener("mousemove", eventHandlers.onMouseMove);
    window.addEventListener("keydown", eventHandlers.onKeyDown);
    document.getElementById("startBtn").onclick = eventHandlers.onStartBtn;
    setInterval(eventHandlers.sendInput, 50);
  },
};
// eventHandlers.register(); // 移到 DOMContentLoaded 之後

// ===== Render Module =====
let viewScale = 1;
const render = {
  viewScale: 1,
  background(me) {
    ctx.save();
    if (me) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(render.viewScale, render.viewScale);
      ctx.translate(-me.x, -me.y);
    } else {
      ctx.translate(W / 2, H / 2);
      ctx.scale(0.6, 0.6);
      ctx.translate(-app.worldSize / 2, -app.worldSize / 2);
    }
    // Draw tiled grid
    // ...existing code for gridCanvas, GRID_TILE_DIM, etc. (assume gridCanvas is defined globally as before)...
    if (typeof gridCanvas !== "undefined") {
      const tile = gridCanvas;
      const tileWorldSize = GRID_TILE_DIM;
      const startX = Math.floor(0 / tileWorldSize) * tileWorldSize;
      const startY = Math.floor(0 / tileWorldSize) * tileWorldSize;
      for (let x = startX; x < app.worldSize; x += tileWorldSize) {
        for (let y = startY; y < app.worldSize; y += tileWorldSize) {
          ctx.drawImage(tile, x, y);
        }
      }
    }
  },
  food(me) {
    if (typeof foodDirtyTimer !== "undefined" && foodDirtyTimer > 0) {
      foodDirtyTimer--;
      if (foodDirtyTimer === 0) rebuildFoodChunks();
    }
    if (me && typeof FOOD_CHUNK_SIZE !== "undefined") {
      const pad = 800;
      const minX = me.x - W / render.viewScale / 2 - pad;
      const maxX = me.x + W / render.viewScale / 2 + pad;
      const minY = me.y - H / render.viewScale / 2 - pad;
      const maxY = me.y + H / render.viewScale / 2 + pad;
      const cMinX = Math.floor(Math.max(0, minX) / FOOD_CHUNK_SIZE);
      const cMaxX = Math.floor(Math.min(app.worldSize, maxX) / FOOD_CHUNK_SIZE);
      const cMinY = Math.floor(Math.max(0, minY) / FOOD_CHUNK_SIZE);
      const cMaxY = Math.floor(Math.min(app.worldSize, maxY) / FOOD_CHUNK_SIZE);
      for (let cx = cMinX; cx <= cMaxX; cx++) {
        for (let cy = cMinY; cy <= cMaxY; cy++) {
          const key = chunkKey(cx, cy);
          const ch = foodChunks.get(key);
          if (!ch) continue;
          ctx.drawImage(ch.canvas, cx * FOOD_CHUNK_SIZE, cy * FOOD_CHUNK_SIZE);
        }
      }
    } else if (typeof foodChunks !== "undefined") {
      for (const ch of foodChunks.values()) {
        ctx.drawImage(
          ch.canvas,
          ch.cx * FOOD_CHUNK_SIZE,
          ch.cy * FOOD_CHUNK_SIZE
        );
      }
    }
  },
  players(playersInterpolated, me) {
    let visiblePlayers = playersInterpolated;
    if (me) {
      const viewRadius = app.state.viewR || 1600;
      const vr2 = viewRadius * viewRadius * 1.3;
      visiblePlayers = app.state.players.filter((p) => {
        const dx = p.x - me.x,
          dy = p.y - me.y;
        return dx * dx + dy * dy <= vr2;
      });
    }
    const sorted = [...visiblePlayers].sort((a, b) => a.r - b.r);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of sorted) {
      ctx.beginPath();
      ctx.fillStyle = p.c;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.name) {
        const fontPx = Math.max(12, p.r * 0.5);
        const cached = getNameCanvas(p.name, Math.round(fontPx));
        ctx.drawImage(cached.canvas, p.x - cached.w / 2, p.y - cached.h / 2);
      }
    }
  },
  fog(me) {
    if (!FOG.ENABLED || !app.inGame || app.dead) return;
    if (!me) return;
    if (app.basePlayerRadius == null) app.basePlayerRadius = me.r;
    if (app.basePlayerScore === 0) app.basePlayerScore = Math.max(1, me.s);
    let mult = 1;
    if (FOG.MODE === "radius") {
      const growth = Math.max(1, me.r / app.basePlayerRadius);
      mult = 1 + (Math.sqrt(growth) - 1) * FOG.SCALE_STRENGTH;
    } else if (FOG.MODE === "score") {
      const val = me.s;
      mult = 1 + (Math.log10(1 + val) / 2.5) * FOG.SCALE_STRENGTH;
    }
    mult = clamp(mult, 0.5, FOG.MAX_MULTIPLIER);
    let innerFrac = FOG.BASE_INNER_FRAC * mult;
    let outerFrac = FOG.BASE_OUTER_FRAC * mult;
    outerFrac = Math.min(0.99, outerFrac);
    innerFrac = Math.min(outerFrac - 0.02, innerFrac);
    const cx = W / 2,
      cy = H / 2;
    const radiusBase = Math.min(W, H) / 2;
    const inner = radiusBase * innerFrac;
    const outer = radiusBase * outerFrac;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${FOG.EDGE_OPACITY})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  hud(me) {
    if (me) {
      document.getElementById("mass").textContent = me.r.toFixed(1);
      document.getElementById("score").textContent = me.s;
    }
    document.getElementById("pcount").textContent = app.state.players.length;
    document.getElementById("fcount").textContent = app.foodMap.size;
    document.getElementById("binsize").textContent = lastBinSize || "-";
  },
  leaderboard() {
    const lb = [...app.state.players].sort((a, b) => b.s - a.s).slice(0, 8);
    document.getElementById("leaderboard").innerHTML =
      "<b>排行榜</b><br/>" +
      lb.map((p, i) => `${i + 1}. ${p.name || "anon"} - ${p.s}`).join("<br/>");
  },
};

// ===== Networking Events =====
let lastBinSize = 0;
let lastPlayers = new Map();
let lastPlayersTime = 0;
const playerSnapshots = [];
const playerVel = new Map();
const NET_INTERP_DELAY = 100;
net.socket.on("init", (data) => {
  app.myId = data.id;
  app.worldSize = data.worldSize;
});
net.socket.on("joined", (data) => {
  app.inGame = true;
  app.dead = false;
  document.getElementById("deathMsg").style.display = "none";
});
net.socket.on("death", (data) => {
  app.inGame = false;
  app.dead = true;
  const msg = document.getElementById("deathMsg");
  const best = data.bestScore ?? data.finalScore;
  msg.innerHTML = `你被吃掉了！<br/>本局分數: <b>${data.finalScore}</b><br/>最高分: <b>${best}</b><br/>再試一次？`;
  msg.style.display = "block";
  document.getElementById("nameInputWrap").style.display = "block";
});
net.socket.on("state", (s) => {
  app.state.viewR = s.viewR;
  if (s.size) document.getElementById("pktsize").textContent = s.size;
  if (s.addFood) {
    for (const f of s.addFood) app.foodMap.set(f.id, f);
    markFoodDirty();
  }
  if (s.removeFood) {
    for (const id of s.removeFood) app.foodMap.delete(id);
    markFoodDirty();
  }
  let pMap;
  if (s.full) {
    pMap = new Map();
    for (const p of s.players) {
      const prev = lastPlayers.get(p.id);
      if (prev) {
        const dt = (s.t - lastPlayersTime) / 1000;
        if (dt > 0)
          playerVel.set(p.id, {
            vx: (p.x - prev.x) / dt,
            vy: (p.y - prev.y) / dt,
          });
      }
      lastPlayers.set(p.id, p);
      pMap.set(p.id, { ...p });
    }
  } else {
    for (const p of s.add || []) {
      const prev = lastPlayers.get(p.id);
      if (prev) {
        const dt = (s.t - lastPlayersTime) / 1000;
        if (dt > 0)
          playerVel.set(p.id, {
            vx: (p.x - prev.x) / dt,
            vy: (p.y - prev.y) / dt,
          });
      }
      lastPlayers.set(p.id, p);
    }
    for (const p of s.upd || []) {
      const prev = lastPlayers.get(p.id);
      if (prev) {
        const dt = (s.t - lastPlayersTime) / 1000;
        if (dt > 0)
          playerVel.set(p.id, {
            vx: (p.x - prev.x) / dt,
            vy: (p.y - prev.y) / dt,
          });
      }
      const merged = { ...(lastPlayers.get(p.id) || {}), ...p };
      lastPlayers.set(p.id, merged);
    }
    for (const id of s.rem || []) {
      lastPlayers.delete(id);
      playerVel.delete(id);
    }
    pMap = new Map();
    for (const [id, p] of lastPlayers) pMap.set(id, { ...p });
  }
  lastPlayersTime = s.t;
  playerSnapshots.push({ t: s.t, players: pMap });
  const cutoff = performance.now() - 2000;
  while (playerSnapshots.length && playerSnapshots[0].t < cutoff)
    playerSnapshots.shift();
});
net.socket.on("stateb", (buf) => {
  try {
    decodeBinaryState(buf);
  } catch (e) {}
});
let lastPingSent = 0;
const rttSamples = [];
const MAX_RTT_SAMPLES = 30;
function sendPing() {
  lastPingSent = performance.now();
  net.socket.emit("pingCheck", lastPingSent);
}
net.socket.on("pongCheck", (clientStamp) => {
  const now = performance.now();
  const rtt = Math.round(now - clientStamp);
  document.getElementById("rtt").textContent = rtt;
  rttSamples.push(rtt);
  if (rttSamples.length > MAX_RTT_SAMPLES) rttSamples.shift();
  if (rttSamples.length >= 2) {
    const avg = rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length;
    const variance =
      rttSamples.reduce((a, b) => a + (b - avg) * (b - avg), 0) /
      rttSamples.length;
    const jitter = Math.round(Math.sqrt(variance));
    document.getElementById("jitter").textContent = jitter;
  }
});
setInterval(sendPing, 2000);

// ===== Interpolation & Draw Loop =====
function getInterpolatedPlayers() {
  if (playerSnapshots.length < 2) return app.state.players;
  const renderTime = Date.now() - NET_INTERP_DELAY;
  let i = playerSnapshots.length - 1;
  while (i > 0 && playerSnapshots[i - 1].t > renderTime) i--;
  const newer = playerSnapshots[i];
  if (!newer) return app.state.players;
  if (i === 0) return Array.from(newer.players.values());
  const older = playerSnapshots[i - 1];
  const span = newer.t - older.t || 1;
  const f = clamp((renderTime - older.t) / span, 0, 1);
  const out = [];
  for (const [id, np] of newer.players) {
    const op = older.players.get(id) || np;
    let x = op.x + (np.x - op.x) * f;
    let y = op.y + (np.y - op.y) * f;
    if (id === app.myId) {
      const vel = playerVel.get(id);
      if (vel) {
        const future = (Date.now() - newer.t) / 1000;
        x += vel.vx * future * 0.9;
        y += vel.vy * future * 0.9;
      }
    }
    out.push({
      id,
      x,
      y,
      r: op.r + (np.r - op.r) * f,
      c: np.c,
      s: np.s,
      name: np.name,
    });
  }
  return out;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const playersInterpolated = getInterpolatedPlayers();
  app.state.players = playersInterpolated;
  const me = playersInterpolated.find((p) => p.id === app.myId);
  let desiredScale = 1;
  if (me) {
    const maxFrac = 0.3;
    desiredScale = Math.min(1, (maxFrac * Math.min(W, H)) / me.r);
    desiredScale = clamp(desiredScale, 0.18, 1);
  }
  render.viewScale =
    render.viewScale + (desiredScale - render.viewScale) * 0.12;
  ctx.save();
  render.background(me);
  render.food(me);
  render.players(playersInterpolated, me);
  ctx.restore();
  render.fog(me);
  render.hud(me);
  render.leaderboard();
  updateFPS();
  requestAnimationFrame(draw);
}

// ===== Utilities =====
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// ===== FPS Counter =====
let lastFpsUpdate = 0,
  frameCount = 0;
function updateFPS() {
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

// ===== 啟動 =====
export function startGame() {
  draw();
}

// 預設自動啟動，等 DOM 完成
window.addEventListener("DOMContentLoaded", initGameApp);
