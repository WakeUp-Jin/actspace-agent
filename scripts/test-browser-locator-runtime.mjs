#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromDesktop = createRequire(path.join(repoRoot, "packages/desktop/package.json"));
const { JSDOM } = requireFromDesktop("jsdom");
const runtime = readFileSync(
  path.join(repoRoot, "plugins/browser-bridge/apps/cli/internal/locator/generated/runtime.js"),
  "utf8",
);

const dom = new JSDOM(`<!doctype html><body>
  <button id="only" style="opacity:1">Only</button>
  <span id="create-name">创建</span>
  <button id="create" aria-labelledby="create-name" style="opacity:1"><svg></svg></button>
  <button class="multi" style="opacity:1">Visible</button>
  <button class="multi" data-hidden="true" style="opacity:1">Hidden</button>
  <label for="name">用户名称</label>
  <input id="name" placeholder="请输入名称" style="opacity:1" />
  <label>邮箱地址<input id="email" style="opacity:1" /></label>
  <input id="check" type="checkbox" style="opacity:1" />
  <select id="choice" style="opacity:1"><option value="a">Alpha</option><option value="b">Beta</option></select>
  <img id="media" src="https://example.test/image.png" style="opacity:1" />
  <a id="download" href="https://example.test/sample.txt" download="browser-bridge-sample.txt">Download</a>
  <div id="drag" draggable="true" style="opacity:1">Drag me</div>
  <div id="shadow-host"></div>
  <iframe id="profile-frame" title="Profile frame"></iframe>
  <button id="offscreen" data-offscreen="true" style="opacity:1">Offscreen</button>
</body>`, { pretendToBeVisual: true, runScripts: "dangerously", url: "https://example.test/" });

const { window } = dom;
let clipboardText = "initial";
let clipboardItems = [];
window.ClipboardItem = class ClipboardItem {
  constructor(values, options = {}) {
    this.values = values;
    this.types = Object.keys(values);
    this.presentationStyle = options.presentationStyle ?? "unspecified";
  }
  async getType(type) { return this.values[type]; }
};
Object.defineProperty(window.navigator, "clipboard", {
  value: {
    readText: async () => clipboardText,
    writeText: async (value) => { clipboardText = value; },
    read: async () => clipboardItems,
    write: async (items) => { clipboardItems = items; },
  },
});
window.HTMLElement.prototype.scrollIntoView = () => {};
let clickedDownloadName = "";
window.HTMLAnchorElement.prototype.click = function click() { clickedDownloadName = this.download; };
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  if (this.dataset.offscreen === "true") {
    return { x: 10, y: 900, left: 10, top: 900, right: 110, bottom: 930, width: 100, height: 30 };
  }
  if (this.dataset.hidden === "true" || !this.isConnected) {
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  return { x: 10, y: 20, left: 10, top: 20, right: 110, bottom: 50, width: 100, height: 30 };
};
const shadowRoot = window.document.querySelector("#shadow-host").attachShadow({ mode: "open" });
shadowRoot.innerHTML = `<button id="shadow-action" aria-label="影子操作" style="opacity:1">icon</button>`;
const frame = window.document.querySelector("#profile-frame");
frame.contentDocument.body.innerHTML = `<button id="frame-save" style="opacity:1">保存资料</button>`;
window.eval(runtime);

const locator = window.__actspaceLocator;
assert.equal(locator.version, "5");
assert.match(locator.buildHash, /^[a-f0-9]{64}$/);

const createPoint = await locator.invoke("point", {
  target: { kind: "role", role: "button", name: "创建", exact: true },
  timeoutMs: 500,
});
assert.deepEqual({ x: createPoint.x, y: createPoint.y }, { x: 60, y: 35 });

assert.equal((await locator.invoke("count", {
  target: { kind: "label", value: "用户名称", exact: true },
})).count, 1);
assert.equal((await locator.invoke("count", {
  target: { kind: "label", value: "邮箱地址", exact: true },
})).count, 1);
assert.equal((await locator.invoke("count", {
  target: { kind: "placeholder", value: "请输入名称", exact: true },
})).count, 1);
assert.equal((await locator.invoke("count", {
  target: { kind: "role", role: "button", name: "影子操作", exact: true },
})).count, 1);
assert.equal((await locator.invoke("count", {
  target: {
    kind: "role",
    role: "button",
    name: "保存资料",
    exact: true,
    framePath: [{ kind: "css", value: "#profile-frame" }],
  },
})).count, 1);

const delayedPointPromise = locator.invoke("point", {
  target: { kind: "role", role: "button", name: "稍后出现", exact: true },
  timeoutMs: 1000,
});
setTimeout(() => {
  const delayed = window.document.createElement("button");
  delayed.textContent = "稍后出现";
  delayed.style.opacity = "1";
  window.document.body.appendChild(delayed);
}, 50);
const delayedPoint = await delayedPointPromise;
assert.equal(delayedPoint.x, 60);

const point = await locator.invoke("point", { selector: ".multi" });
assert.deepEqual({ x: point.x, y: point.y }, { x: 60, y: 35 });

window.document.querySelectorAll(".multi")[1].dataset.hidden = "false";
await assert.rejects(() => locator.invoke("point", { selector: ".multi" }), /selector_ambiguous/);

const input = window.document.querySelector("#name");
const events = [];
input.addEventListener("input", () => events.push("input"));
input.addEventListener("change", () => events.push("change"));
await locator.invoke("fill", { selector: "#name", value: "ActSpace" });
assert.equal(input.value, "ActSpace");
assert.deepEqual(events, ["input", "change"]);

const selected = await locator.invoke("select_option", {
  selector: "#choice",
  selections: [{ valueOrLabel: "b" }],
});
assert.deepEqual(Array.from(selected.values), ["b"]);

const checked = await locator.invoke("set_checked", { selector: "#check", checked: true });
assert.equal(checked.value, false);
assert.equal(checked.point.x, 60);

const snapshot = await locator.invoke("visible_dom", { limit: 500 });
assert.ok(snapshot.nodes.length >= 4);
assert.equal(snapshot.total, snapshot.returned);
assert.equal(snapshot.truncated, false);
assert.ok(snapshot.nodes.some((node) => node.text === "Drag me"));
assert.ok(!snapshot.nodes.some((node) => node.text === "Offscreen"));
const staleID = snapshot.nodes.find((node) => node.tagName === "button").nodeId;
window.document.querySelector("#only").remove();
await assert.rejects(() => locator.invoke("node_point", { nodeId: staleID }), /node_snapshot_stale/);

assert.equal((await locator.invoke("count", { selector: "button" })).count, 6);
const firstTextPage = await locator.invoke("all_text_contents", { selector: "button", offset: 0, limit: 2 });
assert.deepEqual(Array.from(firstTextPage.values), ["", "Visible"]);
assert.deepEqual(
  { total: firstTextPage.total, offset: firstTextPage.offset, returned: firstTextPage.returned, has_more: firstTextPage.has_more },
  { total: 6, offset: 0, returned: 2, has_more: true },
);
const secondReadPage = await locator.invoke("read_all", { selector: "button", offset: 5, limit: 2 });
assert.equal(secondReadPage.values[0].text_content, "icon");
assert.deepEqual(
  { total: secondReadPage.total, offset: secondReadPage.offset, returned: secondReadPage.returned, has_more: secondReadPage.has_more },
  { total: 6, offset: 5, returned: 1, has_more: false },
);
assert.equal((await locator.invoke("is_enabled", { selector: "#name" })).value, true);
await locator.invoke("wait_for", { selector: "#name", state: "visible", timeoutMs: 100 });
assert.equal((await locator.invoke("download_media_selector", { selector: "#media" })).url, "https://example.test/image.png");
assert.equal((await locator.invoke("download_media_selector", { selector: "#download" })).url, "https://example.test/sample.txt");
assert.equal(clickedDownloadName, "browser-bridge-sample.txt");
assert.equal((await locator.invoke("clipboard_read_text", {})).text, "initial");
await locator.invoke("clipboard_write_text", { text: "updated" });
assert.equal(clipboardText, "updated");
clipboardItems = [new window.ClipboardItem({ "text/plain": new Blob(["hello"], { type: "text/plain" }) })];
const richClipboard = await locator.invoke("clipboard_read", {});
assert.equal(richClipboard.items[0].entries[0].mime_type, "text/plain");
assert.equal(richClipboard.items[0].entries[0].text, "hello");
await locator.invoke("clipboard_write", { items: richClipboard.items });
assert.equal(clipboardItems[0].types[0], "text/plain");

process.stdout.write("browser locator runtime fixture passed\n");
