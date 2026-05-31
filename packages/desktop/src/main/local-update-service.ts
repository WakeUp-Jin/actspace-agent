import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  LocalUpdateErrorCode,
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
  private sourceRoot: string | null = null;
  private running = false;
  private lastStartedAt: string | undefined;

  constructor(options: LocalUpdateServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.appPathInput = options.appPath;
    this.isPackaged = options.isPackaged;
    this.platform = options.platform ?? process.platform;
    this.pid = options.pid ?? process.pid;
    this.spawnHelper = options.spawnHelper ?? defaultSpawnHelper;
    this.now = options.now ?? (() => new Date());
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
    const canUpdate = Boolean(source.ok && app.ok && !this.running);
    return {
      sourceRoot: this.sourceRoot,
      sourceValid: source.ok,
      sourceError: source.ok === false ? source.error : undefined,
      appPath: app.ok ? app.appPath : null,
      installParent: app.ok ? app.installParent : null,
      canUpdate,
      reason: canUpdate ? undefined : this.reasonFor(source, app),
      logPath: this.logPath,
      running: this.running,
      lastStartedAt: this.lastStartedAt,
    };
  }

  async start(): Promise<LocalUpdateStartResult> {
    if (this.running) {
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
      const scriptPath = join(this.updateRoot, "run-local-update.sh");
      await writeFile(
        scriptPath,
        createHelperScript({
          sourceRoot: source.sourceRoot,
          appPath: app.appPath,
          pid: this.pid,
          logPath: this.logPath,
        }),
        { mode: 0o700 },
      );
      const child = this.spawnHelper(scriptPath);
      child.unref?.();
      this.running = true;
      this.lastStartedAt = this.now().toISOString();
      return { ok: true, state: await this.getState() };
    } catch {
      return this.failure("spawn_failed", "启动本地更新助手失败。");
    }
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
    if (!this.isPackaged) return { ok: false, error: "not_packaged" };
    const appPath = deriveMacAppPath(this.appPathInput);
    if (!appPath) return { ok: false, error: "not_packaged" };
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

export function createHelperScript({
  sourceRoot,
  appPath,
  pid,
  logPath,
}: {
  sourceRoot: string;
  appPath: string;
  pid: number;
  logPath: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT=${sh(sourceRoot)}
APP_PATH=${sh(appPath)}
APP_PID=${pid}
LOG_PATH=${sh(logPath)}
NEW_APP="$SOURCE_ROOT/dist/desktop/actspace.app"
BACKUP_APP="$APP_PATH.previous-local-update"

mkdir -p "$(dirname "$LOG_PATH")"
exec >> "$LOG_PATH" 2>&1

echo "[local-update] started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cd "$SOURCE_ROOT"
pnpm package:desktop:dmg

if [[ ! -d "$NEW_APP" ]]; then
  echo "[local-update] packaged app missing: $NEW_APP"
  exit 1
fi

while kill -0 "$APP_PID" 2>/dev/null; do
  sleep 0.5
done

rm -rf "$BACKUP_APP"
if [[ -d "$APP_PATH" ]]; then
  mv "$APP_PATH" "$BACKUP_APP"
fi
if ! ditto "$NEW_APP" "$APP_PATH"; then
  echo "[local-update] failed to copy new app, restoring previous app"
  rm -rf "$APP_PATH"
  if [[ -d "$BACKUP_APP" ]]; then
    mv "$BACKUP_APP" "$APP_PATH"
  fi
  exit 1
fi
open "$APP_PATH"
rm -rf "$BACKUP_APP" || true
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
