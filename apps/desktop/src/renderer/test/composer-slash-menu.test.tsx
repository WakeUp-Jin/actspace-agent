import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { SkillCatalogItem } from "@actspace/shared";
import { useSlashMenu, type SlashMenuOptions } from "../components/composer/SlashMenu";
import { useComposerSkills } from "../components/composer/use-composer-skills";
import { setupBridge } from "./helpers/bridge";

function skill(name: string, overrides: Partial<SkillCatalogItem> = {}): SkillCatalogItem {
  return {
    name,
    description: `${name} 说明`,
    scope: "user",
    source: "user",
    location: `/skills/${name}/SKILL.md`,
    directory: `/skills/${name}`,
    status: "available",
    removable: true,
    enabledForAgent: true,
    shadowed: false,
    ...overrides,
  };
}

function renderSlash(initial: Partial<SlashMenuOptions> = {}) {
  const base: SlashMenuOptions = {
    message: "/",
    inputLocked: false,
    isChatForm: false,
    isStreaming: false,
    skills: [],
    composerRef: createRef<HTMLElement>(),
    inputRef: createRef<HTMLTextAreaElement>(),
    setDraftText: () => {},
    onDraftReplaced: () => {},
  };
  return renderHook((props: Partial<SlashMenuOptions>) => useSlashMenu({ ...base, ...props }), { initialProps: initial });
}

function functionIds(results: ReturnType<typeof useSlashMenu>["results"]) {
  return results.map((result) => result.kind === "function" ? result.item.id : `skill:${result.item.name}`);
}

describe("useSlashMenu", () => {
  it("stays closed while the input is locked", () => {
    const { result } = renderSlash({ inputLocked: true });

    expect(result.current.open).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("hides mode switches while a run is streaming", () => {
    const { result } = renderSlash({ isStreaming: true });

    expect(functionIds(result.current.results)).not.toContain("plan");
    expect(functionIds(result.current.results)).not.toContain("agent");
    expect(functionIds(result.current.results)).toContain("compact");
  });

  it("closes on Escape pressed outside the input", () => {
    const { result } = renderSlash();
    expect(result.current.open).toBe(true);

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(result.current.open).toBe(false);
  });

  it("moves the highlight back to the first result when the results change", () => {
    const { result, rerender } = renderSlash();
    act(() => result.current.move(1));
    expect(functionIds([result.current.active!])).toEqual(["agent"]);

    rerender({ skills: [skill("lint")] });

    expect(functionIds([result.current.active!])).toEqual(["plan"]);
  });

  it("follows the pointer when hovering a result", () => {
    const { result } = renderSlash();
    const third = result.current.results[2]!;

    act(() => result.current.highlight(third));

    expect(result.current.active).toEqual(third);
    expect(result.current.activeOptionId).toBe("composer-slash-function-compact");
  });
});

describe("useComposerSkills", () => {
  it("keeps only enabled, unshadowed, available Skills with project ones first", async () => {
    setupBridge({
      "skills.list": async () => ({
        items: [
          skill("zeta"),
          skill("alpha"),
          skill("project-one", { scope: "project" }),
          skill("off", { enabledForAgent: false }),
          skill("hidden", { shadowed: true }),
          skill("broken", { status: "warning" }),
        ],
        warnings: [],
      }),
    });
    const { result } = renderHook(() => useComposerSkills({ workspaceRoot: "/repo", selected: [] }));

    await act(() => result.current.load());

    expect(result.current.items.map((item) => item.name)).toEqual(["project-one", "alpha", "zeta"]);
  });

  it("loads once per workspace and reloads when the workspace changes", async () => {
    const list = vi.fn(async () => ({ items: [skill("alpha")], warnings: [] }));
    setupBridge({ "skills.list": list });
    const { result, rerender } = renderHook((props: { workspaceRoot: string }) => useComposerSkills({ workspaceRoot: props.workspaceRoot, selected: [] }), {
      initialProps: { workspaceRoot: "/repo-a" },
    });

    await act(() => result.current.load());
    await act(() => result.current.load());
    expect(list).toHaveBeenCalledTimes(1);

    rerender({ workspaceRoot: "/repo-b" });
    await act(() => result.current.load());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("lets a failed load be retried without forcing", async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ items: [skill("alpha")], warnings: [] });
    setupBridge({ "skills.list": list });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useComposerSkills({ workspaceRoot: "/repo", selected: [] }));

    await act(() => result.current.load());
    expect(result.current.error).toBe("加载 Skills 失败。");

    await act(() => result.current.load());
    await waitFor(() => expect(result.current.items.map((item) => item.name)).toEqual(["alpha"]));
    expect(result.current.error).toBeNull();
  });
});
