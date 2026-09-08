import { access, readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const currentTruthFiles = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
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
  "docs/design-docs/agent-plugin-runtime/agent-target-overall-architecture.md",
  "docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-dsh-plugin-assembly-and-agent-startup.md",
  "docs/design-docs/agent-plugin-runtime/agent-target-agent-core.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-core-cordis-services.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-service-definition-provider-consumer.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-profile-bundle-patch-layering.md",
  "docs/design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md",
  "docs/design-docs/frontend/README.md",
  "docs/design-docs/frontend/front-右侧面板与文件渲染规范.md",
  "docs/design-docs/frontend/front-workspace-git-worktree-context.md",
  "docs/design-docs/frontend/front-聊天输入框规范.md",
];

const forbiddenCurrentClaims = [
  { pattern: /(?:docs\/)?design-docs\/v1-legacy(?:\/|\b)/g, message: "仍引用已搬移的 v1 归档路径" },
  { pattern: /(?:actspace-agent|actspace|dist\/cli\.js)\s+chat\b/g, message: "仍提供已退役的 CLI chat 命令示例" },
  { pattern: /`run`\s*\/\s*`chat`/g, message: "仍把 run/chat 并列为当前业务命令" },
  { pattern: /(?:Promise<RuntimeHandle>|RuntimeHandle\.(?:runTurn|run|abort)\s*\()/g, message: "仍提供已删除的 RuntimeHandle API 示例" },
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
  const target = rawTarget.trim();
  const withoutTitle = target.startsWith("<")
    ? target.slice(1, target.indexOf(">"))
    : target.split(/\s+["']/u, 1)[0];
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

export async function checkMarkdownFiles(repoRoot, files, { checkClaims = true } = {}) {
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

    for (const { pattern, message } of checkClaims ? forbiddenCurrentClaims : []) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        failures.push(`${relativePath}:${lineNumber(source, match.index)}: ${message}`);
      }
    }

    const linkPattern = /\[[^\]]*\]\((<[^>]+>(?:\s+["'][^\n]*["'])?|[^)]+)\)/g;
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
      } else if (checkClaims && relative(repoRoot, resolvedTarget).replaceAll("\\", "/").startsWith("docs/archive/v1/")) {
        const line = source.split("\n")[lineNumber(source, match.index) - 1].replace(/\]\([^)]*\)/gu, "]");
        if (!/历史|归档|追溯|旧|v1|legacy|archive/iu.test(line)) {
          failures.push(`${relativePath}:${lineNumber(source, match.index)}: current navigation must label v1 archive links as historical: ${target}`);
        }
      }
    }
  }

  return failures;
}

async function collectDocumentationFiles(repoRoot, directory) {
  const entries = await readdir(resolve(repoRoot, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectDocumentationFiles(repoRoot, path));
    else if (entry.isFile() && /\.(?:md|html)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

export async function checkDocumentationLinks(repoRoot, directories) {
  const failures = [];
  for (const directory of directories) {
    for (const path of await collectDocumentationFiles(repoRoot, directory)) {
      if (path.endsWith(".md")) failures.push(...await checkMarkdownFiles(repoRoot, [path], { checkClaims: false }));
      // Markdown may embed raw HTML assets; HTML prototypes may reference docs.
      const source = await readFile(resolve(repoRoot, path), "utf8");
      for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/gu)) {
        const target = normalizeLinkTarget(match[1]);
        if (!target || target.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(target) || /[{}<>]/u.test(target)) continue;
        try {
          if (!(await exists(resolve(dirname(resolve(repoRoot, path)), decodeURIComponent(target))))) {
            failures.push(`${path}:${lineNumber(source, match.index)}: broken HTML asset/link: ${target}`);
          }
        } catch {
          failures.push(`${path}:${lineNumber(source, match.index)}: invalid encoded HTML asset/link: ${target}`);
        }
      }
    }
  }
  return failures;
}

export async function checkCurrentDocs(repoRoot) {
  const [claims, links] = await Promise.all([
    checkMarkdownFiles(repoRoot, currentTruthFiles),
    checkDocumentationLinks(repoRoot, ["docs/design-docs", "docs/archive", "docs/exec-plans", "docs/exec-runs"]),
  ]);
  return [...new Set([...claims, ...links])];
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
    process.stdout.write(`current docs check passed (${currentTruthFiles.length} truth files; design/archive/plans/runs links and assets)\n`);
  }
}
