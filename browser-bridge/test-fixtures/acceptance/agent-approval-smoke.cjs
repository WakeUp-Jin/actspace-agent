const path = require("node:path");

const { loadRuntimeV2 } = require("./runtime-v2-client.cjs");

const socketPath = path.join(
  process.env.HOME,
  "Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock",
);
const fixtureURL = process.env.ABB_ACCEPTANCE_URL ?? "http://127.0.0.1:4173/index.html";
const sessionId = `acceptance-runtime-v2-${Date.now()}`;
const approvalRecords = [];
const checkpointRecords = [];
let decision = "allow";
let callCounter = 0;
let runtime;
let registrations = [];
let tabId;

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  }
}

async function execute(tool, args) {
  const [result] = await runtime.executeBatch([{
    callId: `acceptance-call-${++callCounter}`,
    toolId: `actspace.browser-tools/${tool}`,
    arguments: args,
    sessionId,
    agentRunId: "acceptance-agent-run",
    turnId: "fixture-runtime-v2-approval",
    stepId: `acceptance-step-${callCounter}`,
  }], {
    workspaceRoot: path.resolve(__dirname, "../../../.."),
    hostCapabilities: new Set(["browser"]),
    capabilitySet: {
      ids: Object.freeze(["browser"]),
      has: (capabilityId) => capabilityId === "browser",
      get: () => { throw new Error("Browser tools use their registered Host port directly."); },
    },
    approvalBroker: {
      async requestApproval(request) {
        approvalRecords.push({
          risk_level: request.risk,
          reason: request.reason,
          argument_summary: request.argumentSummary,
          decision,
        });
        return {
          requestId: request.requestId,
          decision,
          decidedAt: new Date().toISOString(),
          ...(decision === "deny" ? { reason: "Acceptance fixture denied the Browser batch." } : {}),
        };
      },
    },
    journal: {
      async recordDispatch(fact) { checkpointRecords.push(`dispatch:${fact.callId}`); },
      async checkpointBeforeBody() { checkpointRecords.push(`checkpoint:${callCounter}`); },
      async commitResult(result) { checkpointRecords.push(`commit:${result.callId}`); },
    },
    async createArtifact({ bytes, mediaType }) {
      return { artifactId: `acceptance-artifact-${callCounter}`, mediaType, size: bytes.byteLength, sha256: "acceptance-only" };
    },
  });
  return result;
}

function executionResult(result) {
  const text = result.modelOutput.find((block) => block.type === "text")?.text;
  if (typeof text !== "string") throw new Error(`Tool result has no text block: ${JSON.stringify(result)}`);
  for (let index = text.lastIndexOf("\n{"); index >= 0; index = text.lastIndexOf("\n{", index - 1)) {
    try {
      return JSON.parse(text.slice(index + 1));
    } catch {}
  }
  throw new Error(`Tool result has no structured Browser payload: ${text}`);
}

async function main() {
  const { ToolRuntime, createNodeBrowserCapability, registerBrowserTools } = await loadRuntimeV2();
  runtime = new ToolRuntime();
  registrations = registerBrowserTools(runtime, createNodeBrowserCapability({ ready: true, socketPath }));

  try {
    const created = await execute("browser_tabs", {
      action: "create",
      url: fixtureURL,
      active: true,
    });
    assert(created.status === "completed", "Runtime v2 failed to create fixture tab", created);
    tabId = executionResult(created).id;
    assert(Number.isInteger(tabId), "Runtime v2 create result has no tab id", created);

    const approved = await execute("browser_run", {
      actions: [
        {
          category: "locator",
          action: "fill",
          params: { tab_id: tabId, selector: "#name-input", value: "APPROVED_BY_RUNTIME_V2" },
        },
        {
          category: "locator",
          action: "click",
          params: { tab_id: tabId, selector: "#apply-button" },
        },
      ],
      stop_on_error: false,
    });
    assert(approved.status === "completed", "approved browser_run failed", approved);

    const approvedState = await execute("browser_locator", {
      action: "inner_text",
      tab_id: tabId,
      selector: "#result-output",
    });
    const approvedJSON = JSON.parse(executionResult(approvedState).value ?? "null");
    assert(
      approvedJSON?.name === "APPROVED_BY_RUNTIME_V2" && approvedJSON?.applied === 1,
      "approved Runtime v2 mutation did not reach the page",
      approvedJSON,
    );

    const reloaded = await execute("browser_navigation", { action: "reload", tab_id: tabId });
    assert(reloaded.status === "completed", "failed to reset fixture before denial", reloaded);
    const clipboardBefore = await execute("browser_io", { action: "clipboard_read_text", tab_id: tabId });
    assert(clipboardBefore.status === "completed", "failed to read clipboard before denial", clipboardBefore);

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
    assert(denied.status === "denied" && denied.failure?.code === "APPROVAL_DENIED", "denied batch did not stop at the Host approval boundary", denied);

    const deniedState = await execute("browser_locator", {
      action: "inner_text",
      tab_id: tabId,
      selector: "#result-output",
    });
    assert(executionResult(deniedState).value === '{"state":"empty"}', "denied batch partially mutated the page", deniedState);
    const clipboardAfter = await execute("browser_io", { action: "clipboard_read_text", tab_id: tabId });
    assert(executionResult(clipboardAfter).text === executionResult(clipboardBefore).text, "denied batch partially changed the clipboard");

    assert(
      approvalRecords.some((record) => record.decision === "allow" && record.reason.includes("locator.fill")),
      "approved batch preview was not captured",
      approvalRecords,
    );
    assert(
      approvalRecords.some((record) => record.decision === "deny" && record.risk_level === "high" && record.reason.includes("clipboard_write_text")),
      "denied high-risk batch preview was not captured",
      approvalRecords,
    );
    const serializedApprovals = JSON.stringify(approvalRecords);
    assert(!serializedApprovals.includes("APPROVED_BY_RUNTIME_V2"), "approval preview leaked approved input text");
    assert(!serializedApprovals.includes("SHOULD_NOT_REACH_CLIPBOARD"), "approval preview leaked clipboard payload");
    assert(
      checkpointRecords.filter((record) => record.startsWith("checkpoint:")).length ===
        checkpointRecords.filter((record) => record.startsWith("dispatch:")).length,
      "a dispatched Browser body did not pass a durability checkpoint",
      checkpointRecords,
    );

    console.log(JSON.stringify({
      ok: true,
      tab_id: tabId,
      approved_state: { name: approvedJSON.name, applied: approvedJSON.applied },
      denied_state_unchanged: true,
      denied_clipboard_unchanged: true,
      approvals: approvalRecords,
      durability_checkpoints: checkpointRecords.filter((record) => record.startsWith("checkpoint:")).length,
    }, null, 2));
  } finally {
    decision = "allow";
    if (tabId !== undefined) {
      try {
        await execute("browser_tabs", { action: "finalize", keep: [] });
      } catch (error) {
        console.error(`Runtime v2 fixture cleanup failed: ${error.message}`);
      }
    }
    await Promise.allSettled(registrations.map((registration) => registration.dispose()));
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
