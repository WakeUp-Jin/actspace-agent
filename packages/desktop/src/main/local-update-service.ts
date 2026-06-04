import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  LocalUpdateErrorCode,
  LocalUpdateProgress,
  LocalUpdateProgressPhase,
  LocalUpdateStartResult,
  LocalUpdateState,
} from "@actspace/shared";

type LocalUpdateConfig = {
  sourceRoot?: string;
};

export type LocalUpdateServiceOptions = {
  dataRoot: string;
  appPath: string;
  isPackaged: boolean;
  platform?: NodeJS.Platform;
  pid?: number;
  spawnHelper?: (scriptPath: string) => ChildProcess;
  now?: () => Date;
  onReadyToReplace?: () => void;
  readinessPollMs?: number;
};

const CONFIG_FILE = "local-update.json";
const UPDATE_DIR = "local-update";
const RELEASE_SCRIPT = "scripts/release-package.sh";

export class LocalUpdateService {
  private readonly dataRoot: string;
  private readonly appPathInput: string;
  private readonly isPackaged: boolean;
  private readonly platform: NodeJS.Platform;
  private readonly pid: number;
  private readonly spawnHelper: (scriptPath: string) => ChildProcess;
  private readonly now: () => Date;
  private readonly onReadyToReplace?: () => void;
  private readonly readinessPollMs: number;
  private sourceRoot: string | null = null;
  private running = false;
  private lastStartedAt: string | undefined;
  private readinessTimer: NodeJS.Timeout | undefined;
  private replacementQuitRequested = false;

  constructor(options: LocalUpdateServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.appPathInput = options.appPath;
    this.isPackaged = options.isPackaged;
    this.platform = options.platform ?? process.platform;
    this.pid = options.pid ?? process.pid;
    this.spawnHelper = options.spawnHelper ?? defaultSpawnHelper;
    this.now = options.now ?? (() => new Date());
    this.onReadyToReplace = options.onReadyToReplace;
    this.readinessPollMs = options.readinessPollMs ?? 500;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as LocalUpdateConfig;
      this.sourceRoot = typeof parsed.sourceRoot === "string" && parsed.sourceRoot ? parsed.sourceRoot : null;
    } catch {
      this.sourceRoot = null;
    }
  }

  async setSourceRoot(sourceRoot: string): Promise<LocalUpdateState> {
    this.sourceRoot = sourceRoot;
    await mkdir(this.dataRoot, { recursive: true });
    await writeJson(this.configPath, { sourceRoot });
    return this.getState();
  }

  async getState(): Promise<LocalUpdateState> {
    const source: SourceValidationResult = this.sourceRoot
      ? await validateSourceRoot(this.sourceRoot)
      : { ok: false, error: "missing_source" };
    const app = await this.resolveInstallTarget();
    const progress = await this.readProgress();
    const running = isActiveProgressPhase(progress.phase);
    this.running = running;
    const canUpdate = Boolean(source.ok && app.ok && !running);
    return {
      sourceRoot: this.sourceRoot,
      sourceValid: source.ok,
      sourceError: source.ok === false ? source.error : undefined,
      appExecutablePath: this.appPathInput,
      appIsPackaged: this.isPackaged,
      appPath: app.ok ? app.appPath : null,
      installParent: app.ok ? app.installParent : null,
      canUpdate,
      reason: canUpdate ? undefined : this.reasonFor(source, app),
      logPath: this.logPath,
      running,
      lastStartedAt: this.lastStartedAt ?? progress.startedAt,
      progress,
    };
  }

  async start(): Promise<LocalUpdateStartResult> {
    const currentProgress = await this.readProgress();
    if (this.running || isActiveProgressPhase(currentProgress.phase)) {
      return this.failure("already_running", "本地更新已经在运行。");
    }
    const source: SourceValidationResult = this.sourceRoot
      ? await validateSourceRoot(this.sourceRoot)
      : { ok: false, error: "missing_source" };
    if (source.ok === false) {
      return this.failure(source.error, this.messageForSourceError(source.error));
    }
    const app = await this.resolveInstallTarget();
    if (app.ok === false) {
      return this.failure(app.error, this.messageForAppError(app.error));
    }

    try {
      await mkdir(this.updateRoot, { recursive: true });
      this.lastStartedAt = this.now().toISOString();
      await this.writeProgress({
        phase: "starting",
        message: "正在启动本地更新助手…",
        startedAt: this.lastStartedAt,
        updatedAt: this.lastStartedAt,
      });
      const scriptPath = join(this.updateRoot, "run-local-update.sh");
      await writeFile(
        scriptPath,
        createHelperScript({
          sourceRoot: source.sourceRoot,
          appPath: app.appPath,
          pid: this.pid,
          logPath: this.logPath,
          statusPath: this.statusPath,
        }),
        { mode: 0o700 },
      );
      const child = this.spawnHelper(scriptPath);
      child.unref?.();
      this.running = true;
      this.replacementQuitRequested = false;
      this.monitorReplacementReadiness();
      return { ok: true, state: await this.getState() };
    } catch {
      await this.writeProgress({
        phase: "failed",
        message: "启动本地更新助手失败。",
        startedAt: this.lastStartedAt,
        updatedAt: this.now().toISOString(),
        finishedAt: this.now().toISOString(),
      });
      return this.failure("spawn_failed", "启动本地更新助手失败。");
    }
  }

  private monitorReplacementReadiness(): void {
    if (!this.onReadyToReplace) return;
    if (this.readinessTimer) clearInterval(this.readinessTimer);
    const tick = async () => {
      const progress = await this.readProgress();
      if (progress.phase === "ready_to_replace" || progress.phase === "waiting_for_exit" || progress.phase === "replacing") {
        if (!this.replacementQuitRequested) {
          this.replacementQuitRequested = true;
          this.onReadyToReplace?.();
        }
        this.clearReadinessTimer();
        return;
      }
      if (!isActiveProgressPhase(progress.phase)) {
        this.running = false;
        this.clearReadinessTimer();
      }
    };
    this.readinessTimer = setInterval(() => void tick(), this.readinessPollMs);
    this.readinessTimer.unref?.();
    void tick();
  }

  private clearReadinessTimer(): void {
    if (!this.readinessTimer) return;
    clearInterval(this.readinessTimer);
    this.readinessTimer = undefined;
  }

  private async failure(error: LocalUpdateErrorCode, message: string): Promise<LocalUpdateStartResult> {
    return { ok: false, error, message, state: await this.getState() };
  }

  private reasonFor(
    source: SourceValidationResult,
    app: InstallTargetResult,
  ): string | undefined {
    if (this.running) return "本地更新已经在运行。";
    if (source.ok === false) return this.messageForSourceError(source.error);
    if (app.ok === false) return this.messageForAppError(app.error);
    return undefined;
  }

  private messageForSourceError(error: LocalUpdateErrorCode): string {
    switch (error) {
      case "missing_source":
        return "请选择 actspace 源码目录。";
      case "invalid_source":
        return "所选目录不是可用于本地更新的 actspace 源码目录。";
      default:
        return "源码目录不可用。";
    }
  }

  private messageForAppError(error: LocalUpdateErrorCode): string {
    switch (error) {
      case "not_macos":
        return "本地更新第一版仅支持 macOS。";
      case "not_packaged":
        return "当前不是已安装的 macOS app，开发模式下不会替换应用。";
      case "not_writable":
        return "当前安装位置不可写，无法自动替换应用。";
      default:
        return "当前应用无法自动更新。";
    }
  }

  private async resolveInstallTarget(): Promise<InstallTargetResult> {
    if (this.platform !== "darwin") return { ok: false, error: "not_macos" };
    const appPath = deriveMacAppPath(this.appPathInput);
    if (!appPath) return { ok: false, error: "not_packaged" };
    if (isDevelopmentElectronRuntime(appPath)) return { ok: false, error: "not_packaged" };
    if (!isActspaceAppBundle(appPath)) return { ok: false, error: "not_packaged" };
    const installParent = dirname(appPath);
    try {
      await access(installParent, constants.W_OK);
      await access(appPath, constants.W_OK);
    } catch {
      return { ok: false, error: "not_writable" };
    }
    return { ok: true, appPath, installParent };
  }

  private get configPath(): string {
    return join(this.dataRoot, CONFIG_FILE);
  }

  private get updateRoot(): string {
    return join(this.dataRoot, "tmp", UPDATE_DIR);
  }

  private get logPath(): string {
    return join(this.updateRoot, "update.log");
  }

  private get statusPath(): string {
    return join(this.updateRoot, "status.json");
  }

  private async readProgress(): Promise<LocalUpdateProgress> {
    try {
      const raw = await readFile(this.statusPath, "utf8");
      return normalizeProgress(JSON.parse(raw));
    } catch {
      return {
        phase: this.running ? "starting" : "idle",
        message: this.running ? "正在启动本地更新助手…" : "尚未开始本地更新。",
      };
    }
  }

  private async writeProgress(progress: LocalUpdateProgress): Promise<void> {
    await mkdir(this.updateRoot, { recursive: true });
    await writeJson(this.statusPath, progress);
  }
}

type SourceValidationResult =
  | { ok: true; sourceRoot: string }
  | { ok: false; error: LocalUpdateErrorCode };

type InstallTargetResult =
  | { ok: true; appPath: string; installParent: string }
  | { ok: false; error: LocalUpdateErrorCode };

async function validateSourceRoot(sourceRoot: string): Promise<SourceValidationResult> {
  try {
    const pkgPath = join(sourceRoot, "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { name?: unknown; scripts?: Record<string, unknown> };
    if (pkg.name !== "actspace") return { ok: false, error: "invalid_source" };
    if (typeof pkg.scripts?.["package:desktop:dmg"] !== "string") {
      return { ok: false, error: "invalid_source" };
    }
    await access(join(sourceRoot, RELEASE_SCRIPT), constants.R_OK);
    return { ok: true, sourceRoot };
  } catch {
    return { ok: false, error: "invalid_source" };
  }
}

export function deriveMacAppPath(input: string): string | null {
  const marker = ".app";
  const index = input.lastIndexOf(marker);
  if (index < 0) return null;
  return input.slice(0, index + marker.length);
}

export function isDevelopmentElectronRuntime(appPath: string): boolean {
  const normalized = appPath.replace(/\\/g, "/");
  return normalized.includes("/node_modules/") && normalized.endsWith("/Electron.app");
}

export function isActspaceAppBundle(appPath: string): boolean {
  return basename(appPath).toLowerCase() === "actspace.app";
}

export function createHelperScript({
  sourceRoot,
  appPath,
  pid,
  logPath,
  statusPath,
}: {
  sourceRoot: string;
  appPath: string;
  pid: number;
  logPath: string;
  statusPath: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${sh(sourceRoot)}
APP_PATH=${sh(appPath)}
APP_PID=${pid}
LOG_PATH=${sh(logPath)}
STATUS_PATH=${sh(statusPath)}
NEW_APP="$SOURCE_ROOT/dist/desktop/Actspace.app"
if [[ ! -d "$NEW_APP" && -d "$SOURCE_ROOT/dist/desktop/actspace.app" ]]; then
  NEW_APP="$SOURCE_ROOT/dist/desktop/actspace.app"
fi
TARGET_APP="$(dirname "$APP_PATH")/$(basename "$NEW_APP")"
CURRENT_BACKUP="$APP_PATH.previous-local-update"
TARGET_BACKUP="$TARGET_APP.previous-local-update"

mkdir -p "$(dirname "$LOG_PATH")"
exec >> "$LOG_PATH" 2>&1
if [[ -n "\${PATH:-}" ]]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
else
  export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
fi

STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
FAILED_MARKED=0

write_status() {
  local phase="$1"
  local message="$2"
  local now
  local finished_at=""
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ "$phase" == "succeeded" || "$phase" == "failed" ]]; then
    finished_at=",\\"finishedAt\\":\\"$now\\""
  fi
  cat > "$STATUS_PATH.tmp" <<EOF
{"phase":"$phase","message":"$message","startedAt":"$STARTED_AT","updatedAt":"$now"$finished_at}
EOF
  mv "$STATUS_PATH.tmp" "$STATUS_PATH"
}

write_failed() {
  FAILED_MARKED=1
  write_status "failed" "$1"
}

mark_failed_on_exit() {
  local code="$?"
  if [[ "$code" -ne 0 && "$FAILED_MARKED" -ne 1 ]]; then
    write_failed "本地更新失败，请查看日志。"
  fi
}
trap mark_failed_on_exit EXIT

echo "[local-update] started at $STARTED_AT"
cd "$SOURCE_ROOT"
write_status "building" "正在从源码构建 Actspace.app…"
if ! PNPM_BIN="$(command -v pnpm)"; then
  echo "[local-update] pnpm not found in PATH: $PATH"
  write_failed "未找到 pnpm，请确认 Homebrew 路径已加入环境。"
  exit 127
fi
if [[ -z "\${ACTSPACE_MAC_CODESIGN_IDENTITY:-}" && -z "\${ACTSPACE_MAC_ADHOC_SIGN:-}" ]]; then
  export ACTSPACE_MAC_ADHOC_SIGN=true
  echo "[local-update] defaulted ACTSPACE_MAC_ADHOC_SIGN=true for local updater build"
fi
"$PNPM_BIN" package:desktop:dmg

validate_new_app() {
  local app="$1"
  local info_plist="$app/Contents/Info.plist"
  local executable_name
  local executable_path
  if [[ ! -d "$app" ]]; then
    echo "[local-update] packaged app missing: $app"
    return 1
  fi
  if [[ ! -f "$info_plist" ]]; then
    echo "[local-update] Info.plist missing: $info_plist"
    return 1
  fi
  if ! executable_name="$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$info_plist" 2>/dev/null)"; then
    echo "[local-update] failed to read CFBundleExecutable from $info_plist"
    return 1
  fi
  executable_path="$app/Contents/MacOS/$executable_name"
  if [[ ! -x "$executable_path" ]]; then
    echo "[local-update] app executable missing or not executable: $executable_path"
    return 1
  fi
  if ! codesign --verify --no-strict --verbose=2 "$app"; then
    echo "[local-update] app code signature verification failed: $app"
    return 1
  fi
}

if ! validate_new_app "$NEW_APP"; then
  write_failed "构建出的 Actspace.app 未通过启动前验证，已保留当前版本。"
  exit 1
fi

write_status "ready_to_replace" "构建完成，准备退出并替换应用。"
while kill -0 "$APP_PID" 2>/dev/null; do
  write_status "waiting_for_exit" "正在等待当前应用退出…"
  sleep 0.5
done

restore_previous_app() {
  rm -rf "$TARGET_APP"
  if [[ -d "$CURRENT_BACKUP" ]]; then
    mv "$CURRENT_BACKUP" "$APP_PATH"
  fi
  if [[ "$APP_PATH" != "$TARGET_APP" && -d "$TARGET_BACKUP" ]]; then
    mv "$TARGET_BACKUP" "$TARGET_APP"
  fi
}

write_status "replacing" "正在替换已安装的 Actspace.app…"
rm -rf "$CURRENT_BACKUP" "$TARGET_BACKUP"
if [[ "$APP_PATH" != "$TARGET_APP" && -d "$TARGET_APP" ]]; then
  mv "$TARGET_APP" "$TARGET_BACKUP"
fi
if [[ -d "$APP_PATH" ]]; then
  mv "$APP_PATH" "$CURRENT_BACKUP"
fi
if ! ditto "$NEW_APP" "$TARGET_APP"; then
  echo "[local-update] failed to copy new app, restoring previous app"
  restore_previous_app
  write_failed "替换应用失败，已尝试恢复旧版本。"
  exit 1
fi
if ! open "$TARGET_APP"; then
  echo "[local-update] failed to open new app, restoring previous app"
  restore_previous_app
  write_failed "更新后的 Actspace.app 启动失败，已恢复旧版本。"
  exit 1
fi
rm -rf "$CURRENT_BACKUP" "$TARGET_BACKUP" || true
write_status "succeeded" "更新完成，正在重新打开 Actspace。"
echo "[local-update] finished at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
`;
}

function defaultSpawnHelper(scriptPath: string): ChildProcess {
  return spawn("/bin/bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sh(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const ACTIVE_PROGRESS_PHASES = new Set<LocalUpdateProgressPhase>([
  "starting",
  "building",
  "ready_to_replace",
  "waiting_for_exit",
  "replacing",
]);

function isActiveProgressPhase(phase: LocalUpdateProgressPhase): boolean {
  return ACTIVE_PROGRESS_PHASES.has(phase);
}

function normalizeProgress(value: unknown): LocalUpdateProgress {
  if (!value || typeof value !== "object") {
    return { phase: "idle", message: "尚未开始本地更新。" };
  }
  const record = value as Record<string, unknown>;
  const phase = isProgressPhase(record.phase) ? record.phase : "idle";
  return {
    phase,
    message: typeof record.message === "string" && record.message ? record.message : defaultProgressMessage(phase),
    startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    finishedAt: typeof record.finishedAt === "string" ? record.finishedAt : undefined,
  };
}

function isProgressPhase(value: unknown): value is LocalUpdateProgressPhase {
  return (
    value === "idle" ||
    value === "starting" ||
    value === "building" ||
    value === "ready_to_replace" ||
    value === "waiting_for_exit" ||
    value === "replacing" ||
    value === "succeeded" ||
    value === "failed"
  );
}

function defaultProgressMessage(phase: LocalUpdateProgressPhase): string {
  switch (phase) {
    case "starting":
      return "正在启动本地更新助手…";
    case "building":
      return "正在从源码构建 Actspace.app…";
    case "ready_to_replace":
      return "构建完成，准备退出并替换应用。";
    case "waiting_for_exit":
      return "正在等待当前应用退出…";
    case "replacing":
      return "正在替换已安装的 Actspace.app…";
    case "succeeded":
      return "更新完成，正在重新打开 Actspace。";
    case "failed":
      return "本地更新失败，请查看日志。";
    default:
      return "尚未开始本地更新。";
  }
}
