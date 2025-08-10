// 渲染相關
import { app, FOG, GRID_TILE_DIM, gridCanvas } from "./state.js";
import { clamp, getNameCanvas } from "./util.js";

export const render = {
  viewScale: 1,
  // 背景繪製（假設外層已套用世界座標轉換）
  background(ctx) {
    if (!gridCanvas) return;
    const tile = gridCanvas;
    const tileWorldSize = GRID_TILE_DIM;
    const startX = 0;
    const startY = 0;
    for (let x = startX; x < app.worldSize; x += tileWorldSize) {
      for (let y = startY; y < app.worldSize; y += tileWorldSize) {
        ctx.drawImage(tile, x, y);
      }
    }
  },
  food(me, ctx) {
    // 已移至 food.js 的 drawFood (此處保留空實作以相容舊呼叫)
  },
  players(playersInterpolated, me, ctx) {
    let visiblePlayers = playersInterpolated;
    if (me) {
      const viewRadius = app.state.viewR || 1600;
      const vr2 = viewRadius * viewRadius * 1.3;
      visiblePlayers = playersInterpolated.filter((p) => {
        const dx = p.x - me.x;
        const dy = p.y - me.y;
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
  fog(me, ctx, W, H) {
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
  hud(me, ctx, W, H) {
    if (me) {
      document.getElementById("mass").textContent = me.r.toFixed(1);
      document.getElementById("score").textContent = me.s;
    }
    document.getElementById("pcount").textContent = app.state.players.length;
    document.getElementById("fcount").textContent = app.foodMap.size;
    // 其他 HUD 元素可依需求擴充
  },
  leaderboard(ctx, W, H) {
    const lb = [...app.state.players].sort((a, b) => b.s - a.s).slice(0, 8);
    document.getElementById("leaderboard").innerHTML =
      "<b>排行榜</b><br/>" +
      lb.map((p, i) => `${i + 1}. ${p.name || "anon"} - ${p.s}`).join("<br/>");
  },
};
