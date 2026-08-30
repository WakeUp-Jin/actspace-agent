import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const currentTruthFiles = [
  "AGENTS.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY.md",
  "docs/RELIABILITY.md",
  "docs/FRONTEND_VERIFICATION.md",
  "docs/roadmap.md",
  "docs/TODOLIST.md",
  "docs/exec-plans/README.md",
  "docs/design-docs/index.md",
  "docs/design-docs/agent-index.md",
  "docs/design-docs/core-storage-and-observability.md",
  "docs/design-docs/model-context/agent-token-usage-and-context-state.md",
  "docs/design-docs/model-context/agent-multi-provider-llm.md",
  "docs/design-docs/agent-runtime/agent-turn-layers.md",
  "docs/design-docs/agent-runtime/agent-observability-trace-model.md",
  "docs/design-docs/agent-plugin-runtime/README.md",
  "docs/design-docs/agent-plugin-runtime/agent-testing.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md",
  "docs/design-docs/execution-safety/README.md",
  "docs/design-docs/execution-safety/agent-权限设计规则和原则.md",
  "docs/design-docs/collaboration/agent-subagent-runtime.md",
  "docs/design-docs/collaboration/agent-explore-subagent.md",
  "docs/design-docs/tool-system/agent-web-tools.md",
  "docs/design-docs/tool-system/agent-image-generation-tool.md",
  "docs/design-docs/frontend/front-agent-analysis-observability.md",
  "docs/design-docs/frontend/front-右侧面板与文件渲染规范.md",
  "docs/design-docs/frontend/front-workspace-git-worktree-context.md",
  "docs/design-docs/frontend/front-聊天输入框规范.md",
];

const forbiddenCurrentClaims = [
  { pattern: /packages\/agent-runtime(?:\/|\b)/g, message: "仍把单一 packages/agent-runtime 当作当前实现" },
  { pattern: /docs\/design-docs\/agent-runtime\/agent-testing\.md/g, message: "仍链接已失效的测试规范路径" },
  { pattern: /docs\/design-docs\/execution-safety\/agent-(?:bash-policy-allowlist-design|tool-approval-pause-resume|bash工具设计文档)\.md/g, message: "仍把 v1 execution-safety 文档当作当前入口" },
  { pattern: /docs\/design-docs\/model-context\/agent-cache-loss-audit\.md/g, message: "仍把 v1 cache audit 当作当前入口" },
  { pattern: /docs\/exec-plans\/active\/(?:20260711-agent-team|Bash工具和工具权限调度开发计划)/g, message: "仍把已丢弃的 v1 计划登记为 active" },
  { pattern: /<userData>\/sessions\/<sessionId>/g, message: "仍描述 v1 Session 目录" },
  { pattern: /apps\/desktop\/src\/main\/(?:agent-run|desktop-agent-runtime)\.ts/g, message: "仍链接已删除的 Desktop v1 Runtime" },
  { pattern: /apps\/cli\/src\/runtime-adapter\.ts/g, message: "仍链接已删除的 CLI v1 adapter" },
];

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function normalizeLinkTarget(rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, "");
  const withoutTitle = target.split(/\s+["']/u, 1)[0];
  return withoutTitle.split("#", 1)[0].split("?", 1)[0];
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function checkMarkdownFiles(repoRoot, files) {
  const failures = [];

  for (const relativePath of files) {
    const absolutePath = resolve(repoRoot, relativePath);
    let source;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      failures.push(`${relativePath}: missing current-truth file`);
      continue;
    }

    for (const { pattern, message } of forbiddenCurrentClaims) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        failures.push(`${relativePath}:${lineNumber(source, match.index)}: ${message}`);
      }
    }

    const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of source.matchAll(linkPattern)) {
      const target = normalizeLinkTarget(match[1]);
      if (!target || target.startsWith("#") || target.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(target)) continue;
      if (target.includes("*") || target.includes("{") || target.includes("<")) continue;

      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(target);
      } catch {
        failures.push(`${relativePath}:${lineNumber(source, match.index)}: invalid encoded Markdown link: ${target}`);
        continue;
      }

      const resolvedTarget = resolve(dirname(absolutePath), decodedTarget);
      if (!(await exists(resolvedTarget))) {
        failures.push(`${relativePath}:${lineNumber(source, match.index)}: broken Markdown link: ${target}`);
      }
    }
  }

  return failures;
}

export async function checkCurrentDocs(repoRoot) {
  return checkMarkdownFiles(repoRoot, currentTruthFiles);
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(scriptPath).href;

if (isMain) {
  const repoRoot = process.env.ACTSPACE_CURRENT_DOCS_ROOT
    ? resolve(process.env.ACTSPACE_CURRENT_DOCS_ROOT)
    : resolve(dirname(scriptPath), "..");
  const failures = await checkCurrentDocs(repoRoot);
  if (failures.length > 0) {
    process.stderr.write(`current docs check failed (${failures.length}):\n${failures.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`current docs check passed (${currentTruthFiles.length} truth files)\n`);
  }
}
