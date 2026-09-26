#!/usr/bin/env node
// 设计 token 收口的样式快照工具：用 headless Chromium（CDP）打开 renderer fixture，
// 记录每个可见元素的计算样式并截图；diff 模式比较两份快照。
//
//   node style-snapshot.mjs capture <outDir> [--only <fixture-substring>]
//   node style-snapshot.mjs diff <beforeDir> <afterDir> [--props font-size,line-height] [--limit 40]
//
// 需要 5173 端口已有 renderer dev server（pnpm --filter @actspace/desktop dev:renderer 或 pnpm dev）。
// 浏览器默认取 Playwright 缓存里的 chrome-headless-shell，可用 CHROME_BIN 覆盖。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.RENDERER_URL ?? "http://127.0.0.1:5173";
const FIXTURE = "/src/renderer/test/fixtures";
const SETTINGS_SECTIONS = ["general", "appearance", "model", "search", "tools", "subagents", "archivedChats", "usage", "update"];

export const PAGES = [
  ...SETTINGS_SECTIONS.map((section) => ({ name: `settings-${section}`, url: `${FIXTURE}/settings-preview.html?section=${section}` })),
  { name: "tool-stream", url: `${FIXTURE}/tool-stream-typography-preview.html` },
  { name: "reply-completion", url: `${FIXTURE}/reply-completion-preview.html` },
  { name: "model-settings", url: `${FIXTURE}/model-settings-preview.html` },
  { name: "usage", url: `${FIXTURE}/usage-preview.html` },
  { name: "extensions", url: `${FIXTURE}/extensions-preview.html` },
  { name: "chinese-ui", url: `${FIXTURE}/chinese-ui-preview.html` },
  { name: "custom-reasoning", url: `${FIXTURE}/custom-reasoning-preview.html` },
  { name: "main", url: "/" },
];
const THEMES = ["light", "dark"];

const PROPS = [
  "font-size", "line-height", "font-weight",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "box-shadow", "z-index", "transition-duration", "animation-duration",
  "color", "background-color", "border-top-color", "border-top-width",
  "width", "height", "padding-top", "padding-left", "outline-style",
];

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  for (const dir of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
    if (!dir.startsWith("chromium_headless_shell")) continue;
    for (const sub of fs.readdirSync(path.join(cache, dir))) {
      const bin = path.join(cache, dir, sub, "chrome-headless-shell");
      if (fs.existsSync(bin)) return bin;
    }
  }
  throw new Error("chrome-headless-shell not found; set CHROME_BIN");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openBrowser() {
  const port = 9400 + Math.floor(Math.random() * 400);
  const child = spawn(findChrome(), [`--remote-debugging-port=${port}`, "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
  let targets;
  for (let attempt = 0; attempt < 40 && !targets; attempt += 1) {
    await sleep(150);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => undefined);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => { ws.close(); child.kill(); } };
}

const COLLECT = (props) => `(() => {
  const props = ${JSON.stringify(props)};
  const out = {};
  const pathOf = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      const parent = node.parentElement;
      const same = parent ? [...parent.children].filter((c) => c.tagName === node.tagName) : [node];
      parts.unshift(node.tagName.toLowerCase() + (same.length > 1 ? ":" + (same.indexOf(node) + 1) : ""));
    }
    return parts.join(">");
  };
  for (const el of document.body.querySelectorAll("*")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const entry = {};
    for (const p of props) entry[p] = cs.getPropertyValue(p);
    entry.rect = [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)].join(",");
    const text = (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.trim().slice(0, 40) : "";
    if (text) entry.text = text;
    out[pathOf(el)] = entry;
  }
  return out;
})()`;

async function capture(outDir, only) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await openBrowser();
  const { send } = browser;
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const page of PAGES.filter((p) => !only || p.name.includes(only))) {
    for (const theme of THEMES) {
      const url = `${BASE}${page.url}${page.url.includes("?") ? "&" : "?"}theme=${theme}`;
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      await send("Page.navigate", { url });
      await sleep(2500);
      await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
      const collected = await send("Runtime.evaluate", { expression: COLLECT(PROPS), returnByValue: true });
      const styles = collected.result?.result?.value ?? {};
      const key = `${page.name}.${theme}`;
      fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(styles));
      const height = (await send("Runtime.evaluate", { expression: "Math.min(Math.max(document.documentElement.scrollHeight, 900), 6000)", returnByValue: true })).result.result.value;
      await send("Emulation.setDeviceMetricsOverride", { width: 1440, height, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(outDir, `${key}.png`), Buffer.from(shot.result.data, "base64"));
      await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      console.log(`${key}: ${Object.keys(styles).length} elements`);
    }
  }
  browser.close();
}

function diff(beforeDir, afterDir, props, limit) {
  let total = 0;
  const files = fs.readdirSync(beforeDir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const afterPath = path.join(afterDir, file);
    if (!fs.existsSync(afterPath)) {
      console.log(`## ${file}: missing in after`);
      continue;
    }
    const before = JSON.parse(fs.readFileSync(path.join(beforeDir, file), "utf8"));
    const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));
    const lines = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const a = before[key];
      const b = after[key];
      if (!a || !b) {
        if (!props) lines.push(`  ${a ? "-" : "+"} ${key}`);
        continue;
      }
      for (const prop of props ?? Object.keys(a)) {
        if (prop === "text") continue;
        if (a[prop] !== b[prop]) lines.push(`  ${key}${a.text ? ` "${a.text}"` : ""}\n      ${prop}: ${a[prop]} -> ${b[prop]}`);
      }
    }
    total += lines.length;
    if (lines.length) {
      console.log(`## ${file}: ${lines.length} differences`);
      console.log(lines.slice(0, limit).join("\n"));
      if (lines.length > limit) console.log(`  … ${lines.length - limit} more`);
    }
  }
  console.log(`total differences: ${total}`);
  return total;
}

const [mode, ...args] = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
if (mode === "capture") {
  await capture(args[0], flag("--only"));
} else if (mode === "diff") {
  const props = flag("--props")?.split(",");
  diff(args[0], args[1], props, Number(flag("--limit") ?? 40));
} else {
  console.error("usage: style-snapshot.mjs capture <outDir> [--only name] | diff <before> <after> [--props a,b] [--limit n]");
  process.exitCode = 2;
}
