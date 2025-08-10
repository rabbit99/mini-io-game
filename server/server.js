// =============================
// Mini IO Game Server
// =============================

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { customAlphabet } from "nanoid";

// --- Constants ---
const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
const TICK_RATE = 30; // server updates per second
const WORLD_SIZE = 4000; // square world side length
const START_MASS = 30; // radius base
const FOOD_COUNT = 500;
const FOOD_VALUE = 3;
const MAX_SPEED = 300; // units per second baseline
const VIEW_BASE = 1200; // base view radius
const VIEW_GROWTH = 4; // extra view radius per unit of player radius
const USE_BINARY = true; // toggle binary state emission

// --- Data Structures ---
const players = new Map(); // id -> player
const food = new Map(); // id -> {x,y,color}
const highScores = new Map(); // id -> bestScore

// --- Utility Functions ---
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max));
}
function newFoodItem() {
  return {
    id: nanoid(),
    x: rand(0, WORLD_SIZE),
    y: rand(0, WORLD_SIZE),
    color: `hsl(${randInt(0, 360)} 80% 60%)`,
  };
}
function spawnFoodIfNeeded() {
  while (food.size < FOOD_COUNT) {
    const f = newFoodItem();
    food.set(f.id, f);
  }
}

function spawnPlayer(id, name) {
  const p = {
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

// --- Socket.IO Handlers ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
app.use(express.static("public"));

io.on("connection", (socket) => {
  // Send only world info & socket id; actual player entity created after 'join'
  socket.emit("init", { id: socket.id, worldSize: WORLD_SIZE });
  socket.on("join", (data) => {
    if (players.has(socket.id)) return;
    const name = (data?.name || "").toString();
    const p = spawnPlayer(socket.id, name);
    if (!highScores.has(socket.id)) highScores.set(socket.id, 0);
    socket.emit("joined", { id: p.id, name: p.name });
  });
  socket.on("input", (data) => {
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
  socket.on("pingCheck", (t) => {
    socket.emit("pongCheck", t);
  });
});

function handlePhysics(dt) {
  // Move players
  for (const p of players.values()) {
    const baseSpeed = MAX_SPEED / (1 + (p.radius - START_MASS) / 80);
    const vx = p.targetDir.x * baseSpeed;
    const vy = p.targetDir.y * baseSpeed;
    p.x += vx * dt;
    p.y += vy * dt;
    // Clamp
    p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
    p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));
  }

  // Player-food collisions
  for (const p of players.values()) {
    for (const f of food.values()) {
      const dx = f.x - p.x;
      const dy = f.y - p.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < p.radius * p.radius) {
        // Eat
        food.delete(f.id);
        p.radius += FOOD_VALUE * 0.6;
        p.score += FOOD_VALUE;
      }
    }
  }

  // Player-player collisions (simple): bigger eats smaller if center inside radius
  const toRemove = [];
  const arr = Array.from(players.values());
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i],
        b = arr[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
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
  // Notify deaths before removing
  for (const id of toRemove) {
    const sock = io.sockets.sockets.get(id);
    const victim = players.get(id);
    if (victim) {
      const finalScore = victim.score;
      const prevBest = highScores.get(id) ?? 0;
      const best = finalScore > prevBest ? finalScore : prevBest;
      highScores.set(id, best);
      if (sock) {
        sock.emit("death", { finalScore, bestScore: best });
      }
    }
    players.delete(id);
  }
}

function gameLoop() {
  const dt = 1 / TICK_RATE;
  spawnFoodIfNeeded();
  handlePhysics(dt);

  const now = Date.now();
  const playerArr = Array.from(players.values());
  const foodArr = Array.from(food.values());
  gameLoop.tick = (gameLoop.tick || 0) + 1;
  const sendFullPlayers = gameLoop.tick % 30 === 0; // full snapshot every ~1s

  // For each player individually filter objects to reduce bandwidth
  for (const p of playerArr) {
    const viewR = VIEW_BASE + p.radius * VIEW_GROWTH;
    const viewR2 = viewR * viewR;
    const currentPlayersSet = new Set();
    const playersAdd = [];
    const playersUpd = [];
    const playersFull = [];
    for (const op of playerArr) {
      const dx = op.x - p.x;
      const dy = op.y - p.y;
      if (dx * dx + dy * dy <= viewR2 * 1.4) {
        // some padding
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
    const playersRem = [];
    for (const pid of p.prevPlayers)
      if (!currentPlayersSet.has(pid)) {
        playersRem.push(pid);
        p.lastSentPlayers.delete(pid);
      }
    p.prevPlayers = currentPlayersSet;
    // Food visibility + delta calc
    const currentSet = new Set();
    const addFood = [];
    for (const f of foodArr) {
      const dx = f.x - p.x;
      const dy = f.y - p.y;
      if (dx * dx + dy * dy <= viewR2) {
        currentSet.add(f.id);
        if (!p.prevFood.has(f.id)) {
          addFood.push(f); // newly visible
        }
      }
    }
    const removeFood = [];
    for (const fid of p.prevFood) {
      if (!currentSet.has(fid)) removeFood.push(fid);
    }
    p.prevFood = currentSet;
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      const payload = sendFullPlayers
        ? {
            t: now,
            full: true,
            players: playersFull,
            addFood,
            removeFood,
            viewR,
          }
        : {
            t: now,
            full: false,
            add: playersAdd,
            upd: playersUpd,
            rem: playersRem,
            addFood,
            removeFood,
            viewR,
          };
      // Attach approximate JSON size for diagnostics
      let approxSize = 0;
      try {
        approxSize = Buffer.byteLength(JSON.stringify(payload));
      } catch {}
      sock.emit("state", { ...payload, size: approxSize });
      if (USE_BINARY) {
        try {
          const bin = buildBinaryState(payload);
          sock.emit("stateb", bin);
        } catch (e) {
          // fallback silently
        }
      }
    }
  }
}

// Build a binary buffer for state (variable length)
function buildBinaryState(payload) {
  const { t, viewR } = payload;
  const full = payload.full;
  // Pre-calc length
  let len = 0;
  len += 4; // timestamp
  len += 1; // flags
  len += 4; // viewR
  if (full) {
    const pls = payload.players;
    len += 2;
    for (const p of pls) {
      len += 1 + Buffer.byteLength(p.id) + 4 * 3 + 4; // id + x,y,r + score
      len += 2; // hue
      len += 2; // name hash
    }
    // name dictionary (unique hashes -> raw name)
    const nameSet = new Map(); // hash -> name
    for (const p of pls) {
      const h = hash16(p.name || "");
      if (!nameSet.has(h)) nameSet.set(h, p.name || "");
    }
    len += 2; // dict count
    for (const [h, name] of nameSet) {
      len += 2; // hash
      len += 1 + Buffer.byteLength(name); // length + bytes
    }
  } else {
    len += 2; // add count
    for (const p of payload.add)
      len += 1 + Buffer.byteLength(p.id) + 4 * 3 + 4 + 2 + 2;
    len += 2; // upd count
    for (const p of payload.upd) len += 1 + Buffer.byteLength(p.id) + 4 * 3 + 4;
    len += 2; // rem count
    for (const id of payload.rem) len += 1 + Buffer.byteLength(id);
    // dictionary for added player names (unique)
    const nameSet = new Map();
    for (const p of payload.add) {
      const h = hash16(p.name || "");
      if (!nameSet.has(h)) nameSet.set(h, p.name || "");
    }
    len += 2; // dict count
    for (const [h, name] of nameSet) {
      len += 2; // hash
      len += 1 + Buffer.byteLength(name);
    }
  }
  len += 2; // addFood count
  for (const f of payload.addFood)
    len += 1 + Buffer.byteLength(f.id) + 4 * 2 + 2; // hue instead of color string
  len += 2; // removeFood count
  for (const fid of payload.removeFood) len += 1 + Buffer.byteLength(fid);
  const buf = Buffer.allocUnsafe(len);
  let o = 0;
  buf.writeUInt32LE(t >>> 0, o);
  o += 4;
  buf[o++] = full ? 1 : 0;
  o = writeF32(buf, o, viewR);
  if (full) {
    const pls = payload.players;
    buf.writeUInt16LE(pls.length, o);
    o += 2;
    for (const p of pls) {
      o = writeStr(buf, o, p.id);
      o = writeF32(buf, o, p.x);
      o = writeF32(buf, o, p.y);
      o = writeF32(buf, o, p.r);
      buf.writeUInt32LE(p.score >>> 0, o);
      o += 4;
      const hue = extractHue(p.c);
      buf.writeUInt16LE(hue, o);
      o += 2;
      buf.writeUInt16LE(hash16(p.name || ""), o);
      o += 2;
    }
    // write dictionary
    const nameSet = new Map();
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
    // dictionary for added players
    const nameSet = new Map();
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

function writeStr(buf, o, s) {
  const b = Buffer.from(s);
  buf[o] = b.length;
  o += 1;
  b.copy(buf, o);
  return o + b.length;
}
function writeF32(buf, o, v) {
  buf.writeFloatLE(v, o);
  return o + 4;
}
function extractHue(col) {
  const m = /hsl\((\d+)/.exec(col);
  return m ? parseInt(m[1], 10) : 0;
}
function hash16(str) {
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
