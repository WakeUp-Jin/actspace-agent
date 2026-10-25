import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SelectionDescription } from "@actspace/harness-control";
import { createNodeSandboxHostPort, createSandboxService, findBundledNono, repoNonoPath } from "@actspace/sandbox";
import { createNonoBackend } from "@actspace/sandbox-nono";
import { createHarnessEvaluationService } from "../service.js";
import type { HarnessEvaluationHostPort, HarnessEvaluationOutcome } from "../types.js";
import { startFakeOpenAi, type FakeStep } from "./fake-openai.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliEntry = join(repoRoot, "apps", "cli", "dist", "cli.js");
const nonoPath = findBundledNono([process.env.ACTSPACE_NONO_PATH, repoNonoPath(repoRoot)]);
const PROBE = `import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const write = path => { try { writeFileSync(path, "x"); return "written"; } catch (error) { return error.code; } };
const [what, target] = process.argv.slice(2);
if (what === "network") console.log(await fetch("https://example.com", { signal: AbortSignal.timeout(5000) }).then(() => "online", () => "offline"));
if (what === "env") console.log(\`sentinel=[\${process.env.ACTSPACE_EVAL_SENTINEL ?? ""}]\`);
if (what === "home") console.log("home", write(join(homedir(), "actspace-evaluation-probe")));
if (what === "write") console.log("write", write(target));
`;
const temp = async (prefix: string) => realpath(await mkdtemp(join(tmpdir(), `harness-evaluation-it-${prefix}-`)));

/** Real nono and the built CLI (`pnpm --filter "@actspace/agent-cli..." build`) as the candidate, a scripted model on loopback. */
describe.skipIf(!nonoPath || !existsSync(cliEntry) || process.platform === "win32")("harness evaluation with nono and the CLI", () => {
  let artifactRoot: string; let selection: SelectionDescription; let executionDigest: string;
  beforeAll(async () => {
    // A mock run under the same CLI Host gives a real selection and its artifacts.
    const source = await temp("source");
    await promisify(execFile)(process.execPath, [cliEntry, "run", "--mock", "--json", "--input", "seed", "--data-dir", source, "--workspace", await temp("seed")]);
    const rows = (await readFile(join(source, "harness-state", "selections.jsonl"), "utf8")).trim().split("\n");
    const record = (JSON.parse(rows.at(-1)!) as { record: { description: SelectionDescription; executionDigest: string } }).record;
    selection = record.description; executionDigest = record.executionDigest; artifactRoot = join(source, "harness-artifacts");
  }, 60_000);

  async function evaluate(steps: readonly FakeStep[], options: { readonly digest?: string; readonly timeoutMs?: number; readonly selection?: SelectionDescription } = {}) {
    const model = await startFakeOpenAi(steps);
    const workspace = await temp("workspace"); const tempRoot = await temp("roots");
    await writeFile(join(workspace, "README.md"), "original");
    await writeFile(join(workspace, "probe.mjs"), PROBE);
    const sandboxHost = createNodeSandboxHostPort({ nonoPath });
    const sandbox = createSandboxService({ host: sandboxHost });
    sandbox.register(createNonoBackend(sandboxHost));
    const host: HarnessEvaluationHostPort = { launcher: [process.execPath, cliEntry], artifactRoot, modelEnvironment: async () => ({ env: { LLM_PROVIDER: "fake", FAKE_API_KEY: "test-key", FAKE_BASE_URL: model.url }, domains: [], localPorts: [model.port] }) };
    const evaluation = createHarnessEvaluationService({ sandbox, host, tempRoot, env: { ...process.env, ACTSPACE_EVAL_SENTINEL: "leaked" } });
    try {
      const result = await evaluation.run({ selection: options.selection ?? selection, ...(options.digest ? { executionDigest: options.digest } : {}), task: { input: "work on the repo" }, workspace, ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) });
      return { result: result as HarnessEvaluationOutcome, tools: model.toolResults().join("\n"), workspace, roots: await readdir(tempRoot) };
    } finally { await model.close(); }
  }
  const bash = (command: string) => ({ tool: "bash", arguments: { command, intent: "Probe the evaluation sandbox" } });
  // The CLI's Bash rules refuse quoting and expansion, so probes are a script in the (copied) workspace.
  const probe = (...args: string[]) => bash([process.execPath, "probe.mjs", ...args].join(" "));

  it("runs the pinned candidate with its own Bash unsandboxed inside the evaluation sandbox", async () => {
    const { result, tools, workspace, roots } = await evaluate([
      bash("touch inside.txt && ls inside.txt"),
      probe("network"),
      probe("env"),
      probe("home"),
      { text: "done" },
    ], { digest: executionDigest });
    expect(result).toMatchObject({ status: "completed", result: { ok: true, finalText: "done", harness: { executionDigest } }, sandbox: { facts: { isolation: "sandboxed", backend: { id: "nono" } } }, cleanup: "ok" });
    expect(tools).toContain("sandbox=inherited");
    expect(tools).toContain("inside.txt");
    expect(tools).toContain("offline");
    expect(tools).toContain("sentinel=[]");
    expect(tools).not.toContain("leaked");
    expect(tools).toMatch(/home E(PERM|ACCES)/);
    expect((await readdir(workspace)).sort()).toEqual(["README.md", "probe.mjs"]);
    expect(roots).toEqual([]);
  }, 120_000);

  it("cannot write into the original workspace", async () => {
    const target = await temp("original");
    const { result, tools } = await evaluate([probe("write", join(target, "escape.txt")), { text: "done" }]);
    expect(result.status).toBe("completed");
    expect(tools).toMatch(/write E(PERM|ACCES)/);
    expect(await readdir(target)).toEqual([]);
  }, 120_000);

  it("fails with the candidate's refusal when the pinned digest does not match", async () => {
    const { result, roots } = await evaluate([{ text: "unused" }], { digest: "0".repeat(64) });
    expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("wrote no result (candidate exit code 3)"), outputTail: expect.stringContaining("HARNESS_SELECTION_INVALID") });
    expect(roots).toEqual([]);
  }, 120_000);

  it("fails before starting when an artifact is missing", async () => {
    const { result } = await evaluate([{ text: "unused" }], { selection: { ...selection, artifactIds: [...selection.artifactIds, `sha256-${"f".repeat(64)}`] } });
    expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("Cannot copy Harness artifact") });
    expect(result.sandbox).toBeUndefined();
  }, 120_000);

  it("times out a hanging candidate without leaving processes behind", async () => {
    const { result, roots } = await evaluate([{ hang: true }], { timeoutMs: 4_000 });
    expect(result).toMatchObject({ status: "timed_out", sandbox: { outcome: { status: "timed_out", residual: false } }, cleanup: "ok" });
    expect(roots).toEqual([]);
  }, 120_000);
});
