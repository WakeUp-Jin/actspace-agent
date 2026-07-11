(function() {
  if (document.getElementById("__actspace-cursor-overlay")) return;

  const CURSOR_SIZE = 24;
  const TRAIL_DURATION_MS = 600;

  const overlay = document.createElement("div");
  overlay.id = "__actspace-cursor-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483647;
    overflow: hidden;
  `;

  const cursor = document.createElement("div");
  cursor.id = "__actspace-cursor";
  cursor.style.cssText = `
    position: absolute;
    width: ${CURSOR_SIZE}px;
    height: ${CURSOR_SIZE}px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.7);
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
    transform: translate(-50%, -50%);
    transition: left 0.15s ease-out, top 0.15s ease-out;
    opacity: 0;
    left: -100px;
    top: -100px;
  `;

  overlay.appendChild(cursor);
  document.documentElement.appendChild(overlay);

  window.__actspaceCursor = {
    show(x, y) {
      cursor.style.opacity = "1";
      cursor.style.left = x + "px";
      cursor.style.top = y + "px";
    },

    click(x, y) {
      this.show(x, y);
      const ring = document.createElement("div");
      ring.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: 0;
        height: 0;
        border-radius: 50%;
        border: 2px solid rgba(59, 130, 246, 0.8);
        transform: translate(-50%, -50%);
        animation: __actspace-click-ring ${TRAIL_DURATION_MS}ms ease-out forwards;
        pointer-events: none;
      `;
      overlay.appendChild(ring);
      setTimeout(() => ring.remove(), TRAIL_DURATION_MS);
    },

    hide() {
      cursor.style.opacity = "0";
    },
  };

  const style = document.createElement("style");
  style.textContent = `
    @keyframes __actspace-click-ring {
      0% { width: 0; height: 0; opacity: 1; }
      100% { width: 40px; height: 40px; opacity: 0; }
    }
  `;
  document.documentElement.appendChild(style);
})();
