import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MODEL_LIST } from "@actspace/shared";
import { contextUsageDisplay } from "../components/composer/ComposerStatusRow";
import { composerLocalRunTarget } from "../components/composer/composer-run-context";
import { composerSendOptions } from "../components/composer/use-composer-send";
import { useComposerModel, type ComposerModelSource } from "../components/composer/use-composer-model";

describe("composerSendOptions", () => {
  const base = { model: MODEL_LIST[0]!.id, mode: "agent" as const, selectedSkills: [] };

  it("sends the reasoning effort only while thinking is on", () => {
    expect(composerSendOptions({ ...base, runtimeOptions: { thinkingEnabled: false, reasoningEffort: "high" } })).not.toHaveProperty("reasoningEffort");
    expect(composerSendOptions({ ...base, runtimeOptions: { thinkingEnabled: true, reasoningEffort: "high" } }).reasoningEffort).toBe("high");
  });
});

describe("contextUsageDisplay", () => {
  it("turns the ring warning at 75% and danger at 90%", () => {
    const at = (percentUsed: number) => contextUsageDisplay({ totalTokens: 1, maxTokens: 100, percentUsed, buckets: [] }).ringColor;

    expect(at(74)).toBe("var(--act-color-text-faint)");
    expect(at(75)).toBe("var(--act-color-warning)");
    expect(at(90)).toBe("var(--act-color-danger)");
  });
});

describe("composerLocalRunTarget", () => {
  const workspaces = [{ value: "/a", label: "alpha" }, { value: "/b", label: "beta" }];

  it("falls back to the first workspace, then to 「工作区」", () => {
    const label = (workspaceOptions: typeof workspaces, selectedWorkspaceRoot?: string) =>
      composerLocalRunTarget({ workspaceOptions, selectedWorkspaceRoot, newWorktree: { enabled: true } }).workspaceLabel;

    expect(label(workspaces, "/b")).toBe("beta");
    expect(label(workspaces, "/missing")).toBe("alpha");
    expect(label([], undefined)).toBe("工作区");
  });
});

describe("useComposerModel", () => {
  it("stops following the default model once the user picked one", () => {
    const [first, second, third] = MODEL_LIST.map((spec) => spec.id);
    const { result, rerender } = renderHook((props: Partial<ComposerModelSource>) => useComposerModel({
      target: { kind: "local" },
      sessionId: null,
      remoteReady: true,
      selectedSkills: [],
      ...props,
    }), { initialProps: { defaultModelId: first } });

    rerender({ defaultModelId: second });
    expect(result.current.selectedModelId).toBe(second);

    act(() => result.current.selectModel(first!));
    rerender({ defaultModelId: third });
    expect(result.current.selectedModelId).toBe(first);
  });
});
