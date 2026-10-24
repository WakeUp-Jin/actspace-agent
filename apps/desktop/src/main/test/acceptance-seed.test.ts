// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { seedSettings } from "../../../../../scripts/acceptance/agent-refactor/seed-settings";

it("seeds two effective models idempotently and binds purposes through the current service", async () => {
  const root = await mkdtemp(join(tmpdir(), "acceptance-seed-"));
  try {
    const first = await seedSettings(root, "http://127.0.0.1:12345/v1");
    const second = await seedSettings(root, "http://127.0.0.1:12346/v1");
    expect(second.connections).toHaveLength(1);
    expect(second.connections[0]!.connectionId).toBe(first.connections[0]!.connectionId);
    expect(second.connections[0]!.models.map(model => model.apiModel)).toEqual(["fixture-alternate", "fixture-main"]);
    expect(second.connections[0]!.models[0]!.effective).toMatchObject({ contextWindow: 32768, maxOutput: 4096, input: ["text", "image"] });
    expect(second.purposes.chat.model).toBe(second.purposes.explore.model);
    expect(second.purposes.chat.model).toBe(second.purposes.utility.model);
    expect(await readFile(join(root, "settings.json"), "utf8")).not.toContain("synthetic-acceptance-credential");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("refuses a non-fixture profile without loading or changing its files", async () => {
  const root = await mkdtemp(join(tmpdir(), "acceptance-seed-"));
  try {
    await writeFile(join(root, "settings.json"), "not fixture data");
    await expect(seedSettings(root, "http://localhost:12345/v1")).rejects.toThrow("non-fixture profile");
    expect(await readFile(join(root, "settings.json"), "utf8")).toBe("not fixture data");
  } finally { await rm(root, { recursive: true, force: true }); }
});
