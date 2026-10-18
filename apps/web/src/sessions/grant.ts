import type { GrantSuggestion } from "@actspace/shared/runtime-v2";

/** 与桌面端 getCommandPrefixGrant 同一规则：前缀由后端给出，前端不从命令文本推导授权。 */
export function getCommandPrefixGrant(suggestion: GrantSuggestion): string | null {
  const selector = suggestion.selector;
  return selector.kind === "command_prefix" && selector.prefix.length > 0
    && selector.prefix.every(token => typeof token === "string" && token.length > 0)
    ? selector.prefix.join(" ") : null;
}

/** 第一个命令前缀授权建议；没有就不显示「本会话允许」。 */
export function commandPrefixGrant(suggestions: readonly GrantSuggestion[]): { readonly suggestion: GrantSuggestion; readonly prefix: string } | null {
  for (const suggestion of suggestions) {
    const prefix = getCommandPrefixGrant(suggestion);
    if (prefix !== null) return { suggestion, prefix };
  }
  return null;
}
