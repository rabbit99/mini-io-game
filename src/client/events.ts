// 事件處理 (TypeScript)
import { app } from "./state.js";

export interface NetLike {
  socket: { emit: (_ev: string, _data?: any) => void } | null;
}

export const eventHandlers = {
  onResize(canvas: HTMLCanvasElement) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  },
  onMouseMove(e: MouseEvent) {
    app.mouse.x = e.clientX;
    app.mouse.y = e.clientY;
  },
  onKeyDown(e: KeyboardEvent, fpsVisibleRef: { value: boolean }) {
    if (e.key === "F3" || e.key === "f3") {
      fpsVisibleRef.value = !fpsVisibleRef.value;
      if (!fpsVisibleRef.value) {
        const el = document.getElementById("fps");
        if (el) el.textContent = "";
      }
    }
  },
  onStartBtn(net: NetLike) {
    const input = document.getElementById("playerName") as HTMLInputElement | null;
    const name = (input?.value || "").trim();
    net.socket?.emit("join", { name });
    const wrap = document.getElementById("nameInputWrap");
    if (wrap) wrap.style.display = "none";
    const restartBtn = document.getElementById("restartBtn");
    if (restartBtn) restartBtn.style.display = "inline-block";
  },
  onRestart(net: NetLike) {
    if (!net.socket) return;
    const input = document.getElementById("playerName") as HTMLInputElement | null;
    const name = (input?.value || "").trim();
    net.socket.emit("join", { name });
    const deathMsg = document.getElementById("deathMsg");
    if (deathMsg) deathMsg.style.display = "none";
    const wrap = document.getElementById("nameInputWrap");
    if (wrap) wrap.style.display = "none";
  },
  register(canvas: HTMLCanvasElement, net: NetLike, fpsVisibleRef: { value: boolean }) {
    window.addEventListener("resize", () => eventHandlers.onResize(canvas));
    canvas.addEventListener("mousemove", eventHandlers.onMouseMove);
    window.addEventListener("keydown", (e) => eventHandlers.onKeyDown(e, fpsVisibleRef));
    const startBtn = document.getElementById("startBtn") as HTMLButtonElement | null;
    if (startBtn) startBtn.onclick = () => eventHandlers.onStartBtn(net);
    const restartBtn = document.getElementById("restartBtn") as HTMLButtonElement | null;
    if (restartBtn) restartBtn.onclick = () => eventHandlers.onRestart(net);
  },
};
