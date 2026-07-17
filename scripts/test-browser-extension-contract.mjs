#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(repoRoot, "plugins/browser-bridge/apps/chrome-extension");
const source = readFileSync(path.join(extensionRoot, "src/background.js"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
const cursorSource = readFileSync(path.join(extensionRoot, "src/cursor-overlay.js"), "utf8");

for (const method of ["Page.createIsolatedWorld", "DOM.describeNode", "Runtime.releaseObject"]) {
  assert.ok(source.includes(`"${method}"`), `extension CDP primitive allowlist missing ${method}`);
}

assert.equal(manifest.name, "ActSpace Browser");
assert.equal(manifest.action.default_title, "ActSpace Browser");
assert.deepEqual(manifest.icons, {
  16: "assets/icons/icon16.png",
  32: "assets/icons/icon32.png",
  48: "assets/icons/icon48.png",
  128: "assets/icons/icon128.png",
});

const userTabs = [
  { id: 7, windowId: 1, title: "Seven", url: "https://example.test/", active: true, status: "complete" },
  { id: 8, windowId: 1, title: "Eight", url: "https://other.test/", active: false, status: "complete" },
];
let nextTabId = 9;
const calls = { attach: 0, detach: 0, cdp: 0, cdpCalls: [], close: 0, groups: [], groupUpdates: [], nativeMessages: [] };
const event = () => {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    emit(...args) { for (const listener of listeners) listener(...args); },
  };
};
const nativePort = {
  onDisconnect: event(),
  onMessage: event(),
  postMessage(message) { calls.nativeMessages.push(message); },
};
const chrome = {
  runtime: {
    lastError: null,
    connectNative: () => nativePort,
    getManifest: () => manifest,
    getURL: (value) => `chrome-extension://test/${value}`,
    onInstalled: event(),
    onStartup: event(),
    onMessage: event(),
  },
  tabs: {
    query: (_query, done) => done(userTabs),
    get: (tabId, done) => done(userTabs.find((tab) => tab.id === tabId)),
    create: (properties, done) => {
      const tab = { ...userTabs[0], id: nextTabId++, url: properties.url ?? "chrome://newtab/" };
      userTabs.push(tab);
      done(tab);
    },
    remove: (tabId, done) => {
      calls.close += 1;
      const index = userTabs.findIndex((tab) => tab.id === tabId);
      if (index >= 0) userTabs.splice(index, 1);
      done();
    },
    update: (tabId, properties, done) => done({ ...userTabs.find((tab) => tab.id === tabId), ...properties }),
    group: async (properties) => {
      calls.groups.push(properties);
      if (properties.groupId) return properties.groupId;
      return calls.groups.filter((entry) => !entry.groupId).length;
    },
    onRemoved: event(),
  },
  tabGroups: {
    update: async (groupId, properties) => { calls.groupUpdates.push({ groupId, properties }); },
    onRemoved: event(),
  },
  history: { search: (_query, done) => done([]) },
  downloads: { onCreated: event(), onChanged: event() },
  debugger: {
    attach: (_target, _version, done) => { calls.attach += 1; done(); },
    detach: (_target, done) => { calls.detach += 1; done(); },
    sendCommand: (target, method, params, done) => {
      calls.cdp += 1;
      calls.cdpCalls.push({ target, method, params });
      if (method === "Page.getFrameTree") {
        done({ frameTree: { frame: { id: "child-frame" } } });
        return;
      }
      done({ result: { value: true } });
    },
    onEvent: event(),
    onDetach: event(),
  },
};

const context = vm.createContext({
  chrome,
  console: { info() {}, warn() {}, error() {} },
  fetch: async () => ({ text: async () => "" }),
  URL,
  setTimeout,
  clearTimeout,
});
vm.runInContext(source, context, { filename: "background.js" });
assert.equal(typeof context.handleNativeRequest, "function");

const request = (method, params = {}) => context.handleNativeRequest({
  protocolVersion: "0.2.0",
  id: `${method}-${Math.random()}`,
  method,
  params,
});

const info = await request("agent_browser_bridge.info");
assert.equal(info.result.version, manifest.version);
assert.equal(info.result.protocolVersion, "0.2.0");
assert.equal(info.result.nativeMessaging.connected, false);
nativePort.onMessage.emit({
  protocolVersion: "0.2.0",
  id: "native-ping",
  method: "agent_browser_bridge.ping",
  params: {},
});
await new Promise((resolve) => setTimeout(resolve, 0));
const connectedInfo = await request("agent_browser_bridge.info");
assert.equal(connectedInfo.result.nativeMessaging.connected, true);
assert.equal(calls.nativeMessages.at(-1).id, "native-ping");

const beforeClaim = await request("agent_browser_bridge.backend.tabs.list");
assert.equal(beforeClaim.ok, true, JSON.stringify(beforeClaim));
assert.deepEqual(Array.from(beforeClaim.result), []);

const deniedAttach = await request("agent_browser_bridge.backend.attach", { tabId: 8 });
assert.equal(deniedAttach.ok, false);
assert.equal(deniedAttach.error.code, "tab_not_in_session");
assert.equal(calls.attach, 0);

const claimed = await request("agent_browser_bridge.backend.user_tabs.claim", { tabId: 7 });
assert.equal(claimed.ok, true);
assert.equal(claimed.result.claimed, true);
assert.equal(calls.groups.length, 1);
assert.equal(calls.groups[0].tabIds, 7);
assert.equal(calls.groupUpdates.at(-1).properties.title, "ActSpace");
const sessionTabs = await request("agent_browser_bridge.backend.tabs.list");
assert.deepEqual(Array.from(sessionTabs.result, (tab) => tab.id), [7]);

const named = await request("agent_browser_bridge.backend.session.name", { name: "Plan 5 Acceptance" });
assert.equal(named.ok, true);
assert.equal(calls.groupUpdates.at(-1).properties.title, "Plan 5 Acceptance");

const opened = await request("agent_browser_bridge.backend.tabs.create", {
  url: "https://created.test/",
  active: false,
});
assert.equal(opened.ok, true);
assert.equal(opened.result.id, 9);
assert.equal(calls.groups.at(-1).groupId, 1);

const finalized = await request("agent_browser_bridge.backend.session.finalize", {
  keep: [
    { tabId: 7, status: "handoff" },
    { tabId: 9, status: "deliverable" },
  ],
});
assert.equal(finalized.ok, true);
assert.deepEqual(Array.from(finalized.result.kept), [7, 9]);
assert.equal(calls.close, 0);
assert.equal(calls.groupUpdates.at(-1).properties.title, "✅ actspace");
const afterFinalize = await request("agent_browser_bridge.backend.tabs.list");
assert.deepEqual(Array.from(afterFinalize.result, (tab) => tab.id), [7]);

const attached = await request("agent_browser_bridge.backend.attach", { tabId: 7 });
assert.equal(attached.ok, true);
assert.equal(calls.attach, 1);
assert.equal(calls.cdpCalls.at(-1).method, "Target.setAutoAttach");

const cdp = await request("agent_browser_bridge.backend.execute_cdp", {
  tabId: 7,
  method: "Runtime.evaluate",
  commandParams: { expression: "1" },
});
assert.equal(cdp.ok, true);
assert.equal(calls.cdpCalls.at(-1).method, "Runtime.evaluate");

chrome.debugger.onEvent.emit(
  { tabId: 7 },
  "Target.attachedToTarget",
  { sessionId: "child-session", targetInfo: { targetId: "child-target", type: "iframe" } },
);
await new Promise((resolve) => setTimeout(resolve, 0));
const childCdp = await request("agent_browser_bridge.backend.execute_cdp", {
  tabId: 7,
  frameId: "child-frame",
  method: "Runtime.evaluate",
  commandParams: { expression: "document.title" },
});
assert.equal(childCdp.ok, true);
assert.equal(calls.cdpCalls.at(-1).target.sessionId, "child-session");

const deniedClose = await request("agent_browser_bridge.backend.tabs.close", { tabId: 8 });
assert.equal(deniedClose.ok, false);
assert.equal(deniedClose.error.code, "tab_not_in_session");
assert.equal(calls.close, 0);

const unsupportedHighLevel = await request("agent_browser_bridge.click", { tabId: 7, x: 1, y: 1 });
assert.equal(unsupportedHighLevel.ok, false);
assert.equal(unsupportedHighLevel.error.code, "unsupported_method");

const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
assert.deepEqual(resources, ["src/cursor-overlay.js"]);
assert.equal(source.includes("__actspacePlaywright"), false);
assert.equal(source.includes("clickElement("), false);
assert.equal(source.includes("void chrome.runtime.lastError"), true);
assert.equal(source.includes("window.__actspaceCursor?.version === 2"), true);
assert.equal(source.includes("awaitPromise: true"), true);
assert.equal(cursorSource.includes("async moveTo(x, y)"), true);
assert.equal(cursorSource.includes("requestAnimationFrame(frame)"), true);
assert.equal(cursorSource.includes("viewBox=\"0 0 20 24\""), true);
assert.equal(cursorSource.includes('fill="#05070a" stroke="#f8fafc"'), true);
assert.equal(cursorSource.includes('stroke-opacity=".78" stroke-width="1.15"'), true);
assert.equal(cursorSource.includes('M2.2 2.1c-.3-.2-.6.1-.5.5'), true);

const sessionACreated = await request("agent_browser_bridge.backend.tabs.create", {
  sessionId: "session-a",
  url: "https://session-a.test/",
});
const sessionBCreated = await request("agent_browser_bridge.backend.tabs.create", {
  sessionId: "session-b",
  url: "https://session-b.test/",
});
assert.equal(sessionACreated.ok, true);
assert.equal(sessionBCreated.ok, true);

const sessionAFinalized = await request("agent_browser_bridge.backend.session.finalize", {
  sessionId: "session-a",
  keep: [],
});
assert.equal(sessionAFinalized.ok, true);
assert.deepEqual(Array.from(sessionAFinalized.result.closed), [sessionACreated.result.id]);
const sessionBTabs = await request("agent_browser_bridge.backend.tabs.list", { sessionId: "session-b" });
assert.deepEqual(Array.from(sessionBTabs.result, (tab) => tab.id), [sessionBCreated.result.id]);
assert.equal(calls.close, 1);

process.stdout.write("browser extension primitive contract passed\n");
