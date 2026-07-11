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
const clipboardProbe = "ABB_PLAN5_CLIPBOARD_20260711";
const options = new Set(process.argv.slice(2));
const runDownload = !options.has("--clipboard-only");
const runClipboard = !options.has("--download-only");
const client = new BridgeClient({
  socketPath,
  sessionId: `acceptance-io-${Date.now()}`,
  turnId: "fixture-io-smoke",
  timeoutMs: 30_000,
});

let tabId;
let previousClipboard;
let clipboardChanged = false;

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
    const created = await execute("tabs", "create", { url: fixtureURL, active: true });
    tabId = created.id;
    await execute("wait", "load_state", { tab_id: tabId, state: "load", timeout_ms: 15_000 });

    let downloadResult;
    if (runDownload) {
      const download = await execute("wait", "download", { tab_id: tabId, timeout_ms: 30_000 });
      await execute("locator", "download_media", { tab_id: tabId, selector: "#download-link" });
      downloadResult = await execute("io", "download_path", {
        tab_id: tabId,
        download_id: download.download_id,
        timeout_ms: 30_000,
      });
      if (!String(downloadResult.path ?? "").endsWith("browser-bridge-sample.txt")) {
        throw new Error(`unexpected download path: ${JSON.stringify(downloadResult)}`);
      }
    }

    if (runClipboard) {
      const clipboard = await execute("io", "clipboard_read_text", { tab_id: tabId });
      previousClipboard = clipboard.text;
      await execute("io", "clipboard_write_text", { tab_id: tabId, text: clipboardProbe });
      clipboardChanged = true;
      const roundtrip = await execute("io", "clipboard_read_text", { tab_id: tabId });
      if (roundtrip.text !== clipboardProbe) {
        throw new Error("clipboard roundtrip mismatch");
      }
      await execute("io", "clipboard_write_text", { tab_id: tabId, text: previousClipboard });
      clipboardChanged = false;
    }

    console.log(JSON.stringify({
      ok: true,
      download: downloadResult && {
        path: downloadResult.path,
        url: downloadResult.url,
      },
      clipboard: runClipboard && {
        roundtrip: true,
        restored: true,
      },
    }, null, 2));
  } finally {
    if (clipboardChanged && tabId !== undefined && typeof previousClipboard === "string") {
      try {
        await execute("io", "clipboard_write_text", { tab_id: tabId, text: previousClipboard });
      } catch (error) {
        console.error(`clipboard restore failed: ${error.message}`);
      }
    }
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
