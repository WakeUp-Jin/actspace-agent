const path = require("node:path");

const { BridgeClient } = require(path.resolve(
  __dirname,
  "../../../../packages/agent-core/dist/tools/tools/browser/bridge-client.js",
));

const socketPath = path.join(
  process.env.HOME,
  "Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock",
);
const deliverableURL = `http://127.0.0.1:4173/page-two.html?deliverable=${Date.now()}`;
const client = new BridgeClient({
  socketPath,
  sessionId: `acceptance-deliverable-${Date.now()}`,
  turnId: "fixture-deliverable-smoke",
  timeoutMs: 30_000,
});

async function execute(category, action, params = {}) {
  const execution = await client.send("agent_browser_bridge.command.execute", {
    category,
    action,
    params,
  });
  return execution.result;
}

async function main() {
  try {
    const created = await execute("tabs", "create", { url: deliverableURL, active: false });
    await execute("wait", "load_state", { tab_id: created.id, state: "load", timeout_ms: 15_000 });
    await execute("tabs", "name_session", { name: "Plan 5 Deliverable" });
    const finalized = await execute("tabs", "finalize", {
      keep: [{ tab_id: created.id, status: "deliverable" }],
    });
    const sessionTabs = await execute("tabs", "list");
    if (sessionTabs.tabs.some((tab) => tab.id === created.id)) {
      throw new Error(`deliverable remained in session ownership: ${JSON.stringify(sessionTabs)}`);
    }
    const userTabs = await execute("user", "open_tabs");
    const deliverable = userTabs.tabs.find((tab) => tab.id === created.id);
    if (!deliverable || deliverable.owned || deliverable.claimed) {
      throw new Error(`deliverable was not preserved as a user tab: ${JSON.stringify(deliverable)}`);
    }
    if (typeof deliverable.url !== "string" || !deliverable.url.startsWith("http://127.0.0.1:4173/page-two.html?deliverable=")) {
      throw new Error(`deliverable URL changed unexpectedly: ${JSON.stringify(deliverable)}`);
    }
    console.log(JSON.stringify({
      ok: true,
      tab_id: created.id,
      url: deliverableURL,
      finalize: finalized,
      preserved: true,
      session_ownership_released: true,
      expected_group: "✅ actspace",
    }, null, 2));
  } finally {
    await client.dispose();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
