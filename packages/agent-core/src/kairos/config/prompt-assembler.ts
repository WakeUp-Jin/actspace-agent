import type { KairosConfig } from "./loader";

export const CONFIG_TIPS_TOKEN_BUDGET = 600;
export const TOKEN_CHARS_PER_UNIT = 3;

/**
 * 把 KairosConfig 拼成一段"人话"的配置提示块，
 * 用于 system prompt [3] 段。不允许把原始 JSON 注入 prompt。
 *
 * 截尾策略：超出 ~600 token 时按 paths 列表尾部截断，并加"另有 N 条 …"。
 * 这保证 prompt 不会因为用户加 50 个 watch 路径而失控。
 */
export function buildConfigTipsBlock(config: KairosConfig): string {
  const maxChars = CONFIG_TIPS_TOKEN_BUDGET * TOKEN_CHARS_PER_UNIT;
  const lines: string[] = [];
  lines.push("## 配置提示");
  lines.push("");
  lines.push(`[preferences] ${config.preferences.tip}`);

  const pathsBlock = buildPathsBlock(config);
  lines.push(...pathsBlock);

  lines.push(`[blocklist] ${config.blocklist.tip}`);

  const text = lines.join("\n");
  if (text.length <= maxChars) return text;

  // 超长 → 重建，路径列表只保留头部，附加"另有 N 条"
  return rebuildWithTruncation(config, maxChars);
}

function buildPathsBlock(config: KairosConfig): string[] {
  const block: string[] = [];
  if (config.paths.paths.length === 0) {
    block.push(`[paths] ${config.paths.tip}（暂无配置路径）`);
    return block;
  }
  block.push(`[paths] ${config.paths.tip}：`);
  for (const item of config.paths.paths) {
    const tip = item.tip ?? deriveTipFromPath(item.path);
    block.push(`  - ${item.path}  → ${tip}`);
  }
  return block;
}

function rebuildWithTruncation(config: KairosConfig, maxChars: number): string {
  const header = [
    "## 配置提示",
    "",
    `[preferences] ${config.preferences.tip}`,
  ];
  const blocklistLine = `[blocklist] ${config.blocklist.tip}`;

  const allPaths = config.paths.paths;
  const tryWith = (count: number): { text: string; truncated: boolean } => {
    const visible = allPaths.slice(0, count);
    const rest = allPaths.length - count;
    const block: string[] = [];
    block.push(`[paths] ${config.paths.tip}：`);
    for (const item of visible) {
      const tip = item.tip ?? deriveTipFromPath(item.path);
      block.push(`  - ${item.path}  → ${tip}`);
    }
    if (rest > 0) {
      block.push(`  - …另有 ${rest} 条已省略`);
    }
    const text = [...header, ...block, blocklistLine].join("\n");
    return { text, truncated: rest > 0 };
  };

  // 二分找出"恰好不超 maxChars 的最大 count"
  let lo = 0;
  let hi = allPaths.length;
  let chosen = tryWith(0);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cand = tryWith(mid);
    if (cand.text.length <= maxChars) {
      chosen = cand;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return chosen.text;
}

function deriveTipFromPath(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}
