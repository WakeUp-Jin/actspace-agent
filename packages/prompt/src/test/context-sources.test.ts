import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { apply, PROMPT_HOST_PORT_ID, type PromptRuntimeService } from "../plugin.js";
import { prepareRuntimePromptSource, prepareUserPromptSource } from "../host-context.js";

it("refreshes changed/deleted AGENTS between turns and keeps Chat outside workspace rules and Skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-rules-"));
  const dataRoot = join(root, "data"); const workspaceRoot = join(root, "work"); const home = join(root, "home");
  await Promise.all([dataRoot, workspaceRoot, home].map(path => mkdir(path)));
  const ctx = new CordisContextClass();
  ctx.provide(PROMPT_HOST_PORT_ID, { workspaceRoot, resolveUserSource: () => prepareUserPromptSource(dataRoot), resolveSource: () => prepareRuntimePromptSource({ dataRoot, workspaceRoot, homeDir: home }) });
  try {
    await writeFile(join(workspaceRoot, "AGENTS.md"), "First rule"); await writeFile(join(dataRoot, "AGENTS.md"), "User rule");
    await ctx.plugin({ inject: [PROMPT_HOST_PORT_ID], apply: inner => apply(inner as never) });
    const prompt = ctx.get("prompt.runtime") as PromptRuntimeService;
    const first = await prompt.resolveForTurn(workspaceRoot, "t1", false);
    await writeFile(join(workspaceRoot, "AGENTS.md"), "Second rule");
    expect(await prompt.resolveForTurn(workspaceRoot, "t1", false)).toBe(first);
    const second = await prompt.resolveForTurn(workspaceRoot, "t2", false);
    expect(second.instructions.map(value => value.content)).toEqual(["User rule", "Second rule"]);
    expect(second.instructions[1]!.contentDigest).not.toBe(first.instructions[1]!.contentDigest);
    await rm(join(workspaceRoot, "AGENTS.md"));
    expect((await prompt.resolveForTurn(workspaceRoot, "t3", false)).instructions.map(value => value.id)).toEqual(["host/user-instructions"]);
    const chat = await prompt.resolveForTurn(workspaceRoot, "t4", true);
    expect(chat.instructions.map(value => value.id)).toEqual(["host/user-instructions"]);
    expect(chat.skills.list()).toEqual([]);
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});
