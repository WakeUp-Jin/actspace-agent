/**
 * Skills 管理服务：设置页「Skills」分区的 main 侧实现。
 *
 * - list：复用 agent-core 的 loadSkillRegistry（与主 Agent catalog 同一套发现逻辑），
 *   映射为 renderer 契约 SkillCatalogItem，并叠加两套启停状态：
 *   主 Agent 黑名单（settings.skills.disabled）与 Kairos 白名单（settings.kairos.enabledSkills）。
 * - install：把用户选中的 Skill 目录整体复制到 `<dataRoot>/skills/<name>/`（user 级）。
 * - uninstall：只允许删除 `<dataRoot>/skills/` 下的目录（设置页安装的），
 *   项目目录 / home 目录发现的 Skill 一律不可从这里删。
 *
 * 不 import "electron"（目录选择对话框在 index.ts 的 IPC handler 里做）。
 */
import { cp, readFile, rm } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { loadSkillRegistry, parseSkillFile } from "@actspace/agent-core";
import type {
  SkillCatalogItem,
  SkillInstallResult,
  SkillListResult,
  SkillUninstallResult,
} from "@actspace/shared";

export interface SkillsServiceInput {
  dataRoot: string;
  workspaceRoot: string;
  homeDir?: string;
  disabledForAgent: string[];
  enabledForKairos: string[];
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

/** 设置页可卸载的安装根：`<dataRoot>/skills/`。 */
export function managedSkillsRoot(dataRoot: string): string {
  return join(dataRoot, "skills");
}

export async function listSkills(input: SkillsServiceInput): Promise<SkillListResult> {
  const registry = await loadSkillRegistry({
    dataRoot: input.dataRoot,
    workspaceRoot: input.workspaceRoot,
    homeDir: input.homeDir,
    warn: input.warn,
  });
  const managedRoot = managedSkillsRoot(input.dataRoot) + sep;
  const disabled = new Set(input.disabledForAgent);
  const enabledKairos = new Set(input.enabledForKairos);

  const toItem = (summary: (typeof registry.skills)[number], shadowed: boolean): SkillCatalogItem => ({
    name: summary.name,
    description: summary.description,
    scope: summary.scope,
    source: summary.source,
    location: summary.location,
    directory: summary.directory,
    status: summary.status,
    warning: summary.warning,
    removable: resolve(summary.directory).startsWith(managedRoot),
    enabledForAgent: !disabled.has(summary.name),
    enabledForKairos: enabledKairos.has(summary.name),
    shadowed,
  });

  return {
    items: [
      ...registry.skills.map((s) => toItem(s, false)),
      ...registry.shadowed.map((s) => toItem(s, true)),
    ],
    warnings: registry.warnings,
  };
}

/**
 * 安装：校验 sourceDir 内含合法 SKILL.md 后整目录复制到 `<dataRoot>/skills/<目录名>/`。
 * 同名目录已存在 → 报错（不做静默覆盖，避免误伤用户已装内容）。
 */
export async function installSkillFromDirectory(
  dataRoot: string,
  sourceDir: string,
): Promise<SkillInstallResult> {
  let parsedName: string;
  try {
    const content = await readFile(join(sourceDir, "SKILL.md"), "utf8");
    const parsed = parseSkillFile(content, sourceDir);
    parsedName = parsed.name;
  } catch {
    return { ok: false, error: "所选目录里没有可读取的 SKILL.md，不是有效的 Skill。" };
  }

  const targetDir = join(managedSkillsRoot(dataRoot), basename(sourceDir));
  try {
    await cp(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("EEXIST") || message.toLowerCase().includes("already exists")) {
      return { ok: false, error: `已存在同名 Skill 目录：${basename(sourceDir)}，请先卸载或改名。` };
    }
    return { ok: false, error: `安装失败：${message}` };
  }
  return { ok: true, name: parsedName };
}

/** 卸载：按 Skill 目录路径删除；路径必须位于 `<dataRoot>/skills/` 内。 */
export async function uninstallSkillDirectory(
  dataRoot: string,
  directory: string,
): Promise<SkillUninstallResult> {
  const managedRoot = managedSkillsRoot(dataRoot) + sep;
  const target = resolve(directory);
  if (!target.startsWith(managedRoot) || target === managedRoot.slice(0, -1)) {
    return { ok: false, error: "只能卸载通过设置页安装到用户目录的 Skill。" };
  }
  try {
    await rm(target, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `卸载失败：${message}` };
  }
}
