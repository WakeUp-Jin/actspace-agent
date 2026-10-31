import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setRuntimeV2LoaderForTest } from "../runtime-v2/loader";
import { runV2Command } from "../runtime-v2/run";

beforeEach(() => { setRuntimeV2LoaderForTest(() => import("@actspace/runtime")); });
afterEach(() => { setRuntimeV2LoaderForTest(); });

const temp = (prefix: string) => mkdtemp(join(tmpdir(), `actspace-cli-pinned-${prefix}-`));
let source: string;
let selection: Record<string, unknown> & { executionDigest: string; sharedServices: string[] };

beforeAll(async () => {
  setRuntimeV2LoaderForTest(() => import("@actspace/runtime"));
  source = await temp("source");
  await runV2Command({ input: "seed", workspace: await temp("work"), dataDir: source, permissionMode: "default", outputFormat: "json", mock: true });
  const rows = (await readFile(join(source, "harness-state", "selections.jsonl"), "utf8")).trim().split("\n");
  const record = (JSON.parse(rows.at(-1)!) as { record: { description: Record<string, unknown>; executionDigest: string } }).record;
  selection = { ...record.description, executionDigest: record.executionDigest } as typeof selection;
}, 60_000);

async function run(file: Record<string, unknown> | string, options: { readonly artifacts?: boolean; readonly dataDir?: string } = {}) {
  const dataDir = options.dataDir ?? await temp("data");
  if (options.artifacts !== false && !options.dataDir) await cp(join(source, "harness-artifacts"), join(dataDir, "harness-artifacts"), { recursive: true });
  const harness = join(await temp("file"), "selection.json");
  await writeFile(harness, typeof file === "string" ? file : JSON.stringify(file));
  return runV2Command({ input: "hello", workspace: await temp("work"), dataDir, permissionMode: "default", outputFormat: "json", mock: true, harness });
}

it("boots the pinned selection and reports the Harness that ran", async () => {
  const result = await run(selection);
  expect(result).toMatchObject({ ok: true, harness: { harnessId: "main", revision: 1, executionDigest: selection.executionDigest } });
  const { executionDigest: _, ...withoutDigest } = selection;
  expect((await run(withoutDigest)).harness?.executionDigest).toBe(selection.executionDigest);
}, 60_000);

it("refuses instead of falling back to the built-in Harness", async () => {
  const invalid = { name: "CliError", code: "HARNESS_SELECTION_INVALID", exitCode: 3 };
  await expect(run(selection, { artifacts: false })).rejects.toMatchObject({ ...invalid, message: expect.stringContaining("cannot mount") });
  await expect(run({ ...selection, executionDigest: "0".repeat(64) })).rejects.toMatchObject({ ...invalid, message: expect.stringContaining("execution digest differs") });
  await expect(run({ ...selection, sharedServices: [...selection.sharedServices, "unknown.service"] })).rejects.toMatchObject({ ...invalid, message: expect.stringContaining("shared services") });
  await expect(run("not json")).rejects.toMatchObject(invalid);
  await expect(run({ composition: {} })).rejects.toMatchObject(invalid);
  await expect(run(selection, { dataDir: source })).rejects.toMatchObject({ code: "HARNESS_STATE_EXISTS", exitCode: 2 });
}, 60_000);
