// 渲染相關 (TypeScript)
import { app, FOG, GRID_TILE_DIM, gridCanvas } from "./state.js";
import { clamp, getNameCanvas } from "./util.js";

interface PlayerRender {
  id: string;
  x: number;
  y: number;
  r: number;
  c: string;
  s: number;
  name: string;
}

export const render = {
  viewScale: 1,
  background(ctx: CanvasRenderingContext2D) {
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
  food(_me: PlayerRender | undefined, _ctx: CanvasRenderingContext2D) {
    // Deprecated (use drawFood from food.ts)
  },
  players(
    playersInterpolated: PlayerRender[],
    me: PlayerRender | undefined,
    ctx: CanvasRenderingContext2D
  ) {
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
  fog(me: PlayerRender | undefined, ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!FOG.ENABLED || !app.inGame || app.dead) return;
    if (!me) return;
    if (app.basePlayerRadius == null) app.basePlayerRadius = me.r;
    if (app.basePlayerScore === 0) app.basePlayerScore = Math.max(1, me.s);
    let mult = 1;
    if (FOG.MODE === "radius") {
      const growth = Math.max(1, me.r / (app.basePlayerRadius || 1));
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
  hud(me: PlayerRender | undefined, _ctx: CanvasRenderingContext2D, _W: number, _H: number) {
    if (me) {
      const massEl = document.getElementById("mass");
      if (massEl) massEl.textContent = me.r.toFixed(1);
      const scoreEl = document.getElementById("score");
      if (scoreEl) scoreEl.textContent = String(me.s);
    }
    const pc = document.getElementById("pcount");
    if (pc) pc.textContent = String(app.state.players.length);
    const fc = document.getElementById("fcount");
    if (fc) fc.textContent = String(app.foodMap.size);
  },
  leaderboard(_ctx: CanvasRenderingContext2D, _W: number, _H: number) {
    const lb = [...app.state.players].sort((a, b) => b.s - a.s).slice(0, 8);
    const el = document.getElementById("leaderboard");
    if (el)
      el.innerHTML =
        "<b>排行榜</b><br/>" +
        lb.map((p, i) => `${i + 1}. ${p.name || "anon"} - ${p.s}`).join("<br/>");
  },
};
