const path = require("node:path");

const { createToolManager } = require(path.resolve(
  __dirname,
  "../../../../packages/agent-core/dist/tools/index.js",
));

const socketPath = path.join(
  process.env.HOME,
  "Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock",
);
const fixtureURL = process.env.ABB_ACCEPTANCE_URL ?? "http://127.0.0.1:4173/index.html";
const sessionId = `acceptance-agent-${Date.now()}`;
const approvalRecords = [];
let decision = "approve_once";

const approvalGate = {
  waitForDecision: async (request) => {
    approvalRecords.push({
      risk_level: request.riskLevel,
      reason: request.reason,
      summary: request.summary,
      decision,
    });
    return {
      requestId: request.id,
      decision,
      decidedAt: Date.now(),
    };
  },
};

const manager = createToolManager({
  workspaceRoot: path.resolve(__dirname, "../../../.."),
  browserBridgeSocketPath: socketPath,
  sessionId,
  turnId: "fixture-agent-approval",
  approvalGate,
});

let tabId;

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  }
}

async function execute(tool, args) {
  const result = await manager.execute(tool, args);
  return result;
}

async function main() {
  try {
    const created = await execute("browser_tabs", {
      action: "create",
      url: fixtureURL,
      active: true,
    });
    assert(created.success, "Agent Core failed to create fixture tab", created);
    tabId = created.structured?.result?.id;
    assert(Number.isInteger(tabId), "Agent Core create result has no tab id", created.structured);

    const approved = await execute("browser_run", {
      actions: [
        {
          category: "locator",
          action: "fill",
          params: { tab_id: tabId, selector: "#name-input", value: "APPROVED_BY_AGENT_CORE" },
        },
        {
          category: "locator",
          action: "click",
          params: { tab_id: tabId, selector: "#apply-button" },
        },
      ],
      stop_on_error: false,
    });
    assert(approved.success, "approved browser_run failed", approved);

    const approvedState = await execute("browser_locator", {
      action: "inner_text",
      tab_id: tabId,
      selector: "#result-output",
    });
    const approvedJSON = JSON.parse(approvedState.structured?.result?.value ?? "null");
    assert(
      approvedJSON?.name === "APPROVED_BY_AGENT_CORE" && approvedJSON?.applied === 1,
      "approved Agent mutation did not reach the page",
      approvedJSON,
    );

    const reloaded = await execute("browser_navigation", { action: "reload", tab_id: tabId });
    assert(reloaded.success, "failed to reset fixture before denial", reloaded);
    const clipboardBefore = await execute("browser_io", { action: "clipboard_read_text", tab_id: tabId });
    assert(clipboardBefore.success, "failed to read clipboard before denial", clipboardBefore);

    decision = "deny";
    const denied = await execute("browser_run", {
      actions: [
        {
          category: "locator",
          action: "fill",
          params: { tab_id: tabId, selector: "#name-input", value: "SHOULD_NOT_APPEAR" },
        },
        {
          category: "locator",
          action: "click",
          params: { tab_id: tabId, selector: "#apply-button" },
        },
        {
          category: "io",
          action: "clipboard_write_text",
          params: { tab_id: tabId, text: "SHOULD_NOT_REACH_CLIPBOARD" },
        },
      ],
    });
    assert(!denied.success && String(denied.error).includes("User denied tool: browser_run"), "denied batch did not stop at approval gate", denied);

    const deniedState = await execute("browser_locator", {
      action: "inner_text",
      tab_id: tabId,
      selector: "#result-output",
    });
    assert(deniedState.structured?.result?.value === '{"state":"empty"}', "denied batch partially mutated the page", deniedState.structured);
    const clipboardAfter = await execute("browser_io", { action: "clipboard_read_text", tab_id: tabId });
    assert(clipboardAfter.structured?.result?.text === clipboardBefore.structured?.result?.text, "denied batch partially changed the clipboard");

    assert(
      approvalRecords.some((record) => record.decision === "approve_once" && record.summary.includes("locator.fill")),
      "approved batch preview was not captured",
      approvalRecords,
    );
    assert(
      approvalRecords.some((record) => record.decision === "deny" && record.risk_level === "high" && record.summary.includes("clipboard_write_text")),
      "denied high-risk batch preview was not captured",
      approvalRecords,
    );
    const serializedApprovals = JSON.stringify(approvalRecords);
    assert(!serializedApprovals.includes("APPROVED_BY_AGENT_CORE"), "approval preview leaked approved input text");
    assert(!serializedApprovals.includes("SHOULD_NOT_REACH_CLIPBOARD"), "approval preview leaked clipboard payload");

    console.log(JSON.stringify({
      ok: true,
      tab_id: tabId,
      approved_state: { name: approvedJSON.name, applied: approvedJSON.applied },
      denied_state_unchanged: true,
      denied_clipboard_unchanged: true,
      approvals: approvalRecords,
    }, null, 2));
  } finally {
    decision = "approve_once";
    if (tabId !== undefined) {
      try {
        await execute("browser_tabs", { action: "finalize", keep: [] });
      } catch (error) {
        console.error(`Agent fixture cleanup failed: ${error.message}`);
      }
    }
    await manager.dispose();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
