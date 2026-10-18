export type RouteStrategy = "bypass" | "network-first" | "cache-first";

// 只缓存页面壳（导航）和带 hash 的 /assets/*；manifest、sw.js、图标走浏览器 HTTP 缓存，不进 SW 缓存。
export function routeRequest(url: URL, mode: RequestMode, method: string, origin: string): RouteStrategy {
  if (method !== "GET" || url.origin !== origin) return "bypass";
  if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) return "bypass";
  if (mode === "navigate") return "network-first";
  if (url.pathname.startsWith("/assets/")) return "cache-first";
  return "bypass";
}
