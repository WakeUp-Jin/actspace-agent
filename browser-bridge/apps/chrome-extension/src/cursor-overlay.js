(function() {
  const VERSION = 2;
  const OVERLAY_ID = "__actspace-cursor-overlay";
  const STYLE_ID = "__actspace-cursor-style";
  const existing = window.__actspaceCursor;
  if (existing?.version === VERSION) return;

  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483647;
    overflow: hidden;
    contain: strict;
  `;

  const cursor = document.createElement("div");
  cursor.id = "__actspace-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = `
    <svg viewBox="0 0 20 24" width="20" height="24" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.2 2.1c-.3-.2-.6.1-.5.5l5.8 18.2c.2.7 1.1.8 1.4.1l2.8-6.6 6.6-1.5c.7-.2.8-1.1.2-1.5L2.2 2.1Z"
        fill="#05070a" stroke="#f8fafc" stroke-opacity=".78" stroke-width="1.15"
        stroke-linecap="round" stroke-linejoin="round" paint-order="stroke fill"/>
    </svg>
  `;
  cursor.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: 20px;
    height: 24px;
    opacity: 0;
    transform: translate3d(-40px, -40px, 0);
    transform-origin: 2px 2px;
    filter: drop-shadow(0 1px 1px rgba(15, 23, 42, .3)) drop-shadow(0 0 5px rgba(59, 130, 246, .42));
    will-change: transform, opacity;
  `;

  overlay.appendChild(cursor);
  document.documentElement.appendChild(overlay);

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #__actspace-cursor.__actspace-pressed { animation: __actspace-cursor-press 150ms ease-out; }
    @keyframes __actspace-cursor-press {
      0%, 100% { scale: 1; }
      45% { scale: .84; }
    }
    @keyframes __actspace-click-ring {
      0% { width: 4px; height: 4px; opacity: .9; }
      100% { width: 28px; height: 28px; opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      #__actspace-cursor { transition: none !important; }
    }
  `;
  document.documentElement.appendChild(style);

  let currentX = null;
  let currentY = null;
  let animationFrame = null;

  const clampPoint = (x, y) => ({
    x: Math.max(0, Math.min(window.innerWidth - 2, Number(x))),
    y: Math.max(0, Math.min(window.innerHeight - 2, Number(y))),
  });

  const setPosition = (x, y) => {
    currentX = x;
    currentY = y;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const easeOutQuint = (value) => 1 - Math.pow(1 - value, 5);

  const moveTo = (targetX, targetY) => new Promise((resolve) => {
    const target = clampPoint(targetX, targetY);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);

    if (currentX === null || currentY === null) {
      const start = clampPoint(window.innerWidth / 2, window.innerHeight / 2);
      setPosition(start.x, start.y);
      cursor.style.opacity = "1";
    }

    const startX = currentX;
    const startY = currentY;
    const dx = target.x - startX;
    const dy = target.y - startY;
    const distance = Math.hypot(dx, dy);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 0 : Math.min(550, Math.max(180, 150 + distance * 0.42));

    if (duration === 0 || distance < 1) {
      setPosition(target.x, target.y);
      cursor.style.opacity = "1";
      animationFrame = null;
      resolve();
      return;
    }

    const normalX = -dy / distance;
    const normalY = dx / distance;
    const bend = Math.min(34, distance * 0.08) * (dx + dy >= 0 ? 1 : -1);
    const controlX = startX + dx * 0.5 + normalX * bend;
    const controlY = startY + dy * 0.5 + normalY * bend;
    const startedAt = performance.now();

    const frame = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const t = easeOutQuint(progress);
      const inverse = 1 - t;
      const x = inverse * inverse * startX + 2 * inverse * t * controlX + t * t * target.x;
      const y = inverse * inverse * startY + 2 * inverse * t * controlY + t * t * target.y;
      setPosition(x, y);
      cursor.style.opacity = "1";
      if (progress < 1) {
        animationFrame = requestAnimationFrame(frame);
      } else {
        setPosition(target.x, target.y);
        animationFrame = null;
        resolve();
      }
    };

    animationFrame = requestAnimationFrame(frame);
  });

  const pulse = (x, y) => {
    cursor.classList.remove("__actspace-pressed");
    void cursor.offsetWidth;
    cursor.classList.add("__actspace-pressed");
    const ring = document.createElement("div");
    ring.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: 4px;
      height: 4px;
      border-radius: 999px;
      border: 2px solid rgba(37, 99, 235, .82);
      transform: translate(-50%, -50%);
      animation: __actspace-click-ring 360ms cubic-bezier(.2,.8,.2,1) forwards;
    `;
    overlay.appendChild(ring);
    setTimeout(() => ring.remove(), 380);
  };

  window.__actspaceCursor = {
    version: VERSION,
    async moveTo(x, y) {
      await moveTo(x, y);
    },
    async show(x, y) {
      await moveTo(x, y);
    },
    async click(x, y) {
      const target = clampPoint(x, y);
      await moveTo(target.x, target.y);
      pulse(target.x, target.y);
    },
    hide() {
      cursor.style.opacity = "0";
    },
    position() {
      return currentX === null ? null : { x: currentX, y: currentY };
    },
  };
})();
