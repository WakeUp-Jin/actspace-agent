// 用法：node cdp-capture.mjs <out.png> [--port 9222] [--no-reload] [--width 480 --height 800]
//        [--eval "<表达式>"] [--keys "Shift+F10,ArrowDown,Escape"] [--wait 500]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(new URL("../../../../apps/desktop/package.json", import.meta.url));
const WebSocket = require("ws");
const args = process.argv.slice(2);
const out = args[0];
const opt = (name) => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : undefined; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const port = opt("--port") ?? "9222";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page" && !t.url.startsWith("devtools://"));
if (!page) throw new Error("没有找到 page 目标");

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const logs = [];
let nextId = 0;
ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    logs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    logs.push(`[exception] ${d.exception?.description ?? d.text}`);
  }
  if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) {
    logs.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
  }
});
await new Promise((resolve) => ws.once("open", resolve));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
const width = opt("--width");
if (width) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: Number(width), height: Number(opt("--height") ?? 800), deviceScaleFactor: 1, mobile: false,
  });
}
if (!args.includes("--no-reload")) { await send("Page.reload"); await sleep(4000); }

const expression = opt("--eval");
if (expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  console.log("eval:", JSON.stringify(r.result.value ?? r.exceptionDetails?.text));
}
const keys = opt("--keys");
if (keys) {
  for (const combo of keys.split(",")) {
    const parts = combo.split("+");
    const key = parts.pop();
    const modifiers = (parts.includes("Alt") ? 1 : 0) | (parts.includes("Control") ? 2 : 0)
      | (parts.includes("Meta") ? 4 : 0) | (parts.includes("Shift") ? 8 : 0);
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", { type, key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, modifiers });
    }
    await sleep(150);
  }
  const focus = await send("Runtime.evaluate", {
    expression: "(() => { const el = document.activeElement; return el ? `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 40) ?? ''}` : null; })()",
    returnByValue: true,
  });
  console.log("focus:", focus.result.value);
}
await sleep(Number(opt("--wait") ?? 500));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(logs.length ? logs.join("\n") : "控制台没有 error / warning");
ws.close();
