import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { setRuntimeLoaderForTest } from "../runtime-v2/loader";
import { runCommand } from "../runtime-v2/run";
import { startFakeOpenAi } from "./fake-openai";

beforeEach(() => { setRuntimeLoaderForTest(() => import("@actspace/runtime")); });
afterEach(() => { setRuntimeLoaderForTest(); });

async function bashSummary(sandboxInherited: boolean): Promise<string> {
  const model = await startFakeOpenAi([{ tool: "bash", arguments: { command: "echo probe", intent: "Probe the sandbox" } }, { text: "done" }]);
  try {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-cli-inherit-work-"));
    const dataDir = await mkdtemp(join(tmpdir(), "actspace-cli-inherit-data-"));
    const result = await runCommand(
      { input: "run probe", workspace, dataDir, permissionMode: "full-access", permissionModeExplicit: true, outputFormat: "json", mock: false, sandboxInherited },
      { env: { LLM_PROVIDER: "fake", FAKE_API_KEY: "test-key", FAKE_BASE_URL: model.url } },
    );
    expect(result).toMatchObject({ ok: true, finalText: "done" });
    return model.toolResults().join("\n");
  } finally { await model.close(); }
}

it("marks Bash as inherited only when the launcher passes --sandbox-inherited", async () => {
  expect(await bashSummary(true)).toContain("sandboxed=false, sandbox=inherited");
  // Without the flag the CLI keeps its own tool sandbox (nono or Seatbelt here) or routes Bash to approval.
  expect(await bashSummary(false)).not.toContain("sandbox=inherited");
}, 60_000);
