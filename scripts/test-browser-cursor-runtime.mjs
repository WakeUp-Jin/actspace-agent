#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(repoRoot, "plugins/browser-bridge/apps/chrome-extension/src/cursor-overlay.js"),
  "utf8",
);

const elements = [];
const transformWrites = [];
const createElement = (tagName) => {
  const classes = new Set();
  const styleTarget = { cssText: "" };
  const element = {
    tagName,
    id: "",
    innerHTML: "",
    children: [],
    offsetWidth: 20,
    style: new Proxy(styleTarget, {
      set(target, property, value) {
        target[property] = value;
        if (property === "transform") transformWrites.push(String(value));
        return true;
      },
    }),
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
    },
    setAttribute() {},
    appendChild(child) { this.children.push(child); elements.push(child); return child; },
    remove() {
      const index = elements.indexOf(this);
      if (index >= 0) elements.splice(index, 1);
    },
  };
  elements.push(element);
  return element;
};

let now = 0;
let nextFrameId = 1;
const cancelledFrames = new Set();
const context = vm.createContext({
  console,
  document: {
    createElement,
    getElementById: (id) => elements.find((element) => element.id === id) ?? null,
    documentElement: { appendChild(element) { elements.push(element); return element; } },
  },
  window: {
    innerWidth: 1000,
    innerHeight: 700,
    matchMedia: () => ({ matches: false }),
  },
  performance: { now: () => now },
  requestAnimationFrame(callback) {
    const id = nextFrameId++;
    setImmediate(() => {
      if (cancelledFrames.has(id)) return;
      now += 32;
      callback(now);
    });
    return id;
  },
  cancelAnimationFrame(id) { cancelledFrames.add(id); },
  setTimeout,
  clearTimeout,
  setImmediate,
  Math,
  Promise,
});
context.window.window = context.window;
context.window.document = context.document;
context.window.performance = context.performance;
context.window.requestAnimationFrame = context.requestAnimationFrame;
context.window.cancelAnimationFrame = context.cancelAnimationFrame;
context.window.setTimeout = setTimeout;

vm.runInContext(source, context, { filename: "cursor-overlay.js" });
const cursor = context.window.__actspaceCursor;
assert.equal(cursor.version, 2);

await cursor.moveTo(840, 120);
assert.deepEqual({ ...cursor.position() }, { x: 840, y: 120 });
assert.ok(transformWrites.length > 3, "cursor should animate through intermediate positions");
assert.ok(transformWrites[0].includes("500px, 350px"), "first movement should start at viewport center");
assert.ok(transformWrites.at(-1).includes("840px, 120px"), "cursor should finish at the target");

const writesBeforeSecondMove = transformWrites.length;
await cursor.moveTo(220, 560);
assert.ok(transformWrites.length > writesBeforeSecondMove + 2);
assert.deepEqual({ ...cursor.position() }, { x: 220, y: 560 });

await cursor.click(240, 580);
assert.deepEqual({ ...cursor.position() }, { x: 240, y: 580 });
assert.ok(elements.some((element) => element.style.cssText.includes("__actspace-click-ring")));

process.stdout.write("browser cursor runtime fixture passed\n");
