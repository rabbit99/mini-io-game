// 網路與同步
import { app, markFoodDirty } from "./state.js";

let socket = null;
let playerSnapshots = [];
let playerVel = new Map();
let lastPlayers = new Map();
let lastPlayersTime = 0;
const NET_INTERP_DELAY = 100;
// 連線統計
let rttSamples = [];
let lastBinSize = 0;
let lastAppliedTimestamp = 0; // 防止 JSON 與 Binary 重複套用

function recordRTT(rtt) {
  rttSamples.push(rtt);
  if (rttSamples.length > 30) rttSamples.shift();
  if (rttSamples.length >= 2) {
    const avg = rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length;
    const variance =
      rttSamples.reduce((a, b) => a + (b - avg) * (b - avg), 0) /
      rttSamples.length;
    const jitter = Math.round(Math.sqrt(variance));
    const jitterElem = document.getElementById("jitter");
    if (jitterElem) jitterElem.textContent = jitter;
  }
}

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
  const f = Math.max(0, Math.min(1, (renderTime - older.t) / span));
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

function init(ioSocket) {
  socket = ioSocket;
  // 註冊 socket 事件
  socket.on("init", (data) => {
    app.myId = data.id;
    app.worldSize = data.worldSize;
  });
  socket.on("joined", (data) => {
    app.inGame = true;
    app.dead = false;
    const deathMsg = document.getElementById("deathMsg");
    if (deathMsg) deathMsg.style.display = "none";
  });
  socket.on("death", (data) => {
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
  socket.on("state", (s) => {
    app.state.viewR = s.viewR;
    if (s.size) document.getElementById("pktsize").textContent = s.size;
    // 正確維護 foodMap
    if (s.addFood) {
      for (const f of s.addFood) app.foodMap.set(f.id, f);
    }
    if (s.removeFood) {
      for (const id of s.removeFood) app.foodMap.delete(id);
    }
    if (s.addFood || s.removeFood) markFoodDirty();
    // 插值快照
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
    // 更新 app.state.players 供渲染
    app.state.players = Array.from(pMap.values());
  });
  // Binary state (僅尺寸統計，目前未實作解析)
  socket.on("stateb", (buf) => {
    if (!buf) return;
    lastBinSize = buf.byteLength || 0;
    const binElem = document.getElementById("binsize");
    if (binElem) binElem.textContent = lastBinSize;
    try {
      decodeBinaryState(buf);
    } catch (e) {
      // 失敗則忽略，不影響 JSON
    }
  });
  // RTT / Jitter
  socket.on("pongCheck", (clientStamp) => {
    const now = performance.now();
    const rtt = Math.round(now - clientStamp);
    const rttElem = document.getElementById("rtt");
    if (rttElem) rttElem.textContent = rtt;
    recordRTT(rtt);
  });
  setInterval(() => {
    socket.emit("pingCheck", performance.now());
  }, 2000);
}

export const net = {
  get socket() {
    return socket;
  },
  init,
  getInterpolatedPlayers,
  getStats() {
    return {
      rtt: rttSamples.at(-1) ?? null,
      jitterSamples: rttSamples,
      lastBinSize,
    };
  },
};

// ================= Binary Decode =================
function decodeBinaryState(arrayBuf) {
  // 若是 Node Buffer 轉 ArrayBuffer
  const buf = arrayBuf.buffer ? arrayBuf : new Uint8Array(arrayBuf);
  const view =
    buf instanceof Uint8Array
      ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
      : new DataView(buf);
  let o = 0;
  function readU8() {
    const v = view.getUint8(o);
    o += 1;
    return v;
  }
  function readU16() {
    const v = view.getUint16(o, true);
    o += 2;
    return v;
  }
  function readU32() {
    const v = view.getUint32(o, true);
    o += 4;
    return v;
  }
  function readF32() {
    const v = view.getFloat32(o, true);
    o += 4;
    return v;
  }
  function readStr() {
    const len = readU8();
    let s = "";
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(readU8());
    }
    return s;
  }
  const t = readU32();
  const fullFlag = readU8();
  const full = !!fullFlag;
  const viewR = readF32();
  // 如果這個 timestamp 已處理（JSON 已套用），則跳過細節，只更新視野半徑
  if (t <= lastAppliedTimestamp) {
    return;
  }
  app.state.viewR = viewR;
  const newPlayersMap = new Map();
  // 暫存玩家資料 (含 nameHash) 以便字典解析後填名稱
  const pendingNameResolve = [];
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
      // velocity 계산
      const prev = lastPlayers.get(id);
      if (prev) {
        const dt = (t - lastPlayersTime) / 1000;
        if (dt > 0)
          playerVel.set(id, { vx: (x - prev.x) / dt, vy: (y - prev.y) / dt });
      }
      const pObj = {
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
      pendingNameResolve.push(pObj);
    }
    // 字典
    const dictCount = readU16();
    const nameDict = new Map();
    for (let i = 0; i < dictCount; i++) {
      const h = readU16();
      const name = readStr();
      nameDict.set(h, name);
    }
    // 名稱賦值
    for (const p of pendingNameResolve) {
      p.name = nameDict.get(p._nh) || "";
      delete p._nh;
      lastPlayers.set(p.id, {
        id: p.id,
        x: p.x,
        y: p.y,
        r: p.r,
        c: p.c,
        s: p.s,
        name: p.name,
      });
    }
  } else {
    // add
    const addCount = readU16();
    const added = [];
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
        if (dt > 0)
          playerVel.set(id, { vx: (x - prev.x) / dt, vy: (y - prev.y) / dt });
      }
      const pObj = {
        id,
        x,
        y,
        r,
        c: `hsl(${hue} 70% 50%)`,
        s: score,
        name: null,
        _nh: nameHash,
      };
      lastPlayers.set(id, pObj); // 暫存
      added.push(pObj);
    }
    // upd
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
        if (dt > 0)
          playerVel.set(id, { vx: (x - prev.x) / dt, vy: (y - prev.y) / dt });
      }
      const merged = {
        ...(prev || {}),
        id,
        x,
        y,
        r,
        s: score,
        c: prev?.c || `hsl(0 70% 50%)`,
      };
      lastPlayers.set(id, merged);
    }
    // rem
    const remCount = readU16();
    for (let i = 0; i < remCount; i++) {
      const id = readStr();
      lastPlayers.delete(id);
      playerVel.delete(id);
    }
    // 名稱字典 (僅針對新增者)
    const dictCount = readU16();
    const nameDict = new Map();
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
    // newPlayersMap = copy of lastPlayers
    for (const [id, p] of lastPlayers) newPlayersMap.set(id, { ...p });
  }
  // 食物增刪
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
  if (full) {
    // full snapshot: lastPlayers 已重建
  } else {
    // delta 已合併於 lastPlayers
  }
  playerSnapshots.push({
    t,
    players: newPlayersMap.size
      ? newPlayersMap
      : new Map([...lastPlayers].map(([id, p]) => [id, { ...p }])),
  });
  const cutoff = performance.now() - 2000;
  while (playerSnapshots.length && playerSnapshots[0].t < cutoff)
    playerSnapshots.shift();
  app.state.players = Array.from(
    playerSnapshots[playerSnapshots.length - 1].players.values()
  );
}
