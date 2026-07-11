const path = require("node:path");

const { BridgeClient } = require(path.resolve(
  __dirname,
  "../../../../packages/agent-core/dist/tools/tools/browser/bridge-client.js",
));

const socketPath = path.join(
  process.env.HOME,
  "Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock",
);
const fixtureURL = process.env.ABB_ACCEPTANCE_URL ?? "http://127.0.0.1:4173/index.html";
const uploadPath = path.resolve(__dirname, "sample.txt");

const client = new BridgeClient({
  socketPath,
  sessionId: `acceptance-${Date.now()}`,
  turnId: "fixture-smoke",
  timeoutMs: 30_000,
});

let tabId;
const checks = [];

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  }
  checks.push(message);
}

async function execute(category, action, params = {}) {
  try {
    const execution = await client.send("agent_browser_bridge.command.execute", {
      category,
      action,
      params,
    });
    return execution.result;
  } catch (error) {
    error.message = `${category}.${action}: ${error.message}`;
    throw error;
  }
}

function nodeByText(nodes, text) {
  return nodes.find((node) => String(node.text ?? node.name ?? "").includes(text));
}

function center(node) {
  const box = node.bounding_box ?? node.boundingBox;
  if (!box) throw new Error(`DOM node has no bounding box: ${JSON.stringify(node)}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function main() {
  try {
    const created = await execute("tabs", "create", { url: fixtureURL, active: true });
    tabId = created.id;
    assert(Number.isInteger(tabId), "created fixture tab", created);

    await execute("wait", "load_state", { tab_id: tabId, state: "load", timeout_ms: 15_000 });
    const title = await execute("locator", "inner_text", { tab_id: tabId, selector: "#fixture-title" });
    assert(title.value === "Browser Bridge Acceptance Fixture", "read fixture title", title);

    await execute("locator", "fill", { tab_id: tabId, selector: "#name-input", value: "ActSpace" });
    await execute("locator", "fill", { tab_id: tabId, selector: "#notes-input", value: "Plan 5" });
    await execute("locator", "select_option", {
      tab_id: tabId,
      selector: "#color-select",
      selections: [{ value: "green" }],
    });
    const checked = await execute("locator", "set_checked", {
      tab_id: tabId,
      selector: "#agree-checkbox",
      checked: true,
    });
    assert(checked.value === true, "checked fixture checkbox", checked);
    await execute("locator", "click", { tab_id: tabId, selector: "#apply-button" });

    const form = await execute("locator", "inner_text", { tab_id: tabId, selector: "#result-output" });
    const formState = JSON.parse(form.value);
    assert(
      formState.name === "ActSpace" &&
        formState.notes === "Plan 5" &&
        formState.color === "green" &&
        formState.agreed === true &&
        formState.applied === 1,
      "applied locator form state",
      formState,
    );

    const snapshot = await execute("dom", "snapshot", { tab_id: tabId });
    assert(Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0, "captured visible DOM snapshot");
    const counterNode = nodeByText(snapshot.nodes, "Click count: 0");
    assert(Boolean(counterNode), "found counter DOM node", snapshot.nodes);
    await execute("dom", "click", { tab_id: tabId, node_id: counterNode.node_id ?? counterNode.nodeId });
    const counter = await execute("locator", "inner_text", { tab_id: tabId, selector: "#click-counter" });
    assert(counter.value === "Click count: 1", "clicked through DOM CUA", counter);

    const counterPoint = center(counterNode);
    await execute("cua", "move", { tab_id: tabId, ...counterPoint });
    await execute("cua", "click", { tab_id: tabId, ...counterPoint, button: "left" });
    const cuaCounter = await execute("locator", "inner_text", { tab_id: tabId, selector: "#click-counter" });
    assert(cuaCounter.value === "Click count: 2", "clicked through coordinate CUA", cuaCounter);
    const cursorOverlay = await execute("locator", "count", {
      tab_id: tabId,
      selector: "#__actspace-cursor-overlay",
    });
    assert(cursorOverlay.count === 1, "injected Agent cursor overlay", cursorOverlay);

    await execute("debug", "logs", { tab_id: tabId, filter: "browser-bridge-fixture", limit: 10 });
    await execute("locator", "click", { tab_id: tabId, selector: "#console-button" });
    const consoleOutput = await execute("locator", "inner_text", { tab_id: tabId, selector: "#console-output" });
    assert(
      consoleOutput.value === "[browser-bridge-fixture] console probe 1",
      "emitted console probe",
      consoleOutput,
    );
    const logs = await execute("debug", "logs", {
      tab_id: tabId,
      filter: "browser-bridge-fixture",
      limit: 10,
    });
    assert(
      logs.logs.some((entry) => JSON.stringify(entry).includes("console probe 1")),
      "captured console event",
      logs,
    );

    const chooser = await execute("wait", "file_chooser", { tab_id: tabId, timeout_ms: 15_000 });
    await execute("locator", "click", { tab_id: tabId, selector: "#file-input" });
    await execute("io", "set_file_chooser_files", {
      tab_id: tabId,
      file_chooser_id: chooser.file_chooser_id,
      files: [uploadPath],
    });
    const fileOutput = await execute("locator", "inner_text", { tab_id: tabId, selector: "#file-output" });
    assert(fileOutput.value === "sample.txt", "set captured file chooser", fileOutput);

    const screenshot = await execute("cua", "screenshot", { tab_id: tabId });
    assert(
      typeof screenshot.data === "string" && screenshot.data.length > 100 && screenshot.width > 0,
      "captured CUA screenshot",
      { width: screenshot.width, height: screenshot.height },
    );

    await execute("locator", "scroll", {
      tab_id: tabId,
      selector: "#drag-source",
      direction: "down",
      amount: 1,
    });
    const dragSnapshot = await execute("dom", "snapshot", { tab_id: tabId });
    const dragSource = nodeByText(dragSnapshot.nodes, "Drag me");
    const dropTarget = nodeByText(dragSnapshot.nodes, "Drop here");
    assert(Boolean(dragSource && dropTarget), "found drag-and-drop DOM nodes", dragSnapshot.nodes);
    const dragStart = center(dragSource);
    const dragEnd = center(dropTarget);
    await execute("cua", "drag", {
      tab_id: tabId,
      path: [
        dragStart,
        { x: (dragStart.x + dragEnd.x) / 2, y: (dragStart.y + dragEnd.y) / 2 },
        dragEnd,
      ],
    });
    const dropped = await execute("locator", "inner_text", { tab_id: tabId, selector: "#drop-target" });
    assert(dropped.value === "Dropped", "dragged through coordinate CUA", dropped);

    let scrollSnapshot;
    let visibleScrollTarget;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      scrollSnapshot = await execute("dom", "snapshot", { tab_id: tabId });
      visibleScrollTarget = nodeByText(scrollSnapshot.nodes, "Scroll target reached");
      if (visibleScrollTarget) break;
      await execute("locator", "scroll", { tab_id: tabId, direction: "down", amount: 100 });
    }
    assert(Boolean(visibleScrollTarget), "scrolled to fixture target", scrollSnapshot?.nodes);

    await execute("navigation", "goto", {
      tab_id: tabId,
      url: new URL("page-two.html", fixtureURL).href,
      timeout_ms: 15_000,
    });
    const pageTwo = await execute("locator", "inner_text", { tab_id: tabId, selector: "#page-two-title" });
    assert(pageTwo.value === "Acceptance Page Two", "navigated to page two", pageTwo);
    await execute("navigation", "back", { tab_id: tabId });
    await execute("wait", "url", { tab_id: tabId, url: fixtureURL, timeout_ms: 15_000 });
    assert(true, "navigated back to fixture root");

    console.log(JSON.stringify({ ok: true, tab_id: tabId, checks }, null, 2));
  } finally {
    if (tabId !== undefined) {
      try {
        await execute("tabs", "finalize", { keep: [] });
      } catch (error) {
        console.error(`fixture cleanup failed: ${error.message}`);
      }
    }
    await client.dispose();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
