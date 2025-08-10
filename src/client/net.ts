// 網路與同步 (TypeScript)
import { app, markFoodDirty, PlayerClient } from "./state.js";

interface SocketLike {
  on(_ev: string, _cb: (..._args: any[]) => void): void;
  emit(_ev: string, _data?: any): void;
}
interface PlayerSnapshotMap {
  t: number;
  players: Map<string, PlayerClient>;
}

let socket: SocketLike | null = null;
let playerSnapshots: PlayerSnapshotMap[] = [];
const playerVel = new Map<string, { vx: number; vy: number }>();
const lastPlayers = new Map<string, PlayerClient>();
let lastPlayersTime = 0;
const NET_INTERP_DELAY = 100;
let rttSamples: number[] = [];
let lastBinSize = 0;
let lastAppliedTimestamp = 0;

function recordRTT(rtt: number) {
  rttSamples.push(rtt);
  if (rttSamples.length > 30) rttSamples.shift();
  if (rttSamples.length >= 2) {
    const avg = rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length;
    const variance = rttSamples.reduce((a, b) => a + (b - avg) * (b - avg), 0) / rttSamples.length;
    const jitter = Math.round(Math.sqrt(variance));
    const jitterElem = document.getElementById("jitter");
    if (jitterElem) jitterElem.textContent = String(jitter);
  }
}

function getInterpolatedPlayers(): PlayerClient[] {
  if (playerSnapshots.length < 2) return app.state.players as PlayerClient[];
  const renderTime = Date.now() - NET_INTERP_DELAY;
  let i = playerSnapshots.length - 1;
  while (i > 0 && playerSnapshots[i - 1].t > renderTime) i--;
  const newer = playerSnapshots[i];
  if (!newer) return app.state.players as PlayerClient[];
  if (i === 0) return Array.from(newer.players.values());
  const older = playerSnapshots[i - 1];
  const span = newer.t - older.t || 1;
  const f = Math.max(0, Math.min(1, (renderTime - older.t) / span));
  const out: PlayerClient[] = [];
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
    out.push({ id, x, y, r: op.r + (np.r - op.r) * f, c: np.c, s: np.s, name: np.name });
  }
  return out;
}

function init(ioSocket: SocketLike) {
  socket = ioSocket;
  socket.on("init", (data: any) => {
    app.myId = data.id;
    app.worldSize = data.worldSize;
  });
  socket.on("joined", () => {
    app.inGame = true;
    app.dead = false;
    const deathMsg = document.getElementById("deathMsg");
    if (deathMsg) deathMsg.style.display = "none";
  });
  socket.on("death", (data: any) => {
    app.inGame = false;
    app.dead = true;
    const msg = document.getElementById("deathMsg");
    const best = data.bestScore ?? data.finalScore;
    if (msg) {
      msg.innerHTML = `你被吃掉了！<br/>本局分數: <b>${data.finalScore}</b><br/>最高分: <b>${best}</b><br/>再試一次？`;
      msg.style.display = "block";
    }
    const nameWrap = document.getElementById("nameInputWrap");
    if (nameWrap) nameWrap.style.display = "block";
  });
  socket.on("state", (s: any) => {
    app.state.viewR = s.viewR;
    if (s.size) {
      const pk = document.getElementById("pktsize");
      if (pk) pk.textContent = String(s.size);
    }
    if (s.addFood) {
      for (const f of s.addFood) app.foodMap.set(f.id, f);
    }
    if (s.removeFood) {
      for (const id of s.removeFood) app.foodMap.delete(id);
    }
    if (s.addFood || s.removeFood) markFoodDirty();
    let pMap: Map<string, PlayerClient>;
    if (s.full) {
      pMap = new Map();
      for (const p of s.players) {
        const prev = lastPlayers.get(p.id);
        if (prev) {
          const dt = (s.t - lastPlayersTime) / 1000;
          if (dt > 0) playerVel.set(p.id, { vx: (p.x - prev.x) / dt, vy: (p.y - prev.y) / dt });
        }
        lastPlayers.set(p.id, p);
        pMap.set(p.id, { ...p });
      }
    } else {
      for (const p of s.add || []) {
        const prev = lastPlayers.get(p.id);
        if (prev) {
          const dt = (s.t - lastPlayersTime) / 1000;
          if (dt > 0) playerVel.set(p.id, { vx: (p.x - prev.x) / dt, vy: (p.y - prev.y) / dt });
        }
        lastPlayers.set(p.id, p);
      }
      for (const p of s.upd || []) {
        const prev = lastPlayers.get(p.id);
        if (prev) {
          const dt = (s.t - lastPlayersTime) / 1000;
          if (dt > 0) playerVel.set(p.id, { vx: (p.x - prev.x) / dt, vy: (p.y - prev.y) / dt });
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
    while (playerSnapshots.length && playerSnapshots[0].t < cutoff) playerSnapshots.shift();
    app.state.players = Array.from(pMap.values());
  });
  socket.on("stateb", (buf: any) => {
    if (!buf) return;
    lastBinSize = buf.byteLength || 0;
    const binElem = document.getElementById("binsize");
    if (binElem) binElem.textContent = String(lastBinSize);
    try {
      decodeBinaryState(buf);
    } catch {}
  });
  socket.on("pongCheck", (clientStamp: number) => {
    const now = performance.now();
    const rtt = Math.round(now - clientStamp);
    const rttElem = document.getElementById("rtt");
    if (rttElem) rttElem.textContent = String(rtt);
    recordRTT(rtt);
  });
  setInterval(() => {
    socket?.emit("pingCheck", performance.now());
  }, 2000);
}

export const net = {
  get socket() {
    return socket;
  },
  init,
  getInterpolatedPlayers,
  getStats() {
    return { rtt: rttSamples.at(-1) ?? null, jitterSamples: rttSamples, lastBinSize };
  },
};

function decodeBinaryState(arrayBuf: ArrayBuffer | Uint8Array) {
  const buf = (arrayBuf as any).buffer ? (arrayBuf as Uint8Array) : new Uint8Array(arrayBuf);
  const view =
    buf instanceof Uint8Array
      ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
      : new DataView(buf as any);
  let o = 0;
  const readU8 = () => {
    const v = view.getUint8(o);
    o += 1;
    return v;
  };
  const readU16 = () => {
    const v = view.getUint16(o, true);
    o += 2;
    return v;
  };
  const readU32 = () => {
    const v = view.getUint32(o, true);
    o += 4;
    return v;
  };
  const readF32 = () => {
    const v = view.getFloat32(o, true);
    o += 4;
    return v;
  };
  const readStr = () => {
    const len = readU8();
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(readU8());
    return s;
  };
  const t = readU32();
  const fullFlag = readU8();
  const full = !!fullFlag;
  const viewR = readF32();
  if (t <= lastAppliedTimestamp) {
    return;
  }
  app.state.viewR = viewR;
  const newPlayersMap = new Map<string, PlayerClient>();
  const pending: any[] = [];
  if (full) {
    const count = readU16();
    for (let i = 0; i < count; i++) {
      const id = readStr();
      const x = readF32();
      const y = readF32();
      const r = readF32();
      const score = readU32();
      const hue = readU16();
      const nameHash = readU16();
      const prev = lastPlayers.get(id);
      if (prev) {
        const dt = (t - lastPlayersTime) / 1000;
        if (dt > 0) playerVel.set(id, { vx: (x - prev.x) / dt, vy: (y - prev.y) / dt });
      }
      const pObj: any = {
        id,
        x,
        y,
        r,
        c: `hsl(${hue} 70% 50%)`,
        s: score,
        name: null,
        _nh: nameHash,
      };
      newPlayersMap.set(id, pObj);
      pending.push(pObj);
    }
    const dictCount = readU16();
    const nameDict = new Map<number, string>();
    for (let i = 0; i < dictCount; i++) {
      const h = readU16();
      const name = readStr();
      nameDict.set(h, name);
    }
    for (const p of pending) {
      p.name = nameDict.get(p._nh) || "";
      delete p._nh;
      lastPlayers.set(p.id, { id: p.id, x: p.x, y: p.y, r: p.r, c: p.c, s: p.s, name: p.name });
    }
  } else {
    const addCount = readU16();
    const added: any[] = [];
    for (let i = 0; i < addCount; i++) {
      const id = readStr();
      const x = readF32();
      const y = readF32();
      const r = readF32();
      const score = readU32();
      const hue = readU16();
      const nameHash = readU16();
      const prev = lastPlayers.get(id);
      if (prev) {
        const dt = (t - lastPlayersTime) / 1000;
        if (dt > 0) playerVel.set(id, { vx: (x - prev.x) / dt, vy: (y - prev.y) / dt });
      }
      const pObj: any = {
        id,
        x,
        y,
        r,
        c: `hsl(${hue} 70% 50%)`,
        s: score,
        name: null,
        _nh: nameHash,
      };
      lastPlayers.set(id, pObj as any);
      added.push(pObj);
    }
    const updCount = readU16();
    for (let i = 0; i < updCount; i++) {
      const id = readStr();
      const x = readF32();
      const y = readF32();
      const r = readF32();
      const score = readU32();
      const prev = lastPlayers.get(id);
      if (prev) {
        const dt = (t - lastPlayersTime) / 1000;
        if (dt > 0) playerVel.set(id, { vx: (x - prev.x) / dt, vy: (y - prev.y) / dt });
      }
      const merged: any = {
        ...(prev || {}),
        id,
        x,
        y,
        r,
        s: score,
        c: prev?.c || "hsl(0 70% 50%)",
      };
      lastPlayers.set(id, merged);
    }
    const remCount = readU16();
    for (let i = 0; i < remCount; i++) {
      const id = readStr();
      lastPlayers.delete(id);
      playerVel.delete(id);
    }
    const dictCount = readU16();
    const nameDict = new Map<number, string>();
    for (let i = 0; i < dictCount; i++) {
      const h = readU16();
      const name = readStr();
      nameDict.set(h, name);
    }
    for (const p of added) {
      p.name = nameDict.get(p._nh) || "";
      delete p._nh;
      lastPlayers.set(p.id, p);
    }
    for (const [id, p] of lastPlayers) newPlayersMap.set(id, { ...p });
  }
  const addFoodCount = readU16();
  let foodChanged = false;
  for (let i = 0; i < addFoodCount; i++) {
    const id = readStr();
    const x = readF32();
    const y = readF32();
    const hue = readU16();
    app.foodMap.set(id, { id, x, y, color: `hsl(${hue} 80% 60%)` });
    foodChanged = true;
  }
  const remFoodCount = readU16();
  for (let i = 0; i < remFoodCount; i++) {
    const id = readStr();
    if (app.foodMap.delete(id)) foodChanged = true;
  }
  if (foodChanged) markFoodDirty();
  lastPlayersTime = t;
  lastAppliedTimestamp = t;
  playerSnapshots.push({
    t,
    players: newPlayersMap.size
      ? newPlayersMap
      : new Map([...lastPlayers].map(([id, p]) => [id, { ...p }])),
  });
  const cutoff = performance.now() - 2000;
  while (playerSnapshots.length && playerSnapshots[0].t < cutoff) playerSnapshots.shift();
  app.state.players = Array.from(playerSnapshots[playerSnapshots.length - 1].players.values());
}
