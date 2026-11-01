import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
const SECURITY = { "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const HOST_NAME = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:.]+\](:\d{1,5})?$/i;
/** Older WebKit does not let 'self' cover ws:/wss:, so the page's own host is listed explicitly (proxies such as `tailscale serve` pass it in X-Forwarded-Host). */
export function pageSecurityHeaders(request: IncomingMessage): Record<string, string> {
  const forwarded = request.headers["x-forwarded-host"], raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.headers.host;
  if (!raw || !HOST_NAME.test(raw)) return SECURITY;
  return { ...SECURITY, "Content-Security-Policy": SECURITY["Content-Security-Policy"].replace("connect-src 'self'", `connect-src 'self' wss://${raw} ws://${raw}`) };
}
export function createStaticHandler(webRoot: string): (request: IncomingMessage, response: ServerResponse) => void {
  const fail = (response: ServerResponse, status: number, headers: Record<string, string> = {}) => { response.writeHead(status, { ...SECURITY, ...headers }); response.end(); };
  const resolveFile = async (path: string): Promise<{ file?: string; dir?: boolean }> => {
    try {
      const real = await realpath(join(webRoot, path));
      if (real !== webRoot && !real.startsWith(webRoot + sep)) return {};
      return (await stat(real)).isFile() ? { file: real } : { dir: true };
    } catch { return {}; }
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET" && request.method !== "HEAD") return fail(response, 405, { Allow: "GET, HEAD" });
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url ?? "/", "http://host").pathname); } catch { return fail(response, 400); }
    if (pathname.includes("\0")) return fail(response, 400);
    const last = pathname.split("/").pop() ?? "";
    const found = await resolveFile(pathname === "/" ? "index.html" : pathname);
    let file = found.file;
    if (!file && !found.dir && pathname !== "/" && last && !extname(last)) file = (await resolveFile("index.html")).file;
    if (!file) return fail(response, 404);
    const size = (await stat(file)).size;
    response.writeHead(200, { ...pageSecurityHeaders(request), "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "Content-Length": size, "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
    if (request.method === "HEAD") { response.end(); return; }
    const stream = createReadStream(file); stream.on("error", () => response.destroy()); stream.pipe(response);
  };
  return (request, response) => { handle(request, response).catch(() => { if (!response.headersSent) fail(response, 500); else response.destroy(); }); };
}
