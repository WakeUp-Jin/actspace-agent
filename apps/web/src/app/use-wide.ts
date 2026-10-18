import { useSyncExternalStore } from "react";

/** ≥1024px 走两栏（front-web-pwa客户端规范 §7）。 */
export const WIDE_QUERY = "(min-width: 1024px)";

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null;
}

function subscribe(listener: () => void): () => void {
  const list = media();
  list?.addEventListener("change", listener);
  return () => list?.removeEventListener("change", listener);
}

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
