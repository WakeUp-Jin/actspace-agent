import { useEffect, useState } from "react";
import type { GrantSuggestion } from "@actspace/shared/runtime-v2";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

export function grantScopeLabel(grant: Pick<GrantSuggestion, "selector" | "access">): string {
  const selector = grant.selector;
  const path = selector.kind === "exact" ? selector.canonicalPath : selector.kind === "subtree" ? selector.canonicalRoot : selector.prefix.join(" ");
  return `${selector.kind === "subtree" ? "目录及子项" : "精确路径"} · ${grant.access === "write" ? "写入" : "读取"} · ${path} · 本会话`;
}

/** Only Runtime-owned suggestions can be selected. Exact stays the default until an explicit choice. */
export function FileGrantScope({ suggestions, selectedId, disabled, onChoose }: {
  suggestions: readonly GrantSuggestion[]; selectedId?: string; disabled: boolean; onChoose: (suggestion: GrantSuggestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const identity = suggestions.map(item => item.suggestionId).join(":");
  useEffect(() => { setExpanded(false); }, [identity]);
  if (!suggestions.some(item => item.selector.kind === "subtree")) return null;
  return <>
    <Button variant="ghost" size="xs" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>授权范围</Button>
    {expanded ? <Select value={selectedId ?? ""} disabled={disabled} ariaLabel="本会话文件授权范围" className="max-w-[min(320px,70vw)]" contentClassName="w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width)" wrapOptions options={suggestions.map(item => ({ value: item.suggestionId, label: grantScopeLabel(item) }))} onValueChange={id => {
      const suggestion = suggestions.find(item => item.suggestionId === id);
      if (suggestion) onChoose(suggestion);
    }} /> : null}
  </>;
}
