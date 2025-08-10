/* eslint-disable import/order */
import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createServer } from "http";
import { customAlphabet } from "nanoid";
import { Server, Socket } from "socket.io";
import type { PlayerServer, FoodItem } from "../types.d.ts";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
const TICK_RATE = 30;
const WORLD_SIZE = 4000;
const START_MASS = 30;
const FOOD_COUNT = 500;
const FOOD_VALUE = 3;
const MAX_SPEED = 300;
const VIEW_BASE = 1200;
const VIEW_GROWTH = 4;
const USE_BINARY = true;

const players = new Map<string, PlayerServer>();
const food = new Map<string, FoodItem>();
const highScores = new Map<string, number>();

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randInt(min: number, max: number) {
  return Math.floor(rand(min, max));
}
function newFoodItem(): FoodItem {
  return {
    id: nanoid(),
    x: rand(0, WORLD_SIZE),
    y: rand(0, WORLD_SIZE),
    color: `hsl(${randInt(0, 360)} 80% 60%)`,
  };
}
function _spawnFoodIfNeeded() {
  while (food.size < FOOD_COUNT)
    food.set(
      (() => {
        const f = newFoodItem();
        return f.id;
      })(),
      newFoodItem()
    );
}

function spawnPlayer(id: string, name: string): PlayerServer {
  const p: PlayerServer = {
    id,
    name: name?.slice(0, 16) || "anon",
    x: rand(0, WORLD_SIZE),
    y: rand(0, WORLD_SIZE),
    radius: START_MASS,
    targetDir: { x: 0, y: 0 },
    speed: 0,
    color: `hsl(${randInt(0, 360)} 70% 50%)`,
    score: 0,
    lastInputSeq: 0,
    prevFood: new Set(),
    prevPlayers: new Set(),
    lastSentPlayers: new Map(),
  };
  players.set(id, p);
  return p;
}

const app = express();
// Attempt to read build manifest for hash exposure
let BUILD_HASH: string | null = null;
async function loadBuildHash() {
  try {
    const manifestPath = path.resolve("dist", "meta", "bundle-manifest.json");
    const raw = await fs.readFile(manifestPath, "utf8");
    const json = JSON.parse(raw);
    if (json?.current?.hash) BUILD_HASH = json.current.hash;
  } catch {
    BUILD_HASH = null;
  }
}
loadBuildHash();
setInterval(loadBuildHash, 10000).unref();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
app.use((req, res, next) => {
  if (BUILD_HASH) res.setHeader("X-Build-Hash", BUILD_HASH);
  next();
});
app.get("/build-info", (_req, res) => {
  res.json({ buildHash: BUILD_HASH });
});
app.use(express.static("public"));

io.on("connection", (socket: Socket) => {
  socket.emit("init", { id: socket.id, worldSize: WORLD_SIZE });
  socket.on("join", (data: { name?: string }) => {
    if (players.has(socket.id)) return;
    const name = (data?.name || "").toString();
    const p = spawnPlayer(socket.id, name);
    if (!highScores.has(socket.id)) highScores.set(socket.id, 0);
    socket.emit("joined", { id: p.id, name: p.name });
  });
  socket.on("input", (data: { dirX?: number; dirY?: number; seq?: number }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const { dirX, dirY, seq } = data || {};
    if (typeof dirX === "number" && typeof dirY === "number") {
      const mag = Math.hypot(dirX, dirY) || 1;
      p.targetDir.x = dirX / mag;
      p.targetDir.y = dirY / mag;
      p.lastInputSeq = seq ?? p.lastInputSeq;
    }
  });
  socket.on("disconnect", () => {
    players.delete(socket.id);
  });
  socket.on("pingCheck", (t: number) => {
    socket.emit("pongCheck", t);
  });
});

function handlePhysics(dt: number) {
  for (const p of players.values()) {
    const baseSpeed = MAX_SPEED / (1 + (p.radius - START_MASS) / 80);
    const vx = p.targetDir.x * baseSpeed;
    const vy = p.targetDir.y * baseSpeed;
    p.x += vx * dt;
    p.y += vy * dt;
    p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
    p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));
  }
  for (const p of players.values()) {
    for (const f of food.values()) {
      const dx = f.x - p.x;
      const dy = f.y - p.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < p.radius * p.radius) {
        food.delete(f.id);
        p.radius += FOOD_VALUE * 0.6;
        p.score += FOOD_VALUE;
      }
    }
  }
  const toRemove: string[] = [];
  const arr = Array.from(players.values());
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i],
        b = arr[j];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < Math.max(a.radius, b.radius)) {
        if (a.radius > b.radius * 1.15) {
          a.radius += b.radius * 0.5;
          a.score += Math.round(b.radius);
          toRemove.push(b.id);
        } else if (b.radius > a.radius * 1.15) {
          b.radius += a.radius * 0.5;
          b.score += Math.round(a.radius);
          toRemove.push(a.id);
        }
      }
    }
  }
  for (const id of toRemove) {
    const sock = io.sockets.sockets.get(id);
    const victim = players.get(id);
    if (victim && sock) {
      const finalScore = victim.score;
      const prevBest = highScores.get(id) ?? 0;
      const best = finalScore > prevBest ? finalScore : prevBest;
      highScores.set(id, best);
      sock.emit("death", { finalScore, bestScore: best });
    }
    players.delete(id);
  }
}

function gameLoop() {
  const dt = 1 / TICK_RATE;
  if (food.size < FOOD_COUNT) {
    while (food.size < FOOD_COUNT) {
      const f = newFoodItem();
      food.set(f.id, f);
    }
  }
  handlePhysics(dt);
  const now = Date.now();
  const playerArr = Array.from(players.values());
  const foodArr = Array.from(food.values());
  (gameLoop as any).tick = ((gameLoop as any).tick || 0) + 1;
  const sendFullPlayers = (gameLoop as any).tick % 30 === 0;
  for (const p of playerArr) {
    const viewR = VIEW_BASE + p.radius * VIEW_GROWTH;
    const viewR2 = viewR * viewR;
    const currentPlayersSet = new Set<string>();
    const playersAdd: any[] = [];
    const playersUpd: any[] = [];
    const playersFull: any[] = [];
    for (const op of playerArr) {
      const dx = op.x - p.x,
        dy = op.y - p.y;
      if (dx * dx + dy * dy <= viewR2 * 1.4) {
        currentPlayersSet.add(op.id);
        const basePayload = {
          id: op.id,
          x: op.x,
          y: op.y,
          r: op.radius,
          c: op.color,
          s: op.score,
          name: op.name,
        };
        if (sendFullPlayers) {
          playersFull.push(basePayload);
          p.lastSentPlayers.set(op.id, {
            x: op.x,
            y: op.y,
            r: op.radius,
            s: op.score,
          });
        } else {
          if (!p.prevPlayers.has(op.id)) {
            playersAdd.push(basePayload);
            p.lastSentPlayers.set(op.id, {
              x: op.x,
              y: op.y,
              r: op.radius,
              s: op.score,
            });
          } else {
            const last = p.lastSentPlayers.get(op.id);
            if (
              !last ||
              Math.abs(last.x - op.x) > 0.5 ||
              Math.abs(last.y - op.y) > 0.5 ||
              Math.abs(last.r - op.radius) > 0.2 ||
              last.s !== op.score
            ) {
              playersUpd.push({
                id: op.id,
                x: op.x,
                y: op.y,
                r: op.radius,
                s: op.score,
              });
              p.lastSentPlayers.set(op.id, {
                x: op.x,
                y: op.y,
                r: op.radius,
                s: op.score,
              });
            }
          }
        }
      }
    }
    const playersRem: string[] = [];
    for (const pid of p.prevPlayers)
      if (!currentPlayersSet.has(pid)) {
        playersRem.push(pid);
        p.lastSentPlayers.delete(pid);
      }
    p.prevPlayers = currentPlayersSet;
    const currentSet = new Set<string>();
    const addFood: FoodItem[] = [];
    for (const f of foodArr) {
      const dx = f.x - p.x,
        dy = f.y - p.y;
      if (dx * dx + dy * dy <= viewR2) {
        currentSet.add(f.id);
        if (!p.prevFood.has(f.id)) addFood.push(f);
      }
    }
    const removeFood: string[] = [];
    for (const fid of p.prevFood) if (!currentSet.has(fid)) removeFood.push(fid);
    p.prevFood = currentSet;
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      const payload = sendFullPlayers
        ? {
            t: now,
            full: true as const,
            players: playersFull,
            addFood,
            removeFood,
            viewR,
          }
        : {
            t: now,
            full: false as const,
            add: playersAdd,
            upd: playersUpd,
            rem: playersRem,
            addFood,
            removeFood,
            viewR,
          };
      let approxSize = 0;
      try {
        approxSize = Buffer.byteLength(JSON.stringify(payload));
      } catch {}
      sock.emit("state", { ...payload, size: approxSize });
      if (USE_BINARY) {
        try {
          const bin = buildBinaryState(payload);
          sock.emit("stateb", bin);
        } catch {}
      }
    }
  }
}

function buildBinaryState(payload: any): Buffer {
  const { t, viewR } = payload;
  const full = payload.full;
  let len = 0;
  len += 4 + 1 + 4;
  if (full) {
    const pls = payload.players as any[];
    len += 2;
    for (const p of pls) {
      len += 1 + Buffer.byteLength(p.id) + 4 * 3 + 4 + 2 + 2;
    }
    const nameSet = new Map<number, string>();
    for (const p of pls) {
      const h = hash16(p.name || "");
      if (!nameSet.has(h)) nameSet.set(h, p.name || "");
    }
    len += 2;
    for (const [, name] of nameSet) {
      len += 2 + 1 + Buffer.byteLength(name);
    }
  } else {
    len += 2;
    for (const p of payload.add) len += 1 + Buffer.byteLength(p.id) + 4 * 3 + 4 + 2 + 2;
    len += 2;
    for (const p of payload.upd) len += 1 + Buffer.byteLength(p.id) + 4 * 3 + 4;
    len += 2;
    for (const id of payload.rem) len += 1 + Buffer.byteLength(id);
    const nameSet = new Map<number, string>();
    for (const p of payload.add) {
      const h = hash16(p.name || "");
      if (!nameSet.has(h)) nameSet.set(h, p.name || "");
    }
    len += 2;
    for (const [, name] of nameSet) {
      len += 2 + 1 + Buffer.byteLength(name);
    }
  }
  len += 2;
  for (const f of payload.addFood) len += 1 + Buffer.byteLength(f.id) + 4 * 2 + 2;
  len += 2;
  for (const id of payload.removeFood) len += 1 + Buffer.byteLength(id);
  const buf = Buffer.allocUnsafe(len);
  let o = 0;
  buf.writeUInt32LE(t >>> 0, o);
  o += 4;
  buf[o++] = full ? 1 : 0;
  o = writeF32(buf, o, viewR);
  if (full) {
    const pls = payload.players as any[];
    buf.writeUInt16LE(pls.length, o);
    o += 2;
    for (const p of pls) {
      o = writeStr(buf, o, p.id);
      o = writeF32(buf, o, p.x);
      o = writeF32(buf, o, p.y);
      o = writeF32(buf, o, p.r);
      buf.writeUInt32LE(p.s >>> 0, o);
      o += 4;
      const hue = extractHue(p.c);
      buf.writeUInt16LE(hue, o);
      o += 2;
      buf.writeUInt16LE(hash16(p.name || ""), o);
      o += 2;
    }
    const nameSet = new Map<number, string>();
    for (const p of pls) {
      const h = hash16(p.name || "");
      if (!nameSet.has(h)) nameSet.set(h, p.name || "");
    }
    buf.writeUInt16LE(nameSet.size, o);
    o += 2;
    for (const [h, name] of nameSet) {
      buf.writeUInt16LE(h, o);
      o += 2;
      o = writeStr(buf, o, name);
    }
  } else {
    buf.writeUInt16LE(payload.add.length, o);
    o += 2;
    for (const p of payload.add) {
      o = writeStr(buf, o, p.id);
      o = writeF32(buf, o, p.x);
      o = writeF32(buf, o, p.y);
      o = writeF32(buf, o, p.r);
      buf.writeUInt32LE(p.s >>> 0, o);
      o += 4;
      const hue = extractHue(p.c);
      buf.writeUInt16LE(hue, o);
      o += 2;
      buf.writeUInt16LE(hash16(p.name || ""), o);
      o += 2;
    }
    buf.writeUInt16LE(payload.upd.length, o);
    o += 2;
    for (const p of payload.upd) {
      o = writeStr(buf, o, p.id);
      o = writeF32(buf, o, p.x);
      o = writeF32(buf, o, p.y);
      o = writeF32(buf, o, p.r);
      buf.writeUInt32LE(p.s >>> 0, o);
      o += 4;
    }
    buf.writeUInt16LE(payload.rem.length, o);
    o += 2;
    for (const id of payload.rem) o = writeStr(buf, o, id);
    const nameSet = new Map<number, string>();
    for (const p of payload.add) {
      const h = hash16(p.name || "");
      if (!nameSet.has(h)) nameSet.set(h, p.name || "");
    }
    buf.writeUInt16LE(nameSet.size, o);
    o += 2;
    for (const [h, name] of nameSet) {
      buf.writeUInt16LE(h, o);
      o += 2;
      o = writeStr(buf, o, name);
    }
  }
  buf.writeUInt16LE(payload.addFood.length, o);
  o += 2;
  for (const f of payload.addFood) {
    o = writeStr(buf, o, f.id);
    o = writeF32(buf, o, f.x);
    o = writeF32(buf, o, f.y);
    const hue = extractHue(f.color);
    buf.writeUInt16LE(hue, o);
    o += 2;
  }
  buf.writeUInt16LE(payload.removeFood.length, o);
  o += 2;
  for (const id of payload.removeFood) o = writeStr(buf, o, id);
  return buf;
}

function writeStr(buf: Buffer, o: number, s: string) {
  const b = Buffer.from(s);
  buf[o] = b.length;
  o += 1;
  b.copy(buf, o);
  return o + b.length;
}
function writeF32(buf: Buffer, o: number, v: number) {
  buf.writeFloatLE(v, o);
  return o + 4;
}
function extractHue(col: string) {
  const m = /hsl\((\d+)/.exec(col);
  return m ? parseInt(m[1], 10) : 0;
}
function hash16(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0xffff;
}

setInterval(gameLoop, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log("Game server listening on :" + PORT);
});
