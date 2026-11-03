import { describe, expect, it, vi } from "vitest";
import { AgentScope } from "@actspace/scope";
import { ContributorRegistry, type PromptContributor } from "@actspace/prompt";
import { HostReadableFiles } from "@actspace/tool-runtime";
import { composeHostReadablePath, createModeContributorActivation } from "./agent-factory-plugin.js";

function contributor(scope: AgentScope, id: string): PromptContributor {
  return { id, ownerPluginId: "test", scopeId: scope.identity.scopeId, kind: "prompt-section", layer: "core", order: 0, criticality: "required", resolve: () => ({ value: id }) };
}

describe("main Agent mode contributors", () => {
  it("replaces overlapping registrations on one AgentScope across Chat and Plan", async () => {
    const scope = new AgentScope("main:test");
    const registry = new ContributorRegistry();
    const resolve = vi.fn(async (key: "chat" | "workspace") => [contributor(scope, "core/identity"), contributor(scope, key)]);
    const activate = createModeContributorActivation(scope, registry, resolve);

    await activate("chat");
    await activate("plan");
    await activate("agent");
    await activate("chat");

    expect(registry.visible(scope).map(item => item.id)).toEqual(["chat", "core/identity"]);
    expect(resolve.mock.calls.map(([key]) => key)).toEqual(["chat", "workspace", "chat"]);
    await scope.dispose();
    expect(registry.visible(scope)).toEqual([]);
  });

  it("restores the prior mode if the next contributor set fails to register", async () => {
    const scope = new AgentScope("main:test");
    const registry = new ContributorRegistry();
    const activate = createModeContributorActivation(scope, registry, async key => key === "chat"
      ? [contributor(scope, "core/identity"), contributor(scope, "chat")]
      : [contributor(scope, "core/identity"), contributor(scope, "workspace"), contributor(scope, "workspace")]);

    await activate("chat");
    await expect(activate("plan")).rejects.toThrow("Duplicate scoped registration workspace");
    expect(registry.visible(scope).map(item => item.id)).toEqual(["chat", "core/identity"]);
    await activate("chat");
    await scope.dispose();
  });
});

describe("host-readable paths", () => {
  it("combines Session transcripts, background Bash logs and the exact-file list", () => {
    const files = new HostReadableFiles();
    files.add("/home/me/.codex/sessions/rollout-1.jsonl");
    const readable = composeHostReadablePath("/data", files);
    expect(readable("/data/sessions-v2/s1/transcript.md")).toBe(true);
    expect(readable("/data/sessions-v2/s1/bash-log/bash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.log")).toBe(true);
    expect(readable("/home/me/.codex/sessions/rollout-1.jsonl")).toBe(true);
    for (const gated of ["/data/sessions-v2/s1/journal.jsonl", "/data/sessions-v2/s1/bash-log", "/data/sessions-v2/s1/bash-log/other.log", "/home/me/.codex/sessions/rollout-2.jsonl", "/home/me/.codex/sessions"]) expect(readable(gated)).toBe(false);
    // Without a data root only the list applies.
    expect(composeHostReadablePath(undefined, files)("/data/sessions-v2/s1/transcript.md")).toBe(false);
    expect(composeHostReadablePath(undefined, files)("/home/me/.codex/sessions/rollout-1.jsonl")).toBe(true);
  });
});
