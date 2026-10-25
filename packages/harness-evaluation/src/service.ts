import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxResult, SandboxService } from "@actspace/sandbox/types";
import { HARNESS_EVALUATION_HOST_PORT_ID, type HarnessEvaluationCliResult, type HarnessEvaluationHostPort, type HarnessEvaluationOutcome, type HarnessEvaluationRequest, type HarnessEvaluationService } from "./types.js";

export const DEFAULT_EVALUATION_TIMEOUT_MS = 10 * 60_000;
const OUTPUT_TAIL_CHARS = 8_000;
const ARTIFACT_ID = /^sha256-[a-f0-9]{64}$/;
/** The only variables of this process the candidate sees; the model connection comes from the Host port. */
const INHERITED_VARIABLES = ["PATH", "LANG", "LC_ALL"] as const;

export type HarnessEvaluationServiceOptions = {
  readonly sandbox: SandboxService;
  readonly host?: HarnessEvaluationHostPort;
  readonly env?: NodeJS.ProcessEnv;
  /** Parent of the per-evaluation temp roots (default: the OS temp dir). */
  readonly tempRoot?: string;
};
type Outcome = Omit<HarnessEvaluationOutcome, "cleanup">;

/**
 * One evaluation: a temp root holds the candidate's data, workspace copy and output; the candidate CLI runs inside the
 * evaluation sandbox with write access to that root only, and the root is removed afterwards.
 */
export function createHarnessEvaluationService(options: HarnessEvaluationServiceOptions): HarnessEvaluationService {
  const status = async () => {
    const reasons: string[] = [];
    if (!options.host) reasons.push(`This Host does not provide ${HARNESS_EVALUATION_HOST_PORT_ID}.`);
    const sandbox = await options.sandbox.status("evaluation");
    if (!sandbox.available) reasons.push(...sandbox.reasons);
    return { available: reasons.length === 0, reasons };
  };
  return Object.freeze({
    status,
    async run(request: HarnessEvaluationRequest, signal?: AbortSignal) {
      const ready = await status();
      if (!ready.available || !options.host) return { status: "unavailable" as const, reasons: ready.reasons };
      const root = await realpath(await mkdtemp(join(options.tempRoot ?? tmpdir(), "actspace-evaluation-")));
      let outcome: Outcome;
      try { outcome = await evaluate(root, request, options.host, options, signal); }
      catch (error) { outcome = { status: "failed", outputTail: "", error: message(error) }; }
      const cleanup = await rm(root, { recursive: true, force: true }).then(() => "ok" as const, (error: unknown) => ({ failed: message(error) }));
      return { ...outcome, cleanup };
    },
  });
}

async function evaluate(root: string, request: HarnessEvaluationRequest, host: HarnessEvaluationHostPort, options: HarnessEvaluationServiceOptions, signal: AbortSignal | undefined): Promise<Outcome> {
  const dirs = { data: join(root, "data"), workspace: join(root, "workspace"), out: join(root, "out"), tmp: join(root, "tmp"), scratch: join(root, "scratch"), home: join(root, "home") };
  for (const dir of [dirs.data, dirs.tmp, dirs.scratch, dirs.home]) await mkdir(dir);
  for (const id of request.selection.artifactIds) {
    if (!ARTIFACT_ID.test(id)) throw new Error(`Invalid Harness artifact identity: ${id}`);
    await cp(join(host.artifactRoot, id), join(dirs.data, "harness-artifacts", id), { recursive: true, errorOnExist: true, force: false })
      .catch((error: unknown) => { throw new Error(`Cannot copy Harness artifact ${id} from ${host.artifactRoot}: ${message(error)}`); });
  }
  await cp(request.workspace, dirs.workspace, { recursive: true, verbatimSymlinks: true })
    .catch((error: unknown) => { throw new Error(`Cannot copy workspace ${request.workspace}: ${message(error)}`); });
  const selectionFile = join(root, "selection.json");
  const taskFile = join(root, "task.md");
  await writeFile(selectionFile, JSON.stringify({ ...request.selection, ...(request.executionDigest === undefined ? {} : { executionDigest: request.executionDigest }) }));
  await writeFile(taskFile, request.task.input);
  const model = await host.modelEnvironment(request.task.model);
  if (signal?.aborted) return { status: "cancelled", outputTail: "" };

  const source = options.env ?? process.env;
  const inherited = Object.fromEntries(INHERITED_VARIABLES.flatMap(name => source[name] === undefined ? [] : [[name, source[name]]]));
  const execution = options.sandbox.run({
    purpose: "evaluation",
    isolation: "sandboxed",
    argv: [...host.launcher, "run", "--data-dir", dirs.data, "--workspace", dirs.workspace, "--harness", selectionFile, "--sandbox-inherited", "--permission-mode", "full-access", "--input-file", taskFile, "--out", dirs.out, "--json", ...(request.task.model === undefined ? [] : ["--model", request.task.model])],
    cwd: dirs.workspace,
    env: { ...inherited, ...model.env, HOME: dirs.home, TMPDIR: dirs.tmp },
    scratchDir: dirs.scratch,
    filesystem: { readWrite: [root] },
    network: { mode: "allowlist", domains: model.domains, ...(model.localPorts?.length ? { localPorts: model.localPorts } : {}), ...(model.upstreamProxy === undefined ? {} : { upstreamProxy: model.upstreamProxy }) },
    timeoutMs: request.timeoutMs ?? DEFAULT_EVALUATION_TIMEOUT_MS,
  });
  let outputTail = "";
  execution.onOutput(chunk => { outputTail = (outputTail + chunk.text).slice(-OUTPUT_TAIL_CHARS); });
  const abort = () => execution.terminate();
  signal?.addEventListener("abort", abort, { once: true });
  let sandbox: SandboxResult;
  try { sandbox = await execution.result; }
  finally { signal?.removeEventListener("abort", abort); }

  const { outcome } = sandbox;
  if (outcome.status === "timed_out" || outcome.status === "cancelled") return { status: outcome.status, sandbox, outputTail };
  if (outcome.status === "prepare_failed") return { status: "failed", sandbox, outputTail, error: `The sandbox refused the evaluation: ${outcome.reasons.join("; ")}` };
  const result = await readResult(join(dirs.out, "result.json"));
  if (typeof result === "string") return { status: "failed", sandbox, outputTail, error: `${result} (candidate exit code ${outcome.exitCode ?? outcome.signal})` };
  if (result.status === "completed" && result.ok) return { status: "completed", result, sandbox, outputTail };
  return { status: "failed", result, sandbox, outputTail, error: result.error ? `${result.error.code}: ${result.error.message}` : `Candidate run ended as ${result.status}` };
}

/** The candidate wrote this file, so only its shape is trusted, not its content. */
async function readResult(path: string): Promise<HarnessEvaluationCliResult | string> {
  let value: unknown;
  try { value = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "The candidate wrote no result" : `The candidate result is not JSON: ${message(error)}`; }
  const result = value as Partial<HarnessEvaluationCliResult> | null;
  if (result === null || typeof result !== "object" || result.schemaVersion !== 1 || typeof result.ok !== "boolean" || typeof result.status !== "string" || typeof result.exitCode !== "number" || typeof result.finalText !== "string")
    return "The candidate result does not match the CLI result schema";
  return result as HarnessEvaluationCliResult;
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
