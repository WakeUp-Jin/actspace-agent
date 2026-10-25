import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SelectionDescription } from "@actspace/harness-control";
import { createHarnessEvaluationService } from "../service.js";
import type { HarnessEvaluationRequest } from "../types.js";
import { completedResult, exited, fakeHost, fakeSandbox, writeResult, type FakeCandidate } from "./fakes.js";

const ARTIFACT = `sha256-${"a".repeat(64)}`;
const selection = { hostContractDigest: "sha256-host", composition: { plugins: [] }, artifactIds: [ARTIFACT], sharedServices: [] } as unknown as SelectionDescription;

describe("harness evaluation service", () => {
  let base: string; let artifactRoot: string; let workspace: string; let tempRoot: string;
  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "harness-evaluation-")));
    artifactRoot = join(base, "harness-artifacts"); workspace = join(base, "workspace"); tempRoot = join(base, "temp");
    await mkdir(join(artifactRoot, ARTIFACT), { recursive: true });
    await writeFile(join(artifactRoot, ARTIFACT, "artifact.json"), "{}");
    await mkdir(workspace); await mkdir(tempRoot);
    await writeFile(join(workspace, "README.md"), "original");
  });
  afterEach(async () => { await chmod(tempRoot, 0o755).catch(() => undefined); });

  const request = (overrides: Partial<HarnessEvaluationRequest> = {}): HarnessEvaluationRequest => ({ selection, task: { input: "fix the bug" }, workspace, ...overrides });
  function service(candidate: FakeCandidate, model?: Parameters<typeof fakeHost>[1]) {
    const sandbox = fakeSandbox(candidate); const host = fakeHost(artifactRoot, model);
    return { sandbox, host, evaluation: createHarnessEvaluationService({ sandbox, host, tempRoot, env: { PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8", SECRET_SENTINEL: "leak", DEEPSEEK_API_KEY: "sk-v1" } }) };
  }

  it("runs the candidate CLI in the evaluation sandbox over copies, then removes the temp root", async () => {
    const seen: Record<string, string> = {};
    const { sandbox, evaluation } = service(async (_, argv) => {
      seen.selection = await readFile(argv.harness!, "utf8");
      seen.task = await readFile(argv["input-file"]!, "utf8");
      seen.copy = await readFile(join(argv.workspace!, "README.md"), "utf8");
      seen.artifact = (await readdir(join(argv["data-dir"]!, "harness-artifacts"))).join(",");
      await writeFile(join(argv.workspace!, "README.md"), "changed by candidate");
      await writeResult(argv.out!, completedResult);
      return exited();
    }, { upstreamProxy: "127.0.0.1:7897" });
    const result = await evaluation.run(request({ executionDigest: "sha256-pinned", task: { input: "fix the bug", model: "fake/model" } }));

    expect(result).toMatchObject({ status: "completed", result: completedResult, sandbox: { outcome: exited() }, outputTail: "candidate output\n", cleanup: "ok" });
    const [sent] = sandbox.requests;
    const root = sent!.filesystem!.readWrite![0]!;
    expect(sent).toMatchObject({ purpose: "evaluation", isolation: "sandboxed", cwd: join(root, "workspace"), scratchDir: join(root, "scratch"), filesystem: { readWrite: [root] }, timeoutMs: 600_000 });
    expect(sent!.network).toEqual({ mode: "allowlist", domains: [], localPorts: [4100], upstreamProxy: "127.0.0.1:7897" });
    expect(sent!.argv).toEqual(["/usr/bin/node", "/repo/apps/cli/dist/cli.js", "run", "--data-dir", join(root, "data"), "--workspace", join(root, "workspace"), "--harness", join(root, "selection.json"), "--sandbox-inherited", "--permission-mode", "full-access", "--input-file", join(root, "task.md"), "--out", join(root, "out"), "--json", "--model", "fake/model"]);
    // Only the allowed variables of this process, plus the model connection from the Host port.
    expect(sent!.env).toEqual({ PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8", LLM_PROVIDER: "fake", FAKE_API_KEY: "sk-test", FAKE_BASE_URL: "http://127.0.0.1:4100", HOME: join(root, "home"), TMPDIR: join(root, "tmp") });
    expect(JSON.parse(seen.selection!)).toEqual({ ...selection, executionDigest: "sha256-pinned" });
    expect(seen).toMatchObject({ task: "fix the bug", copy: "original", artifact: ARTIFACT });
    expect(await readFile(join(workspace, "README.md"), "utf8")).toBe("original");
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("omits the digest when not given and the model flag when no model is named", async () => {
    let written = "";
    const { sandbox, host, evaluation } = service(async (_, argv) => { written = await readFile(argv.harness!, "utf8"); await writeResult(argv.out!, completedResult); return exited(); });
    expect((await evaluation.run(request())).status).toBe("completed");
    expect(JSON.parse(written)).toEqual(selection);
    expect(sandbox.requests[0]!.argv).not.toContain("--model");
    expect(host.models).toEqual([undefined]);
  });

  it("reports the candidate's own failure, a missing result and a malformed one as failed", async () => {
    const failing = service(async (_, argv) => { await writeResult(argv.out!, { ...completedResult, ok: false, status: "failed", exitCode: 1, error: { code: "RUN_FAILED", message: "model error" } }); return exited(1); });
    expect(await failing.evaluation.run(request())).toMatchObject({ status: "failed", error: "RUN_FAILED: model error", result: { status: "failed" } });
    const silent = service(async () => exited(3));
    expect(await silent.evaluation.run(request())).toMatchObject({ status: "failed", error: "The candidate wrote no result (candidate exit code 3)", outputTail: "candidate output\n" });
    const garbled = service(async (_, argv) => { await writeResult(argv.out!, "{not json"); return exited(); });
    expect(await garbled.evaluation.run(request())).toMatchObject({ status: "failed", error: expect.stringContaining("not JSON") });
    const shapeless = service(async (_, argv) => { await writeResult(argv.out!, { status: "completed" }); return exited(); });
    expect(await shapeless.evaluation.run(request())).toMatchObject({ status: "failed", error: expect.stringContaining("does not match") });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("passes timeouts and sandbox refusals through", async () => {
    const timed = service(async () => ({ status: "timed_out", exitCode: null, signal: "SIGKILL", residual: false }));
    expect(await timed.evaluation.run(request({ timeoutMs: 5 }))).toMatchObject({ status: "timed_out", sandbox: { outcome: { status: "timed_out" } }, cleanup: "ok" });
    expect(timed.sandbox.requests[0]!.timeoutMs).toBe(5);
    const refused = service(async () => ({ status: "prepare_failed", reasons: ["needs network.allowlist"] }));
    expect(await refused.evaluation.run(request())).toMatchObject({ status: "failed", error: "The sandbox refused the evaluation: needs network.allowlist" });
  });

  it("terminates the sandbox when the caller aborts", async () => {
    const { sandbox, evaluation } = service(async () => "hang");
    const controller = new AbortController();
    const pending = evaluation.run(request(), controller.signal);
    await new Promise(resolve => setTimeout(resolve, 20));
    controller.abort();
    expect(await pending).toMatchObject({ status: "cancelled", sandbox: { outcome: { status: "cancelled" } }, cleanup: "ok" });
    expect(sandbox.terminated).toBe(1);
    const early = service(async () => exited());
    const aborted = new AbortController(); aborted.abort();
    expect(await early.evaluation.run(request(), aborted.signal)).toMatchObject({ status: "cancelled" });
    expect(early.sandbox.requests).toEqual([]);
  });

  it("fails before the sandbox starts when an artifact or the workspace cannot be copied", async () => {
    const missing = `sha256-${"b".repeat(64)}`;
    const { sandbox, evaluation } = service(async () => exited());
    expect(await evaluation.run(request({ selection: { ...selection, artifactIds: [missing] } }))).toMatchObject({ status: "failed", error: expect.stringContaining(`Cannot copy Harness artifact ${missing}`), cleanup: "ok" });
    expect(await evaluation.run(request({ selection: { ...selection, artifactIds: ["../../etc"] } }))).toMatchObject({ status: "failed", error: "Invalid Harness artifact identity: ../../etc" });
    expect(await evaluation.run(request({ workspace: join(base, "absent") }))).toMatchObject({ status: "failed", error: expect.stringContaining("Cannot copy workspace") });
    expect(sandbox.requests).toEqual([]);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("reports unavailability instead of running", async () => {
    const sandbox = fakeSandbox(async () => exited(), { available: false, reasons: ["An evaluation cannot start inside an inherited sandbox."] });
    expect(await createHarnessEvaluationService({ sandbox }).run(request())).toEqual({ status: "unavailable", reasons: [`This Host does not provide actspace.host.harness-evaluation.`, "An evaluation cannot start inside an inherited sandbox."] });
    expect(sandbox.requests).toEqual([]);
  });

  it("records a failed cleanup without hiding the outcome", async () => {
    const { evaluation } = service(async (_, argv) => { await writeResult(argv.out!, completedResult); await chmod(tempRoot, 0o555); return exited(); });
    const result = await evaluation.run(request());
    expect(result).toMatchObject({ status: "completed", cleanup: { failed: expect.stringContaining("EACCES") } });
  });
});
