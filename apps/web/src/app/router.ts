import { useSyncExternalStore } from "react";

// History API 路由：/、/sessions/:id、/connect、/settings。未知路径回到 /。
export type Route = { readonly name: "home" } | { readonly name: "session"; readonly sessionId: string } | { readonly name: "connect" } | { readonly name: "settings" };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/connect") return { name: "connect" };
  if (path === "/settings") return { name: "settings" };
  const session = /^\/sessions\/([^/]+)$/.exec(path);
  if (session) {
    try { return { name: "session", sessionId: decodeURIComponent(session[1]!) }; } catch { return { name: "home" }; }
  }
  return { name: "home" };
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case "home": return "/";
    case "connect": return "/connect";
    case "settings": return "/settings";
    case "session": return `/sessions/${encodeURIComponent(route.sessionId)}`;
  }
}

const CHANGE = "actspace:navigate";
let current: Route = typeof location === "undefined" ? { name: "home" } : parseRoute(location.pathname);
let currentPath = typeof location === "undefined" ? "/" : location.pathname;

function read(): Route {
  if (location.pathname !== currentPath) {
    currentPath = location.pathname;
    current = parseRoute(currentPath);
  }
  return current;
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const path = formatRoute(route);
  if (path === location.pathname) return;
  // 带 app 标记的历史项才能用 history.back() 返回；深链打开时没有。
  const state = { app: true };
  if (options.replace) history.replaceState(history.state, "", path); else history.pushState(state, "", path);
  window.dispatchEvent(new Event(CHANGE));
}

/** 返回上一页；直接打开的深链没有历史时回到首页。 */
export function goBack(): void {
  if ((history.state as { app?: boolean } | null)?.app) history.back();
  else navigate({ name: "home" }, { replace: true });
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(CHANGE, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(CHANGE, listener); };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, read, read);
}
