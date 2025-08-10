// 事件處理
import { app } from "./state.js";

export const eventHandlers = {
  onResize(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  },
  onMouseMove(e) {
    app.mouse.x = e.clientX;
    app.mouse.y = e.clientY;
  },
  onKeyDown(e, fpsVisibleRef) {
    if (e.key === "F3" || e.key === "f3") {
      fpsVisibleRef.value = !fpsVisibleRef.value;
      if (!fpsVisibleRef.value) document.getElementById("fps").textContent = "";
    }
  },
  onStartBtn(net) {
    const name = (document.getElementById("playerName").value || "").trim();
    net.socket.emit("join", { name });
    document.getElementById("nameInputWrap").style.display = "none";
  },
  register(canvas, net, fpsVisibleRef) {
    window.addEventListener("resize", () => eventHandlers.onResize(canvas));
    canvas.addEventListener("mousemove", eventHandlers.onMouseMove);
    window.addEventListener("keydown", (e) =>
      eventHandlers.onKeyDown(e, fpsVisibleRef)
    );
    const startBtn = document.getElementById("startBtn");
    if (startBtn) startBtn.onclick = () => eventHandlers.onStartBtn(net);
  },
};
