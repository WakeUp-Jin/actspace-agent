/**
 * 插件（Plugins）与 Skill 管理的 IPC 共享契约。
 *
 * 术语约定（docs/design-docs/agent-plugins-fs-watch.md）：
 * - 插件 = 独立二进制进程（如 fs-watch），main 负责安装 / spawn / 守护 / 退出；
 * - Skill = 知识型能力目录（SKILL.md + references/），设置页可视化安装 / 启停。
 * 两者在设置页是两个分区；fs-watch 的输出恰好落在同名 Skill 的 references/ 下。
 */

// ─── fs-watch 插件 ───

export type FsWatchRunState = "not_installed" | "stopped" | "running" | "error";

export interface FsWatchStatus {
  /** 二进制是否已安装到 <dataRoot>/plugins/fs-watch/bin/fs-watch。 */
  installed: boolean;
  /** 安装时通过 `--version` 探测到的版本。 */
  binaryVersion?: string;
  /** settings.json 中的总开关（用户意图）。 */
  enabled: boolean;
  /** 实际运行状态（进程 + 心跳综合判定）。 */
  runState: FsWatchRunState;
  /** state.json 的 lastHeartbeatAt（RFC3339）；未读到则缺省。 */
  lastHeartbeatAt?: string;
  /** 心跳距今 < 90s。 */
  heartbeatFresh: boolean;
  /** 当日事件量超限熔断标记（来自 state.json）。 */
  overflow: boolean;
  /** 守护重启计数（进入 error 后停止重试）。 */
  restartCount: number;
  /** runState = error 时的原因说明。 */
  lastError?: string;
  /** 事件输出目录（Skill references），供 UI 展示。 */
  outDir: string;
}

export interface FsWatchConfigView {
  /** 被监听目录（绝对路径）。 */
  roots: string[];
  excludeNames: string[];
  excludeHidden: boolean;
  debounceMs: number;
  retentionDays: number;
}

export type FsWatchConfigUpdateInput = Partial<FsWatchConfigView>;

export type FsWatchSetEnabledInput = { enabled: boolean };

export type FsWatchInstallResult = {
  ok: boolean;
  canceled?: boolean;
  binaryVersion?: string;
  error?: string;
};

export type FsWatchPickRootResult = {
  canceled: boolean;
  path?: string;
};

export type FsWatchActionResult = {
  ok: boolean;
  error?: string;
};

// ─── browser-bridge 插件 ───

export type BrowserBridgeRunState =
  | "not_installed"
  | "host_not_installed"
  | "extension_offline"
  | "ready"
  | "error";

export interface BrowserBridgeDoctorCheck {
  name: string;
  status: string;
  backend?: string;
  detail: string;
}

export interface BrowserBridgeStatus {
  /** `abb` 是否已安装到 <dataRoot>/plugins/browser-bridge/bin/abb。 */
  installed: boolean;
  /** 本机安装后的 `abb` 路径；未安装时仍返回约定路径，便于 UI 提示。 */
  abbPath: string;
  /** actspace-plugins 中 Chrome extension 源目录；需要用户在 chrome://extensions 手动 Load unpacked。 */
  extensionDir?: string;
  /** `abb doctor --json` 的综合状态。 */
  runState: BrowserBridgeRunState;
  doctorSummary?: string;
  doctorChecks: BrowserBridgeDoctorCheck[];
  /** `abb capabilities --json` 的原始 JSON；UI 仅作为调试/展开信息展示。 */
  capabilitiesJson?: string;
  lastError?: string;
}

export type BrowserBridgeInstallResult = {
  ok: boolean;
  abbPath?: string;
  extensionDir?: string;
  error?: string;
};

export type BrowserBridgeActionResult = {
  ok: boolean;
  error?: string;
};

// ─── Skill 管理 ───

export type SkillCatalogScope = "project" | "user";

export interface SkillCatalogItem {
  name: string;
  description: string;
  scope: SkillCatalogScope;
  /** 发现来源目录生态（.actspace / .agents / .claude / userData）。 */
  source: string;
  /** SKILL.md 绝对路径。 */
  location: string;
  /** Skill 目录绝对路径。 */
  directory: string;
  status: "available" | "warning";
  warning?: string;
  /** 位于 <dataRoot>/skills/ 下（设置页安装的），允许卸载。 */
  removable: boolean;
  /** 主 Agent 是否启用（= 不在 skills.disabled 黑名单）。 */
  enabledForAgent: boolean;
  /** Kairos 是否启用（= 在 kairos.enabledSkills 白名单）。 */
  enabledForKairos: boolean;
  /** 同名 Skill 被更高优先级来源遮蔽（列表中默认隐藏）。 */
  shadowed: boolean;
}

export interface SkillListResult {
  items: SkillCatalogItem[];
  warnings: string[];
}

export type SkillInstallResult = {
  ok: boolean;
  canceled?: boolean;
  /** 安装成功时的 Skill name。 */
  name?: string;
  error?: string;
};

export type SkillUninstallInput = {
  /** Skill 目录绝对路径（列表项的 directory 字段）；必须位于 <dataRoot>/skills/ 内。 */
  directory: string;
};

export type SkillUninstallResult = {
  ok: boolean;
  error?: string;
};
