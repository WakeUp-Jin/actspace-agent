const path = require("node:path");

const { BridgeClient } = require(path.resolve(
  __dirname,
  "../../../../packages/agent-core/dist/tools/tools/browser/bridge-client.js",
));

const socketPath = path.join(
  process.env.HOME,
  "Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock",
);
const targetURL = process.env.ABB_CLAIM_URL ?? "http://127.0.0.1:4173/page-two.html";
const client = new BridgeClient({
  socketPath,
  sessionId: `acceptance-claim-${Date.now()}`,
  turnId: "fixture-claim-smoke",
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
    const userTabs = await execute("user", "open_tabs");
    const matches = userTabs.tabs.filter((tab) => tab.url === targetURL);
    if (matches.length === 0) {
      throw new Error(`open an unclaimed Chrome tab at ${targetURL} before running this smoke`);
    }
    const target = matches.find((tab) => tab.active) ?? matches.at(-1);
    const claimed = await execute("user", "claim_tab", { tab_id: target.id });
    if (!claimed.claimed) throw new Error(`tab was not marked claimed: ${JSON.stringify(claimed)}`);

    await execute("tabs", "name_session", { name: "Plan 5 Acceptance" });
    const title = await execute("locator", "inner_text", {
      tab_id: target.id,
      selector: "#page-two-title",
    });
    if (title.value !== "Acceptance Page Two") {
      throw new Error(`unexpected page title: ${JSON.stringify(title)}`);
    }

    const finalized = await execute("tabs", "finalize", {
      keep: [{ tab_id: target.id, status: "handoff" }],
    });
    const sessionTabs = await execute("tabs", "list");
    if (!sessionTabs.tabs.some((tab) => tab.id === target.id && tab.claimed)) {
      throw new Error(`handoff tab was not preserved as claimed: ${JSON.stringify(sessionTabs)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      tab_id: target.id,
      url: target.url,
      title: title.value,
      finalize: finalized,
      handoff_preserved: true,
    }, null, 2));
  } finally {
    await client.dispose();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
