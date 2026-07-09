/**
 * BrowserBridgeService —— browser-bridge host-bridge 插件的初始化与状态检查。
 *
 * 与 fs-watch 不同：browser-bridge 的运行时 host 由 Chrome Native Messaging 拉起，
 * actspace 只负责安装 `abb`、注册 native host、暴露 doctor/capabilities 状态。
 */
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  BrowserBridgeActionResult,
  BrowserBridgeDoctorCheck,
  BrowserBridgeInstallResult,
  BrowserBridgeRunState,
  BrowserBridgeStatus,
} from "@actspace/shared";

const BROWSER_BRIDGE_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const BROWSER_BRIDGE_ERROR_TAIL_CHARS = 1_600;
const ABB_COMMAND_TIMEOUT_MS = 15_000;
const BROWSER_BRIDGE_SKILL_NAME = "browser-bridge";

interface BrowserBridgeServiceOptions {
  dataRoot: string;
  log?: (message: string, details?: Record<string, unknown>) => void;
}

interface AbbCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

interface DoctorJson {
  summary?: string;
  checks?: BrowserBridgeDoctorCheck[];
}

export class BrowserBridgeService {
  private readonly dataRoot: string;
  private readonly log: (message: string, details?: Record<string, unknown>) => void;
  private lastError: string | undefined;

  constructor(options: BrowserBridgeServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.log = options.log ?? (() => {});
  }

  get pluginRoot(): string {
    return join(this.dataRoot, "plugins", "browser-bridge");
  }

  get binPath(): string {
    return join(this.pluginRoot, "bin", "abb");
  }

  get skillDir(): string {
    return join(this.dataRoot, "skills", BROWSER_BRIDGE_SKILL_NAME);
  }

  get skillPath(): string {
    return join(this.skillDir, "SKILL.md");
  }

  async getStatus(repoRoot?: string | null): Promise<BrowserBridgeStatus> {
    const installed = await this.isInstalled();
    const extensionDir = repoRoot ? join(repoRoot, "plugins", "browser-bridge", "apps", "chrome-extension") : undefined;
    if (!installed) {
      return {
        installed,
        abbPath: this.binPath,
        extensionDir,
        runState: "not_installed",
        doctorChecks: [],
        lastError: this.lastError,
      };
    }

    const doctor = await this.runAbb(["doctor", "--json"]);
    if (!doctor.ok) {
      return {
        installed,
        abbPath: this.binPath,
        extensionDir,
        runState: "error",
        doctorChecks: [],
        lastError: doctor.error ?? (doctor.stderr || "abb doctor 执行失败。"),
      };
    }

    const parsedDoctor = parseDoctor(doctor.stdout);
    const capabilities = await this.runAbb(["capabilities", "--json"]);
    return {
      installed,
      abbPath: this.binPath,
      extensionDir,
      runState: resolveRunState(parsedDoctor.checks),
      doctorSummary: parsedDoctor.summary,
      doctorChecks: parsedDoctor.checks,
      capabilitiesJson: capabilities.ok ? capabilities.stdout : undefined,
      lastError: capabilities.ok ? this.lastError : capabilities.error ?? capabilities.stderr,
    };
  }

  async buildAndInstall(repoRoot: string): Promise<BrowserBridgeInstallResult> {
    const pluginDir = join(repoRoot, "plugins", "browser-bridge");
    const buildScript = join(pluginDir, "build.sh");
    const sourceBinary = join(pluginDir, "skill", "scripts", "abb");
    const extensionDir = join(pluginDir, "apps", "chrome-extension");
    try {
      await stat(buildScript);
      await stat(join(extensionDir, "manifest.json"));
    } catch {
      return {
        ok: false,
        error: `该目录不是含 browser-bridge 的 actspace-plugins 仓库（缺少 plugins/browser-bridge/build.sh 或 Chrome extension）：${repoRoot}`,
      };
    }

    this.log("browser-bridge build started", { pluginDir });
    const build = await runCommand("bash", [buildScript], pluginDir, BROWSER_BRIDGE_BUILD_TIMEOUT_MS, (line) => {
      this.log("[plugin:browser-bridge] build", { line });
    });
    if (!build.ok) {
      return { ok: false, error: `编译失败：${build.error ?? (build.stderr || "未知错误")}` };
    }

    const installed = await this.installFromFile(sourceBinary);
    if (!installed.ok) return installed;
    return { ok: true, abbPath: this.binPath, extensionDir };
  }

  async installFromFile(sourcePath: string): Promise<BrowserBridgeInstallResult> {
    try {
      await mkdir(dirname(this.binPath), { recursive: true });
      await copyFile(sourcePath, this.binPath);
      await chmod(this.binPath, 0o755);
      const help = await this.runAbb(["help"]);
      if (!help.ok || !help.stdout.includes("Agent Browser Bridge")) {
        return { ok: false, error: "该文件不是有效的 abb 二进制（help 探测失败）。" };
      }
      await this.writeManagedSkill();
      this.lastError = undefined;
      this.log("browser-bridge abb installed", { abbPath: this.binPath, skillPath: this.skillPath });
      return { ok: true, abbPath: this.binPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return { ok: false, error: `安装失败：${message}` };
    }
  }

  async installNativeHost(): Promise<BrowserBridgeActionResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, error: "browser-bridge 尚未安装，请先编译并安装 abb。" };
    }
    const result = await this.runAbb(["install-native-host", "--binary", this.binPath, "--json"]);
    if (!result.ok) {
      const error = result.error ?? (result.stderr || "Native Messaging host 安装失败。");
      this.lastError = error;
      return { ok: false, error };
    }
    this.lastError = undefined;
    return { ok: true };
  }

  private async isInstalled(): Promise<boolean> {
    try {
      await readFile(this.binPath, { encoding: null, flag: "r" });
      return true;
    } catch {
      return false;
    }
  }

  private runAbb(args: string[]): Promise<AbbCommandResult> {
    return runCommand(this.binPath, args, undefined, ABB_COMMAND_TIMEOUT_MS);
  }

  private async writeManagedSkill(): Promise<void> {
    await mkdir(this.skillDir, { recursive: true });
    await writeFile(this.skillPath, renderManagedSkill(this.binPath), "utf8");
  }
}

function renderManagedSkill(abbPath: string): string {
  return [
    "---",
    "name: browser-bridge",
    "description: Use when the user asks to inspect, navigate, automate, or take screenshots of the real Chrome browser via Browser Use. Prefer the abb CLI through bash for tabs, pages, history, navigation, screenshots, and CDP-backed browser actions.",
    "---",
    "",
    "# Browser Bridge",
    "",
    "Use this skill when a task needs the user's real Chrome browser state, including open tabs, current pages, navigation, history, screenshots, or Chrome Debugger/CDP-backed actions.",
    "",
    "## Command",
    "",
    `- CLI: \`${abbPath}\``,
    "- Always quote the absolute path in bash commands because it may contain spaces.",
    "- Start with `help`, `doctor --json`, or `capabilities --json` before using unfamiliar subcommands.",
    "- Prefer JSON output when available.",
    "- If `doctor --json` reports that the native host, local socket, or extension is unavailable, tell the user which part needs to be loaded or reloaded.",
    "",
    "## Examples",
    "",
    "```bash",
    `"${abbPath}" help`,
    `"${abbPath}" doctor --json`,
    `"${abbPath}" capabilities --json`,
    "```",
    "",
  ].join("\n");
}

function parseDoctor(stdout: string): DoctorJson {
  try {
    const parsed = JSON.parse(stdout) as DoctorJson;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      checks: Array.isArray(parsed.checks) ? parsed.checks.filter(isDoctorCheck) : [],
    };
  } catch {
    return { checks: [] };
  }
}

function isDoctorCheck(value: unknown): value is BrowserBridgeDoctorCheck {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.status === "string" && typeof obj.detail === "string";
}

function resolveRunState(checks: BrowserBridgeDoctorCheck[]): BrowserBridgeRunState {
  const nativeHost = checks.find((check) => check.name === "native_messaging_host");
  if (nativeHost && nativeHost.status !== "ok") return "host_not_installed";
  const socket = checks.find((check) => check.name === "local_rpc_socket");
  if (socket && socket.status !== "ok") return "extension_offline";
  if (checks.some((check) => check.status === "error")) return "error";
  return "ready";
}

function runCommand(
  command: string,
  args: string[],
  cwd: string | undefined,
  timeoutMs: number,
  onLine?: (line: string) => void,
): Promise<AbbCommandResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ ok: false, stdout: "", stderr: "", error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let stdout = "";
    let stderr = "";
    const collect = (kind: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (kind === "stdout") stdout += text;
      else stderr += text;
      if (onLine) {
        for (const line of text.split("\n")) {
          if (line.trim().length > 0) onLine(line.trimEnd());
        }
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect("stderr", chunk));

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 进程可能已退出
      }
      resolve({ ok: false, stdout, stderr, error: `命令超时（超过 ${Math.round(timeoutMs / 1000)} 秒）` });
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr, error: error.message });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() });
      else {
        const tail = `${stdout}\n${stderr}`.slice(-BROWSER_BRIDGE_ERROR_TAIL_CHARS).trim();
        resolve({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), error: tail || `命令退出码 ${code}` });
      }
    });
  });
}
