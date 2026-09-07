const PROTOCOL_VERSION = "0.2.0";
const HOST_NAME = "com.agent_browser_bridge.host";
const SUPPORTED_CDP_METHODS = new Set([
  "Runtime.evaluate",
  "Runtime.callFunctionOn",
  "Runtime.releaseObject",
  "Runtime.enable",
  "Log.enable",
  "Page.navigate",
  "Page.enable",
  "Page.reload",
  "Page.captureScreenshot",
  "Page.getLayoutMetrics",
  "Page.getNavigationHistory",
  "Page.navigateToHistoryEntry",
  "Page.getFrameTree",
  "Page.createIsolatedWorld",
  "Page.setInterceptFileChooserDialog",
  "Input.dispatchMouseEvent",
  "Input.dispatchKeyEvent",
  "Input.insertText",
  "Input.synthesizeScrollGesture",
  "DOM.getDocument",
  "DOM.querySelector",
  "DOM.describeNode",
  "DOM.setFileInputFiles",
  "Target.setAutoAttach",
]);

const state = {
  version: chrome.runtime.getManifest?.().version ?? "0.2.2",
  nativePort: null,
  nativeConnected: false,
  nativeLastError: null,
  sessions: new Map(),
  deliverableGroupId: null,
  debuggerRefs: new Map(),
  childSessions: new Map(),
};

function getSessionState(params = {}) {
  const sessionId = typeof params.sessionId === "string" && params.sessionId ? params.sessionId : "legacy";
  let session = state.sessions.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      claimedTabId: null,
      claimedTabIds: new Set(),
      ownedTabIds: new Set(),
      tabGroupId: null,
      sessionName: null,
    };
    state.sessions.set(sessionId, session);
  }
  return session;
}

function assertTabAvailableForSession(tabId, session) {
  for (const candidate of state.sessions.values()) {
    if (candidate.id !== session.id && (candidate.ownedTabIds.has(tabId) || candidate.claimedTabIds.has(tabId))) {
      const error = new Error(`Tab ${tabId} already belongs to another Agent browser session.`);
      error.code = "tab_not_in_session";
      throw error;
    }
  }
}

function ok(id, result) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id,
    ok: true,
    result
  };
}

function fail(id, code, message) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    id,
    ok: false,
    error: { code, message }
  };
}

function lastErrorMessage(fallback) {
  return chrome.runtime.lastError?.message ?? fallback;
}

function promisifyChrome(fn) {
  return new Promise((resolve, reject) => {
    fn((value) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(value);
    });
  });
}

function normalizeTab(tab, session = null) {
  return {
    id: tab.id,
    window: tab.windowId,
    title: tab.title ?? "",
    url: tab.url ?? "",
    active: Boolean(tab.active),
    status: tab.status ?? "",
    claimed: Boolean(session?.claimedTabIds.has(tab.id)),
    owned: Boolean(session?.ownedTabIds.has(tab.id))
  };
}

function getInfo() {
  const sessions = Array.from(state.sessions.values());
  return {
    name: "agent-browser-bridge-chrome-extension",
    version: state.version,
    protocolVersion: PROTOCOL_VERSION,
    nativeMessaging: {
      hostName: HOST_NAME,
      connected: state.nativeConnected,
      lastError: state.nativeLastError
    },
    session: {
      sessionIds: sessions.map((session) => session.id),
      claimedTabIds: sessions.flatMap((session) => Array.from(session.claimedTabIds)),
      ownedTabIds: sessions.flatMap((session) => Array.from(session.ownedTabIds))
    },
    methods: [
      "agent_browser_bridge.ping",
      "agent_browser_bridge.info",
      "agent_browser_bridge.tabs",
      "agent_browser_bridge.user_tabs",
      "agent_browser_bridge.history",
      "agent_browser_bridge.open_tab",
      "agent_browser_bridge.claim_tab",
      "agent_browser_bridge.navigate",
      "agent_browser_bridge.wait_load",
      "agent_browser_bridge.page_info",
      "agent_browser_bridge.finalize_tabs",
      "agent_browser_bridge.cdp",
      "agent_browser_bridge.backend.attach",
      "agent_browser_bridge.backend.detach",
      "agent_browser_bridge.backend.execute_cdp",
      "agent_browser_bridge.backend.tabs.create",
      "agent_browser_bridge.backend.tabs.close",
      "agent_browser_bridge.backend.tabs.list",
      "agent_browser_bridge.backend.user_tabs.list",
      "agent_browser_bridge.backend.user_tabs.claim",
      "agent_browser_bridge.backend.history.search",
      "agent_browser_bridge.backend.session.name",
      "agent_browser_bridge.backend.session.finalize",
      "agent_browser_bridge.backend.cursor.move"
    ],
    capabilities: {
      tabs: true,
      history: Boolean(chrome.history),
      tab_groups: Boolean(chrome.tabGroups),
      downloads: Boolean(chrome.downloads),
      cdp: Boolean(chrome.debugger),
      cdp_events: Boolean(chrome.debugger),
      file_chooser: Boolean(chrome.debugger),
      file_chooser_events: Boolean(chrome.debugger),
      clipboard: Boolean(chrome.debugger),
      timer: true,
      debugger: Boolean(chrome.debugger)
    }
  };
}

function connectNativeHost() {
  if (state.nativePort) {
    return state.nativePort;
  }
  try {
    const port = chrome.runtime.connectNative(HOST_NAME);
    state.nativePort = port;
    state.nativeConnected = false;
    state.nativeLastError = null;

    port.onDisconnect.addListener(() => {
      state.nativePort = null;
      state.nativeConnected = false;
      state.nativeLastError = lastErrorMessage("Native host disconnected.");
      console.warn("[agent-browser-bridge] native host disconnected", state.nativeLastError);
    });

    port.onMessage.addListener((message) => {
      if (!state.nativeConnected) {
        state.nativeConnected = true;
        console.info("[agent-browser-bridge] native host connected", { hostName: HOST_NAME });
      }
      handleNativeRequest(message).then((response) => {
        try {
          port.postMessage(response);
        } catch (error) {
          console.error("[agent-browser-bridge] failed to post native response", error);
        }
      });
    });

    console.info("[agent-browser-bridge] native host connecting", { hostName: HOST_NAME });
    return port;
  } catch (error) {
    state.nativePort = null;
    state.nativeConnected = false;
    state.nativeLastError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function postNativeEvent(method, params) {
  if (!state.nativePort) return;
  try {
    state.nativePort.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      method,
      params
    });
  } catch (error) {
    console.warn("[agent-browser-bridge] failed to post native event", method, error);
  }
}

async function handleNativeRequest(message) {
  const id = message?.id ?? "";
  if (!message || typeof message !== "object") {
    return fail(id, "invalid_message", "Expected an object request.");
  }
  if (message.protocolVersion && message.protocolVersion !== PROTOCOL_VERSION) {
    return fail(id, "invalid_message", `Unsupported protocol version: ${message.protocolVersion}`);
  }
  try {
    switch (message.method) {
      case "agent_browser_bridge.ping":
        return ok(id, {
          pong: true,
          protocolVersion: PROTOCOL_VERSION,
          extensionConnected: true
        });
      case "agent_browser_bridge.info":
      case "agent_browser_bridge.native.connect":
        return ok(id, getInfo());
      case "agent_browser_bridge.tabs":
      case "agent_browser_bridge.user_tabs":
        return ok(id, await listTabs());
      case "agent_browser_bridge.history":
        return ok(id, await searchHistory(message.params ?? {}));
      case "agent_browser_bridge.open_tab":
        return ok(id, await openTab(message.params ?? {}));
      case "agent_browser_bridge.claim_tab":
        return ok(id, await claimTab(message.params ?? {}));
      case "agent_browser_bridge.navigate":
        return ok(id, await navigateTab(message.params ?? {}));
      case "agent_browser_bridge.wait_load":
        return ok(id, await waitLoad(message.params ?? {}));
      case "agent_browser_bridge.page_info":
        return ok(id, await pageInfo(message.params ?? {}));
      case "agent_browser_bridge.finalize_tabs":
        return ok(id, await finalizeTabs(message.params ?? {}));
      case "agent_browser_bridge.cdp":
        return ok(id, await executeCdp(message.params ?? {}));
      case "agent_browser_bridge.close_tab":
        return ok(id, await closeTab(message.params ?? {}));
      case "agent_browser_bridge.name_session":
        return ok(id, await nameSession(message.params ?? {}));
      case "agent_browser_bridge.backend.attach":
        return ok(id, await attachPrimitive(message.params ?? {}));
      case "agent_browser_bridge.backend.detach":
        return ok(id, await detachPrimitive(message.params ?? {}));
      case "agent_browser_bridge.backend.execute_cdp":
        return ok(id, await executeCdpPrimitive(message.params ?? {}));
      case "agent_browser_bridge.backend.tabs.create":
        return ok(id, await openTab(message.params ?? {}));
      case "agent_browser_bridge.backend.tabs.close":
        return ok(id, await closeTab(message.params ?? {}));
      case "agent_browser_bridge.backend.tabs.list":
        return ok(id, await listSessionTabs(message.params ?? {}));
      case "agent_browser_bridge.backend.user_tabs.list":
        return ok(id, await listTabs());
      case "agent_browser_bridge.backend.user_tabs.claim":
        return ok(id, await claimTab(message.params ?? {}));
      case "agent_browser_bridge.backend.history.search":
        return ok(id, await searchHistory(message.params ?? {}));
      case "agent_browser_bridge.backend.session.name":
        return ok(id, await nameSession(message.params ?? {}));
      case "agent_browser_bridge.backend.session.finalize":
        return ok(id, await finalizeTabs(message.params ?? {}));
      case "agent_browser_bridge.backend.cursor.move":
        return ok(id, await moveCursorPrimitive(message.params ?? {}));
      case "agent_browser_bridge.session.start":
        return ok(id, { sessionId: (message.params ?? {}).sessionId });
      case "agent_browser_bridge.session.end":
        return ok(id, { status: "ended" });
      default:
        return fail(id, "unsupported_method", `Unsupported method: ${message.method ?? "unknown"}`);
    }
  } catch (error) {
    return fail(id, error.code ?? "browser_api_failed", error.message ?? String(error));
  }
}

async function listTabs() {
  const tabs = await promisifyChrome((done) => chrome.tabs.query({}, done));
  return tabs.map((tab) => normalizeTab(tab));
}

async function listSessionTabs(params) {
  const session = getSessionState(params);
  const tabs = await listTabs();
  return tabs
    .filter((tab) => session.ownedTabIds.has(tab.id) || session.claimedTabIds.has(tab.id))
    .map((tab) => normalizeTab(tab, session));
}

async function searchHistory(params) {
  if (!chrome.history) {
    const error = new Error("chrome.history is unavailable. Add the history permission and reload the extension.");
    error.code = "browser_api_failed";
    throw error;
  }
  const text = params.query ?? "";
  const maxResults = Number(params.limit ?? 20);
  const query = { text, maxResults: Math.max(1, maxResults) };
  if (params.from) query.startTime = Date.parse(params.from);
  if (params.to) query.endTime = Date.parse(params.to);
  const items = await promisifyChrome((done) => chrome.history.search(query, done));
  return items.map((item) => ({
    id: item.id,
    url: item.url ?? "",
    title: item.title ?? "",
    lastVisitTime: Math.trunc(item.lastVisitTime ?? 0),
    visitCount: item.visitCount ?? 0,
    typedCount: item.typedCount ?? 0
  }));
}

async function openTab(params) {
  const session = getSessionState(params);
  if (params.url) validateUrl(params.url);
  const createProperties = { active: Boolean(params.active) };
  if (params.url) createProperties.url = params.url;
  const tab = await promisifyChrome((done) =>
    chrome.tabs.create(createProperties, done)
  );
  if (tab.id) {
    session.ownedTabIds.add(tab.id);
    session.claimedTabId = tab.id;
    await addTabToGroup(session, tab.id, tab.windowId);
  }
  return normalizeTab(tab, session);
}

async function claimTab(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertTabAvailableForSession(tabId, session);
  const tab = await promisifyChrome((done) => chrome.tabs.get(tabId, done));
  session.claimedTabId = tabId;
  session.claimedTabIds.add(tabId);
  await addTabToGroup(session, tabId, tab.windowId);
  return normalizeTab(tab, session);
}

async function navigateTab(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertSessionTab(session, tabId);
  validateUrl(params.url);
  const tab = await promisifyChrome((done) => chrome.tabs.update(tabId, { url: params.url }, done));
  return normalizeTab(tab, session);
}

async function waitLoad(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertSessionTab(session, tabId);
  const stateName = params.state ?? "complete";
  const timeoutMs = Number(params.timeoutMs ?? 15000);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await promisifyChrome((done) => chrome.tabs.get(tabId, done));
    if (matchesLoadState(tab.status, stateName)) {
      return normalizeTab(tab, session);
    }
    await sleep(250);
  }
  const error = new Error(`Timed out waiting for tab ${tabId} to reach ${stateName}.`);
  error.code = "request_timeout";
  throw error;
}

async function pageInfo(params) {
  const tabId = positiveTabId(params.tabId);
  const tab = await promisifyChrome((done) => chrome.tabs.get(tabId, done));
  return {
    tabId,
    window: tab.windowId,
    title: tab.title ?? "",
    url: tab.url ?? "",
    status: tab.status ?? "",
    active: Boolean(tab.active),
    summary: `${tab.title ?? ""} ${tab.url ?? ""}`.trim()
  };
}

async function finalizeTabs(params) {
  const session = getSessionState(params);
  const keep = params.keep ?? [];
  const keepIds = new Set(keep.map((entry) => positiveTabId(entry.tabId)));
  const sessionTabIds = new Set([...session.ownedTabIds, ...session.claimedTabIds]);
  for (const tabId of keepIds) {
    if (!sessionTabIds.has(tabId)) {
      const error = new Error(`Tab ${tabId} is not owned or claimed by the active Agent session.`);
      error.code = "tab_not_in_session";
      throw error;
    }
  }
  const closed = [];
  for (const tabId of sessionTabIds) {
    if (keepIds.has(tabId)) continue;
    try {
      await promisifyChrome((done) => chrome.tabs.remove(tabId, done));
      closed.push(tabId);
      session.ownedTabIds.delete(tabId);
      session.claimedTabIds.delete(tabId);
      if (session.claimedTabId === tabId) {
        session.claimedTabId = null;
      }
    } catch (error) {
      console.warn("[agent-browser-bridge] failed to close owned tab", tabId, error);
    }
  }

  const deliverableIds = keep
    .filter((entry) => entry.status === "deliverable")
    .map((entry) => Number(entry.tabId));
  await moveTabsToDeliverableGroup(deliverableIds);
  for (const tabId of deliverableIds) {
    session.ownedTabIds.delete(tabId);
    session.claimedTabIds.delete(tabId);
    if (session.claimedTabId === tabId) session.claimedTabId = null;
  }

  return { closed, kept: Array.from(keepIds) };
}

async function executeCdp(params) {
  const tabId = positiveTabId(params.tabId);
  if (!SUPPORTED_CDP_METHODS.has(params.method)) {
    const error = new Error(`Unsupported CDP method in this baseline: ${params.method}`);
    error.code = "unsupported_method";
    throw error;
  }
  const target = { tabId };
  await attachDebugger(target);
  try {
    return await promisifyChrome((done) =>
      chrome.debugger.sendCommand(target, params.method, params.commandParams ?? {}, done)
    );
  } finally {
    await detachDebugger(target);
  }
}

async function attachPrimitive(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertSessionTab(session, tabId);
  await attachDebugger({ tabId });
  return {};
}

async function detachPrimitive(params) {
  const tabId = positiveTabId(params.tabId);
  await detachDebugger({ tabId });
  return {};
}

async function executeCdpPrimitive(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertSessionTab(session, tabId);
  if (!SUPPORTED_CDP_METHODS.has(params.method)) {
    const error = new Error(`Unsupported CDP method in this baseline: ${params.method}`);
    error.code = "unsupported_method";
    throw error;
  }
  const target = resolveDebuggerSession(tabId, params.frameId, params.sessionId);
  try {
    return await sendDebuggerCommand(target, params.method, params.commandParams ?? {});
  } catch (error) {
    if (!params.frameId || target.sessionId) throw error;
    const childSessionId = await waitForChildSession(tabId, params.frameId, 500);
    if (!childSessionId) throw error;
    return sendDebuggerCommand({ tabId, sessionId: childSessionId }, params.method, params.commandParams ?? {});
  }
}

async function moveCursorPrimitive(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertSessionTab(session, tabId);
  const x = Number(params.x);
  const y = Number(params.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const error = new Error("cursor x and y must be finite numbers.");
    error.code = "invalid_params";
    throw error;
  }
  await injectCursorOverlay(tabId);
  const target = { tabId };
  await attachDebugger(target);
  try {
    await showCursorAt(target, x, y, Boolean(params.isClick));
    return {};
  } finally {
    await detachDebugger(target);
  }
}

async function attachDebugger(target) {
  const refs = state.debuggerRefs.get(target.tabId) ?? 0;
  if (refs > 0) {
    state.debuggerRefs.set(target.tabId, refs + 1);
    return;
  }
  await promisifyChrome((done) => chrome.debugger.attach(target, "1.3", done));
  state.debuggerRefs.set(target.tabId, 1);
  await configureAutoAttach(target);
}

async function detachDebugger(target) {
  const refs = state.debuggerRefs.get(target.tabId) ?? 0;
  if (refs > 1) {
    state.debuggerRefs.set(target.tabId, refs - 1);
    return;
  }
  state.debuggerRefs.delete(target.tabId);
  state.childSessions.delete(target.tabId);
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function configureAutoAttach(target) {
  try {
    await promisifyChrome((done) => chrome.debugger.sendCommand(target, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{ type: "iframe", exclude: false }]
    }, done));
  } catch (error) {
    console.warn("[agent-browser-bridge] OOPIF auto-attach unavailable", error);
  }
}

function resolveDebuggerSession(tabId, frameId, sessionId) {
  if (sessionId) return { tabId, sessionId };
  if (frameId) {
    const childSessionId = state.childSessions.get(tabId)?.get(frameId);
    if (childSessionId) return { tabId, sessionId: childSessionId };
  }
  return { tabId };
}

function sendDebuggerCommand(target, method, commandParams = {}) {
  return promisifyChrome((done) => chrome.debugger.sendCommand(target, method, commandParams, done));
}

async function waitForChildSession(tabId, frameId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const sessionId = state.childSessions.get(tabId)?.get(frameId);
    if (sessionId) return sessionId;
    await sleep(25);
  }
  return null;
}

async function rememberChildSession(source, params) {
  if (!source.tabId || !params?.sessionId) return;
  const childTarget = { tabId: source.tabId, sessionId: params.sessionId };
  await configureAutoAttach(childTarget);
  let frameId = params.targetInfo?.targetId;
  try {
    const tree = await promisifyChrome((done) => chrome.debugger.sendCommand(childTarget, "Page.getFrameTree", {}, done));
    frameId = tree?.frameTree?.frame?.id ?? frameId;
  } catch (error) {
    console.warn("[agent-browser-bridge] failed to resolve OOPIF frame id", error);
  }
  if (!frameId) return;
  let sessions = state.childSessions.get(source.tabId);
  if (!sessions) {
    sessions = new Map();
    state.childSessions.set(source.tabId, sessions);
  }
  sessions.set(frameId, params.sessionId);
  const targetId = params.targetInfo?.targetId;
  if (targetId) sessions.set(targetId, params.sessionId);
}

function forgetChildSession(source, params) {
  if (!source.tabId || !params?.sessionId) return;
  const sessions = state.childSessions.get(source.tabId);
  if (!sessions) return;
  for (const [frameId, sessionId] of sessions) {
    if (sessionId === params.sessionId) sessions.delete(frameId);
  }
  if (sessions.size === 0) state.childSessions.delete(source.tabId);
}

function assertSessionTab(session, tabId) {
  if (!session.ownedTabIds.has(tabId) && !session.claimedTabIds.has(tabId)) {
    const error = new Error(`Tab ${tabId} is not owned or claimed by the active Agent session.`);
    error.code = "tab_not_in_session";
    throw error;
  }
}

function positiveTabId(value) {
  const tabId = Number(value);
  if (!Number.isInteger(tabId) || tabId < 1) {
    const error = new Error("tabId must be a positive integer.");
    error.code = "invalid_params";
    throw error;
  }
  return tabId;
}

function validateUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("URL must use http or https.");
    }
  } catch (error) {
    const wrapped = new Error(`Invalid URL: ${rawUrl}`);
    wrapped.code = "invalid_params";
    throw wrapped;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchesLoadState(tabStatus, requestedState) {
  if (requestedState === "loading") {
    return tabStatus === "loading" || tabStatus === "complete";
  }
  if (requestedState === "domcontentloaded") {
    return tabStatus === "complete";
  }
  return tabStatus === "complete";
}

async function closeTab(params) {
  const session = getSessionState(params);
  const tabId = positiveTabId(params.tabId);
  assertSessionTab(session, tabId);
  await promisifyChrome((done) => chrome.tabs.remove(tabId, done));
  session.ownedTabIds.delete(tabId);
  session.claimedTabIds.delete(tabId);
  if (session.claimedTabId === tabId) session.claimedTabId = null;
  return {};
}

async function addTabToGroup(session, tabId, windowId) {
  if (!chrome.tabGroups) return;
  try {
    if (session.tabGroupId) {
      try {
        await chrome.tabs.group({ tabIds: tabId, groupId: session.tabGroupId });
        return;
      } catch {
        session.tabGroupId = null;
      }
    }
    const groupId = await chrome.tabs.group({ tabIds: tabId, createProperties: { windowId } });
    session.tabGroupId = groupId;
    const title = session.sessionName || "ActSpace";
    await chrome.tabGroups.update(groupId, { title, color: "blue", collapsed: false });
  } catch (err) {
    console.warn("[agent-browser-bridge] failed to group tab", tabId, err);
  }
}

async function moveTabsToDeliverableGroup(tabIds) {
  if (!chrome.tabGroups || tabIds.length === 0) return;
  if (state.deliverableGroupId) {
    try {
      await chrome.tabs.group({ tabIds, groupId: state.deliverableGroupId });
      return;
    } catch {
      state.deliverableGroupId = null;
    }
  }
  const groupId = await chrome.tabs.group({ tabIds });
  state.deliverableGroupId = groupId;
  await chrome.tabGroups.update(groupId, {
    title: "✅ actspace",
    color: "blue",
    collapsed: false,
  });
}

async function nameSession(params) {
  const session = getSessionState(params);
  session.sessionName = params.name ?? "ActSpace";
  if (session.tabGroupId && chrome.tabGroups) {
    try {
      await chrome.tabGroups.update(session.tabGroupId, { title: session.sessionName });
    } catch { /* group may have been removed */ }
  }
  return {};
}

async function injectCursorOverlay(tabId) {
  const target = { tabId };
  try {
    await attachDebugger(target);
    const check = await promisifyChrome((done) =>
      chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: "window.__actspaceCursor?.version === 2",
        returnByValue: true
      }, done)
    );
    if (check?.result?.value !== true) {
      const script = await fetch(chrome.runtime.getURL("src/cursor-overlay.js")).then(r => r.text());
      await promisifyChrome((done) =>
        chrome.debugger.sendCommand(target, "Runtime.evaluate", {
          expression: script,
          returnByValue: true
        }, done)
      );
    }
    await detachDebugger(target);
  } catch {
    try { await detachDebugger(target); } catch {}
  }
}

async function showCursorAt(target, x, y, isClick = false) {
  try {
    const method = isClick ? "click" : "moveTo";
    await promisifyChrome((done) =>
      chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: `(async function(){ if(window.__actspaceCursor){await window.__actspaceCursor.${method}(${x},${y})} })()`,
        returnByValue: true,
        awaitPromise: true
      }, done)
    );
  } catch { /* cursor overlay not injected yet, non-fatal */ }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[agent-browser-bridge] extension installed", {
    reason: details.reason,
    version: state.version
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.info("[agent-browser-bridge] extension service worker started");
  connectNativeHost();
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!source.tabId) return;
  if (method === "Target.attachedToTarget") void rememberChildSession(source, params);
  if (method === "Target.detachedFromTarget") forgetChildSession(source, params);
  postNativeEvent("agent_browser_bridge.event.cdp", {
    tabId: source.tabId,
    sessionId: source.sessionId,
    method,
    params: params ?? {}
  });
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (!source.tabId) return;
  state.debuggerRefs.delete(source.tabId);
  state.childSessions.delete(source.tabId);
  postNativeEvent("agent_browser_bridge.event.debugger_detach", {
    tabId: source.tabId,
    reason
  });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  state.debuggerRefs.delete(tabId);
  state.childSessions.delete(tabId);
  for (const session of state.sessions.values()) {
    session.ownedTabIds.delete(tabId);
    session.claimedTabIds.delete(tabId);
    if (session.claimedTabId === tabId) session.claimedTabId = null;
  }
  postNativeEvent("agent_browser_bridge.event.tab_closed", {
    tabId,
    windowId: removeInfo.windowId,
    isWindowClosing: removeInfo.isWindowClosing
  });
});

chrome.tabGroups?.onRemoved?.addListener((group) => {
  for (const session of state.sessions.values()) {
    if (group.id === session.tabGroupId) session.tabGroupId = null;
  }
  if (group.id === state.deliverableGroupId) state.deliverableGroupId = null;
});

chrome.downloads.onCreated.addListener((item) => {
  postNativeEvent("agent_browser_bridge.event.download", { kind: "created", item });
});

chrome.downloads.onChanged.addListener((delta) => {
  postNativeEvent("agent_browser_bridge.event.download", { kind: "changed", delta });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    sendResponse(fail("", "invalid_message", "Expected an object message."));
    return false;
  }
  if (message.type === "agent_browser_bridge.native.connect") {
    const port = connectNativeHost();
    sendResponse(port ? ok("runtime_connect", getInfo()) : fail("runtime_connect", "native_host_unavailable", state.nativeLastError ?? "Native host unavailable."));
    return false;
  }
  handleNativeRequest({
    protocolVersion: PROTOCOL_VERSION,
    id: "runtime_message",
    method: message.type,
    params: message.params ?? {}
  }).then(sendResponse);
  return true;
});

connectNativeHost();
console.info("[agent-browser-bridge] background service worker loaded", getInfo());
