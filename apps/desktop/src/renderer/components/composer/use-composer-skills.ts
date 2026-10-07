import { useRef, useState } from "react";
import type { SkillCatalogItem } from "@actspace/shared";
import { skillsApi } from "../../api/skills";

export type ComposerSkillsOptions = {
  readonly workspaceRoot: string | null | undefined;
  readonly selected: readonly string[];
  readonly onSelectedChange?: (skills: string[]) => void;
};

/**
 * 09 T28：斜杠菜单和 `+` 面板共用的 Skills 列表。同一工作区只拉一次（失败后允许重拉），
 * 只留给 Agent 启用、没被遮蔽、可用的；项目级排在用户级前面。晚到的旧请求结果丢弃。
 */
export function useComposerSkills({ workspaceRoot, selected, onSelectedChange }: ComposerSkillsOptions) {
  const [items, setItems] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedWorkspaceRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  async function load(forceReload = false) {
    const workspaceKey = workspaceRoot ?? "__default__";
    if (!forceReload && loadedWorkspaceRef.current === workspaceKey) return;
    loadedWorkspaceRef.current = workspaceKey;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await skillsApi.list({ workspaceRoot: workspaceRoot ?? undefined });
      if (requestRef.current !== requestId) return;
      setItems(result.items
        .filter((skill) => skill.enabledForAgent && !skill.shadowed && skill.status === "available")
        .sort((left, right) => {
          if (left.scope !== right.scope) return left.scope === "project" ? -1 : 1;
          return left.name.localeCompare(right.name);
        }));
    } catch (loadError) {
      if (requestRef.current !== requestId) return;
      loadedWorkspaceRef.current = null;
      console.error("Failed to list Skills", loadError);
      setError("加载 Skills 失败。");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }

  function toggle(name: string) {
    onSelectedChange?.(
      selected.includes(name)
        ? selected.filter((skill) => skill !== name)
        : [...selected, name],
    );
  }

  return { items, loading, error, load, toggle };
}
