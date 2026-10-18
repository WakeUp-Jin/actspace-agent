export function registerServiceWorker(onUpdate: (activate: () => void) => void): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const container = navigator.serviceWorker;
  let reloaded = false;
  container.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  const offer = (worker: ServiceWorker) => onUpdate(() => worker.postMessage({ type: "skip-waiting" }));

  void container.register("/sw.js", { scope: "/" }).then(registration => {
    if (registration.waiting && container.controller) offer(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        // 有 controller 才说明是更新而不是首次安装
        if (worker.state === "installed" && container.controller) offer(worker);
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
    });
  }).catch(() => undefined);
}
