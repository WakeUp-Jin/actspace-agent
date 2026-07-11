const path = require("node:path");

const { BridgeClient } = require(path.resolve(
  __dirname,
  "../../../../packages/agent-core/dist/tools/tools/browser/bridge-client.js",
));

const socketPath = path.join(
  process.env.HOME,
  "Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock",
);
const runId = Date.now();

function createClient(label) {
  return new BridgeClient({
    socketPath,
    sessionId: `acceptance-isolation-${label}-${runId}`,
    turnId: `fixture-isolation-${label}`,
    timeoutMs: 30_000,
  });
}

const clientA = createClient("a");
const clientB = createClient("b");
let tabA;
let tabB;

async function execute(client, category, action, params = {}) {
  const execution = await client.send("agent_browser_bridge.command.execute", {
    category,
    action,
    params,
  });
  return execution.result;
}

async function main() {
  try {
    const createdA = await execute(clientA, "tabs", "create", {
      url: `http://127.0.0.1:4173/page-two.html?session=a-${runId}`,
      active: false,
    });
    tabA = createdA.id;
    await execute(clientA, "wait", "load_state", { tab_id: tabA, state: "load", timeout_ms: 15_000 });
    await execute(clientA, "tabs", "name_session", { name: "Plan 5 Session A" });
    await execute(clientA, "tabs", "finalize", {
      keep: [{ tab_id: tabA, status: "handoff" }],
    });

    const createdB = await execute(clientB, "tabs", "create", {
      url: `http://127.0.0.1:4173/index.html?session=b-${runId}`,
      active: false,
    });
    tabB = createdB.id;
    await execute(clientB, "wait", "load_state", { tab_id: tabB, state: "load", timeout_ms: 15_000 });
    const cleanupB = await execute(clientB, "tabs", "finalize", { keep: [] });
    if (!cleanupB.closed?.includes(tabB)) {
      throw new Error(`session B did not close its own tab: ${JSON.stringify(cleanupB)}`);
    }

    const tabsA = await execute(clientA, "tabs", "list");
    if (!tabsA.tabs.some((tab) => tab.id === tabA)) {
      throw new Error(`session B cleanup removed session A handoff: ${JSON.stringify(tabsA)}`);
    }
    const tabsB = await execute(clientB, "tabs", "list");
    if (tabsB.tabs.length !== 0) {
      throw new Error(`session B retained tabs after cleanup: ${JSON.stringify(tabsB)}`);
    }

    const cleanupA = await execute(clientA, "tabs", "finalize", { keep: [] });
    if (!cleanupA.closed?.includes(tabA)) {
      throw new Error(`session A did not clean its own handoff: ${JSON.stringify(cleanupA)}`);
    }
    tabA = undefined;
    tabB = undefined;

    console.log(JSON.stringify({
      ok: true,
      session_a_handoff_survived_session_b_cleanup: true,
      session_b_cleanup_scoped: true,
      final_cleanup: true,
    }, null, 2));
  } finally {
    if (tabB !== undefined) {
      try { await execute(clientB, "tabs", "finalize", { keep: [] }); } catch {}
    }
    if (tabA !== undefined) {
      try { await execute(clientA, "tabs", "finalize", { keep: [] }); } catch {}
    }
    await Promise.allSettled([clientA.dispose(), clientB.dispose()]);
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
