/**
 * FsWatchService —— fs-watch 插件的 main 进程生命周期管理。
 *
 * 职责（docs/design-docs/agent-plugins-fs-watch.md）：
 * 1. 安装：用户选中二进制 → 复制到 `<dataRoot>/plugins/fs-watch/bin/fs-watch` +
 *    chmod 755 + `--version` 验证。
 * 2. Skill 物化：`<dataRoot>/skills/fs-watch/SKILL.md`（模板内嵌在本文件，
 *    是 actspace 侧的唯一真相；插件仓库 skill/ 副本只服务非 actspace 使用者）。
 * 3. 运行：spawn `bin --config config.json`；stdout/stderr 转发到注入的 logger。
 * 4. 守护：非期望退出按指数退避重启（5s 起 ×3），10 分钟内超 5 次 → error 停止重试。
 * 5. 状态：进程存活 + `state.json` 心跳（< 90s 为 fresh）综合成 FsWatchStatus。
 * 6. 配置：settings 页读写 config.json；outDir 永远由本服务强制指向本机 Skill
 *    references（防止旧配置/手改把输出写到别处）。
 *
 * 不 import "electron"，所有环境依赖注入，保证可单测。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  FsWatchActionResult,
  FsWatchConfigUpdateInput,
  FsWatchConfigView,
  FsWatchInstallResult,
  FsWatchRunState,
  FsWatchStatus,
} from "@actspace/shared";

/** 心跳新鲜度窗口（契约：3 个心跳周期 = 90s）。 */
export const HEARTBEAT_FRESH_MS = 90_000;
/** 守护退避序列（ms）；超出次数上限后进入 error。 */
export const RESTART_BACKOFF_MS = [5_000, 15_000, 45_000, 135_000, 405_000];
/** 10 分钟窗口内允许的最大重启次数。 */
export const MAX_RESTARTS_IN_WINDOW = 5;
export const RESTART_WINDOW_MS = 10 * 60 * 1000;
/** 停止时 SIGTERM → SIGKILL 的等待时间。 */
const STOP_GRACE_MS = 2_000;
const VERSION_PROBE_TIMEOUT_MS = 3_000;

/** 与插件契约一致的默认排除名单（同 Kairos DEFAULT_WATCH_EXCLUDE）。 */
export const FS_WATCH_DEFAULT_EXCLUDES = [
  ".git",
  "node_modules",
  ".DS_Store",
  ".cache",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "target",
];

export const FS_WATCH_SKILL_NAME = "fs-watch";

/**
 * Skill 模板（actspace 侧真相）。物化到 `<dataRoot>/skills/fs-watch/SKILL.md`；
 * 内容必须与设计文档的「SKILL.md 内容要点」保持一致。
 */
const FS_WATCH_SKILL_MD = `---
name: fs-watch
description: 本机文件监听插件的输出读取指南。当你需要知道被监听目录里哪些文件被创建、修改、删除或重命名（含具体时间与次数）时使用；也用于回答「某目录最近发生了什么变化」。读取前必须先检查 references/watch-log/state.json 心跳确认插件存活。
---

# fs-watch 文件监听

一个独立运行的二进制插件在持续监听若干本机目录，把文件变化事件写到本 Skill 的 \`references/watch-log/\` 下。你不需要（也不应该）自己启动或停止它——只负责读取输出。

## 使用步骤（每次都要做）

1. **先查心跳**：读 \`references/watch-log/state.json\`。
   - \`lastHeartbeatAt\` 距当前时间 **< 90 秒** → 插件存活，数据可信。
   - 超过 90 秒 → 插件已停止，事件流从心跳时间起不再更新；回答时必须说明数据截止时间。
   - \`overflow: true\` → 当日事件量超限已熔断，当天记录不完整，必须提醒用户。
2. **再读事件**：当天事件在 \`references/watch-log/<YYYY-MM>/<YYYY-MM-DD>.jsonl\`（按本机时区）。历史日期同理。每行一条 JSON：

\`\`\`json
{ "v": 1, "ts": "2026-07-03T16:20:01.123+08:00", "root": "/abs/watched-dir",
  "kind": "created", "path": "docs/foo.md", "oldPath": null, "isDir": false }
\`\`\`

- \`kind\`：\`created\` / \`modified\` / \`removed\` / \`renamed\`（\`renamed\` 时 \`oldPath\` 是旧路径）。
- \`path\` 是相对 \`root\` 的路径；绝对路径 = \`root\` + \`/\` + \`path\`。
- 行按时间递增追加；同一文件 500ms 内的连续变化已合并为一条。

## 注意

- 这里只有**路径级**事件，没有文件内容 diff；要看内容变化请直接 read 对应文件。
- 文件只保留最近 14 天；更早的已被自动清理。
- \`state.json\` 里的 \`roots\` 是当前实际监听的目录列表；用户问到未在列表中的目录时，说明该目录未被监听。
`;

// ─── 纯函数（可单测） ───

export function isHeartbeatFresh(lastHeartbeatAt: string | undefined, now: Date): boolean {
  if (!lastHeartbeatAt) return false;
  const ts = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(ts)) return false;
  return now.getTime() - ts < HEARTBEAT_FRESH_MS;
}

/** 第 n 次重启（从 0 计）的退避延迟；超出序列返回 undefined（不再重启）。 */
export function restartDelayMs(restartIndex: number): number | undefined {
  return RESTART_BACKOFF_MS[restartIndex];
}

/** 滑动窗口内的重启时间戳过滤；返回仍在窗口内的时间戳。 */
export function pruneRestartWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t < RESTART_WINDOW_MS);
}

export interface FsWatchPluginConfig {
  version: 1;
  roots: { path: string }[];
  outDir: string;
  excludeNames: string[];
  excludeHidden: boolean;
  debounceMs: number;
  retentionDays: number;
}

export function defaultFsWatchConfig(outDir: string, defaultRoot: string | undefined): FsWatchPluginConfig {
  return {
    version: 1,
    roots: defaultRoot ? [{ path: defaultRoot }] : [],
    outDir,
    excludeNames: [...FS_WATCH_DEFAULT_EXCLUDES],
    excludeHidden: true,
    debounceMs: 500,
    retentionDays: 14,
  };
}

/** 归一化磁盘上的 config：outDir 强制覆写、字段回默认。 */
export function normalizeFsWatchConfig(
  raw: unknown,
  outDir: string,
  defaultRoot: string | undefined,
): FsWatchPluginConfig {
  const fallback = defaultFsWatchConfig(outDir, defaultRoot);
  if (typeof raw !== "object" || raw === null) return fallback;
  const obj = raw as Record<string, unknown>;
  const roots = Array.isArray(obj.roots)
    ? obj.roots
        .map((entry) => (typeof entry === "object" && entry !== null ? (entry as { path?: unknown }).path : undefined))
        .filter((path): path is string => typeof path === "string" && path.trim().length > 0)
        .map((path) => ({ path }))
    : fallback.roots;
  const debounceMs = typeof obj.debounceMs === "number" && obj.debounceMs >= 1 && obj.debounceMs <= 60_000
    ? Math.floor(obj.debounceMs)
    : fallback.debounceMs;
  const retentionDays = typeof obj.retentionDays === "number" && obj.retentionDays >= 1 && obj.retentionDays <= 365
    ? Math.floor(obj.retentionDays)
    : fallback.retentionDays;
  return {
    version: 1,
    roots,
    outDir,
    excludeNames: Array.isArray(obj.excludeNames)
      ? obj.excludeNames.filter((name): name is string => typeof name === "string")
      : fallback.excludeNames,
    excludeHidden: typeof obj.excludeHidden === "boolean" ? obj.excludeHidden : fallback.excludeHidden,
    debounceMs,
    retentionDays,
  };
}

// ─── 服务 ───

interface StateFileShape {
  lastHeartbeatAt?: string;
  overflow?: boolean;
}

export interface FsWatchServiceOptions {
  dataRoot: string;
  /** 首次生成 config.json 时的默认监听目录（Kairos workspace）；可缺省。 */
  defaultWatchRoot?: string;
  /** settings.json 中总开关的读取器。 */
  isEnabled: () => boolean;
  log?: (message: string, details?: Record<string, unknown>) => void;
}

export class FsWatchService {
  private readonly dataRoot: string;
  private readonly defaultWatchRoot?: string;
  private readonly isEnabled: () => boolean;
  private readonly log: (message: string, details?: Record<string, unknown>) => void;

  private child: ChildProcess | undefined;
  private desiredRunning = false;
  private restartTimestamps: number[] = [];
  private restartTimer: NodeJS.Timeout | undefined;
  private restartCount = 0;
  private lastError: string | undefined;
  private errored = false;
  private cachedVersion: string | undefined;

  constructor(options: FsWatchServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.defaultWatchRoot = options.defaultWatchRoot;
    this.isEnabled = options.isEnabled;
    this.log = options.log ?? (() => {});
  }

  // 路径布局
  get pluginRoot(): string {
    return join(this.dataRoot, "plugins", "fs-watch");
  }
  get binPath(): string {
    return join(this.pluginRoot, "bin", "fs-watch");
  }
  get configPath(): string {
    return join(this.pluginRoot, "config.json");
  }
  get skillDir(): string {
    return join(this.dataRoot, "skills", FS_WATCH_SKILL_NAME);
  }
  get outDir(): string {
    return join(this.skillDir, "references", "watch-log");
  }

  async getStatus(): Promise<FsWatchStatus> {
    const installed = await this.isInstalled();
    const state = await this.readStateFile();
    const heartbeatFresh = isHeartbeatFresh(state?.lastHeartbeatAt, new Date());
    let runState: FsWatchRunState;
    if (!installed) {
      runState = "not_installed";
    } else if (this.errored) {
      runState = "error";
    } else if (this.child && !this.child.killed) {
      runState = "running";
    } else {
      runState = "stopped";
    }
    return {
      installed,
      binaryVersion: this.cachedVersion,
      enabled: this.isEnabled(),
      runState,
      lastHeartbeatAt: state?.lastHeartbeatAt,
      heartbeatFresh,
      overflow: state?.overflow === true,
      restartCount: this.restartCount,
      lastError: this.lastError,
      outDir: this.outDir,
    };
  }

  async installFromFile(sourcePath: string): Promise<FsWatchInstallResult> {
    try {
      await mkdir(dirname(this.binPath), { recursive: true });
      const tmp = `${this.binPath}.tmp`;
      await copyFile(sourcePath, tmp);
      await chmod(tmp, 0o755);
      const version = await probeVersion(tmp);
      if (!version) {
        await rm(tmp, { force: true });
        return { ok: false, error: "该文件不是有效的 fs-watch 插件二进制（--version 探测失败）。" };
      }
      await rename(tmp, this.binPath);
      this.cachedVersion = version;
      this.errored = false;
      this.lastError = undefined;
      this.log("fs-watch plugin installed", { version, binPath: this.binPath });
      return { ok: true, binaryVersion: version };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `安装失败：${message}` };
    }
  }

  async getConfig(): Promise<FsWatchConfigView> {
    const config = await this.readOrCreateConfig();
    return {
      roots: config.roots.map((r) => r.path),
      excludeNames: [...config.excludeNames],
      excludeHidden: config.excludeHidden,
      debounceMs: config.debounceMs,
      retentionDays: config.retentionDays,
    };
  }

  /** 写 config.json；运行中则重启进程让新配置生效。 */
  async updateConfig(input: FsWatchConfigUpdateInput): Promise<FsWatchConfigView> {
    const current = await this.readOrCreateConfig();
    const next: FsWatchPluginConfig = normalizeFsWatchConfig(
      {
        ...current,
        ...(input.roots ? { roots: input.roots.map((path) => ({ path })) } : {}),
        ...(input.excludeNames ? { excludeNames: input.excludeNames } : {}),
        ...(input.excludeHidden !== undefined ? { excludeHidden: input.excludeHidden } : {}),
        ...(input.debounceMs !== undefined ? { debounceMs: input.debounceMs } : {}),
        ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
      },
      this.outDir,
      this.defaultWatchRoot,
    );
    await this.writeConfig(next);
    if (this.desiredRunning) {
      await this.stop();
      await this.start();
    }
    return {
      roots: next.roots.map((r) => r.path),
      excludeNames: [...next.excludeNames],
      excludeHidden: next.excludeHidden,
      debounceMs: next.debounceMs,
      retentionDays: next.retentionDays,
    };
  }

  async start(): Promise<FsWatchActionResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, error: "fs-watch 插件尚未安装。" };
    }
    if (this.child && !this.child.killed) {
      return { ok: true };
    }
    this.desiredRunning = true;
    this.errored = false;
    this.lastError = undefined;
    try {
      await this.materializeSkill();
      await this.readOrCreateConfig();
      this.spawnChild();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return { ok: false, error: message };
    }
  }

  async stop(): Promise<void> {
    this.desiredRunning = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    const child = this.child;
    if (!child || child.killed || child.exitCode !== null) {
      this.child = undefined;
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // 进程可能已退出
        }
        resolve();
      }, STOP_GRACE_MS);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
    this.child = undefined;
  }

  /** error 态手动重试：清空计数后重新 start。 */
  async retry(): Promise<FsWatchActionResult> {
    this.restartTimestamps = [];
    this.restartCount = 0;
    this.errored = false;
    this.lastError = undefined;
    return this.start();
  }

  /** app 退出：同步 best-effort SIGTERM（before-quit 不等待）。 */
  shutdownSync(): void {
    this.desiredRunning = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    try {
      this.child?.kill("SIGTERM");
    } catch {
      // 忽略：进程可能已退出
    }
    this.child = undefined;
  }

  // ─── 内部 ───

  private async isInstalled(): Promise<boolean> {
    try {
      await readFile(this.binPath, { encoding: null, flag: "r" });
      return true;
    } catch {
      return false;
    }
  }

  private spawnChild(): void {
    const child = spawn(this.binPath, ["--config", this.configPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer) => {
      this.log("[plugin:fs-watch] stdout", { line: chunk.toString("utf8").trim() });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.log("[plugin:fs-watch]", { line: chunk.toString("utf8").trim() });
    });
    child.once("exit", (code, signal) => {
      this.log("fs-watch plugin exited", { code, signal });
      this.child = undefined;
      if (!this.desiredRunning) return;
      // 单实例锁冲突（exit 2）说明有别的实例在写同一 outDir，不应自动重启打架
      if (code === 2) {
        this.errored = true;
        this.lastError = "检测到另一个 fs-watch 实例正在运行（state.json 心跳新鲜）。";
        return;
      }
      this.scheduleRestart();
    });
    child.once("error", (error) => {
      this.log("fs-watch plugin spawn error", { error: error.message });
      this.child = undefined;
      this.lastError = error.message;
      if (this.desiredRunning) this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    const now = Date.now();
    this.restartTimestamps = pruneRestartWindow(this.restartTimestamps, now);
    if (this.restartTimestamps.length >= MAX_RESTARTS_IN_WINDOW) {
      this.errored = true;
      this.lastError = "插件进程反复崩溃，已停止自动重启；请检查日志后手动重试。";
      this.log("fs-watch plugin gave up restarting", { restarts: this.restartTimestamps.length });
      return;
    }
    const delay = restartDelayMs(this.restartTimestamps.length) ?? RESTART_BACKOFF_MS[RESTART_BACKOFF_MS.length - 1];
    this.restartTimestamps.push(now);
    this.restartCount += 1;
    this.log("fs-watch plugin restart scheduled", { delayMs: delay, restartCount: this.restartCount });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (!this.desiredRunning) return;
      void this.start().then((result) => {
        if (!result.ok) {
          this.errored = true;
          this.lastError = result.error;
        }
      });
    }, delay);
  }

  private async materializeSkill(): Promise<void> {
    await mkdir(this.outDir, { recursive: true });
    const skillFile = join(this.skillDir, "SKILL.md");
    // 每次启动覆盖写：SKILL.md 是 actspace 管理的物料，用户不应在这里改
    await writeFile(skillFile, FS_WATCH_SKILL_MD, "utf8");
  }

  private async readOrCreateConfig(): Promise<FsWatchPluginConfig> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.configPath, "utf8"));
    } catch {
      raw = undefined;
    }
    const config = normalizeFsWatchConfig(raw, this.outDir, this.defaultWatchRoot);
    await this.writeConfig(config);
    return config;
  }

  private async writeConfig(config: FsWatchPluginConfig): Promise<void> {
    await mkdir(dirname(this.configPath), { recursive: true });
    const tmp = `${this.configPath}.tmp`;
    await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
    await rename(tmp, this.configPath);
  }

  private async readStateFile(): Promise<StateFileShape | undefined> {
    try {
      const raw = await readFile(join(this.outDir, "state.json"), "utf8");
      const parsed = JSON.parse(raw) as StateFileShape;
      return typeof parsed === "object" && parsed !== null ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

/** 跑 `<bin> --version` 验证二进制；成功返回版本串，失败返回 undefined。 */
async function probeVersion(binPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let output = "";
    let child: ChildProcess;
    try {
      child = spawn(binPath, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 忽略
      }
      resolve(undefined);
    }, VERSION_PROBE_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const match = /fs-watch\s+(\S+)/.exec(output);
      resolve(code === 0 && match ? match[1] : undefined);
    });
  });
}
