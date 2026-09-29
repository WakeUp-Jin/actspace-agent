/**
 * BrowserBridgeService —— browser-bridge host-bridge 插件的初始化与状态检查。
 *
 * Browser Bridge 的运行时 host 由 Chrome Native Messaging 拉起；ActSpace 只负责
 * 安装 `abb`、注册 native host、暴露 doctor/capabilities 状态。
 */
import { chmod, copyFile, cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type {
  BrowserBridgeActionResult,
  BrowserBridgeDoctorCheck,
  BrowserBridgeInstallResult,
  BrowserBridgeRunState,
  BrowserBridgeStatus,
  BrowserBridgeInstance,
} from "@actspace/shared";

const BROWSER_BRIDGE_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const BROWSER_BRIDGE_ERROR_TAIL_CHARS = 1_600;
const ABB_COMMAND_TIMEOUT_MS = 15_000;
const ABB_STATUS_ERROR_RETRY_MS = 5_000;
const BROWSER_BRIDGE_SKILL_NAME = "browser-bridge";

interface BrowserBridgeServiceOptions {
  dataRoot: string;
  bundledRoot?: string;
  log?: (message: string, details?: Record<string, unknown>) => void;
  commandTimeoutMs?: number;
  statusErrorRetryMs?: number;
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

type ConnectionConfig = { schemaVersion: 1; enabled: boolean; selectedInstanceId?: string; sourceRoot?: string; selectionRequested?: boolean };
type InstanceRecord = BrowserBridgeInstance & { socketPath: string; protocolVersion: string };
const INSTANCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXTENSION_ID = "eneeikpgpieikinaimmgmdiafbgbanei";

function chromeExtensionId(publicKey: string): string {
  const digest = createHash("sha256").update(Buffer.from(publicKey, "base64")).digest().subarray(0, 16);
  return [...digest].map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join("");
}

export class BrowserBridgeService {
  private readonly dataRoot: string;
  private readonly bundledRoot: string | undefined;
  private readonly log: (message: string, details?: Record<string, unknown>) => void;
  private readonly commandTimeoutMs: number;
  private readonly statusErrorRetryMs: number;
  private lastError: string | undefined;
  private selectedSocketPath: string | undefined;
  private config: ConnectionConfig | undefined;
  private configPromise: Promise<ConnectionConfig> | undefined;
  private revision = 0;
  private runtimeReady = false;
  private verifiedBridgeReady = false;
  private lastSuccessAt: string | undefined;
  private bootRecoveryMode = false;
  private turnTerminator: ((sessionId: string, turnId: string) => Promise<void>) | undefined;
  private browserDisposer: (() => Promise<void>) | undefined;
  private preparePromise: Promise<BrowserBridgeInstallResult> | undefined;
  private selectionNonce: string | undefined;
  private statusGeneration = 0;
  private statusInFlight:
    | { key: string; promise: Promise<BrowserBridgeStatus> }
    | undefined;
  private statusErrorCache:
    | { key: string; expiresAt: number; status: BrowserBridgeStatus }
    | undefined;

  constructor(options: BrowserBridgeServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.bundledRoot = options.bundledRoot;
    this.log = options.log ?? (() => {});
    this.commandTimeoutMs = options.commandTimeoutMs ?? ABB_COMMAND_TIMEOUT_MS;
    this.statusErrorRetryMs = options.statusErrorRetryMs ?? ABB_STATUS_ERROR_RETRY_MS;
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

  get extensionDir(): string {
    return join(this.pluginRoot, "extension");
  }

  get socketPath(): string {
    if (process.env.ABB_SOCKET) return process.env.ABB_SOCKET;
    if (this.selectedSocketPath) return this.selectedSocketPath;
    const supportDir = process.env.ABB_SUPPORT_DIR
      ?? join(homedir(), "Library", "Application Support", "AgentBrowserBridge");
    return join(supportDir, "agent-browser-bridge.sock");
  }

  private get configPath(): string { return join(this.pluginRoot, "connection.json"); }

  isBrowserAllowed(): boolean { return this.config?.enabled === true && this.verifiedBridgeReady && this.selectedSocketPath !== undefined; }
  setTurnTerminator(terminate: (sessionId: string, turnId: string) => Promise<void>): void { this.turnTerminator = terminate; }
  setBrowserDisposer(dispose: () => Promise<void>): void { this.browserDisposer = dispose; }
  endTurn(sessionId: string, turnId: string): Promise<void> { return this.turnTerminator?.(sessionId, turnId) ?? Promise.resolve(); }

  setRuntimeReady(ready: boolean): void {
    if (this.runtimeReady === ready) return;
    this.runtimeReady = ready;
    this.invalidateStatusState();
  }
  setBootRecoveryMode(enabled: boolean): void { this.bootRecoveryMode = enabled; this.invalidateStatusState(); }

  private async connectionConfig(): Promise<ConnectionConfig> {
    if (this.config) return this.config;
    this.configPromise ??= readFile(this.configPath, "utf8").then((raw) => {
      const value = JSON.parse(raw) as Partial<ConnectionConfig>;
      if (value.schemaVersion !== 1 || typeof value.enabled !== "boolean" ||
          (value.selectedInstanceId !== undefined && (typeof value.selectedInstanceId !== "string" || !INSTANCE_ID.test(value.selectedInstanceId))) ||
          (value.sourceRoot !== undefined && (typeof value.sourceRoot !== "string" || !isAbsolute(value.sourceRoot))) ||
          (value.selectionRequested !== undefined && typeof value.selectionRequested !== "boolean")) throw new Error("invalid connection config");
      return value as ConnectionConfig;
    }).catch(() => ({ schemaVersion: 1 as const, enabled: false }));
    this.config = await this.configPromise;
    return this.config;
  }

  private async saveConfig(config: ConnectionConfig): Promise<void> {
    await mkdir(this.pluginRoot, { recursive: true });
    const temporary = `${this.configPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(config) + "\n", { mode: 0o600 });
      await rename(temporary, this.configPath);
    } finally {
      await rm(temporary, { force: true });
    }
    this.config = config;
    this.configPromise = Promise.resolve(config);
    this.invalidateStatusState();
  }

  async connect(): Promise<BrowserBridgeInstallResult> {
    const installed = await this.isInstalled();
    const extension = await stat(join(this.extensionDir, "manifest.json")).then(() => true, () => false);
    if (!installed || !extension) {
      const prepared = await this.installBundled();
      if (!prepared.ok) return prepared;
    } else {
      const registered = await this.installNativeHost();
      if (!registered.ok) return { ok: false, error: registered.error };
    }
    const config = await this.connectionConfig();
    await this.saveConfig({ ...config, enabled: true });
    return { ok: true, abbPath: this.binPath, extensionDir: this.extensionDir };
  }

  async useSourceExtension(repoRoot: string | null): Promise<BrowserBridgeActionResult> {
    if (repoRoot !== null) {
      if (!isAbsolute(repoRoot)) return { ok: false, error: "请选择绝对源码目录。" };
      try {
        const folder = join(resolvePluginDir(repoRoot), "apps", "chrome-extension");
        const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8")) as Record<string, unknown>;
        await stat(join(folder, "src", "background.js"));
        if (manifest.name !== "ActSpace Browser" || typeof manifest.key !== "string" || chromeExtensionId(manifest.key) !== EXTENSION_ID || manifest.manifest_version !== 3) throw new Error("extension identity mismatch");
      } catch { return { ok: false, error: "该目录缺少有效的 ActSpace Chrome 扩展。" }; }
    }
    const config = await this.connectionConfig();
    await this.saveConfig({ ...config, sourceRoot: repoRoot ?? undefined });
    return { ok: true };
  }

  async prepareUpdate(): Promise<BrowserBridgeInstallResult> {
    const candidates = await this.discoverInstances();
    if (candidates.length > 0) return { ok: false, error: "请先在 Chrome 扩展页停用 ActSpace Browser，再准备更新。更新后重新启用扩展。" };
    return this.installBundled();
  }

  async disconnect(): Promise<BrowserBridgeActionResult> {
    const config = await this.connectionConfig();
    await this.saveConfig({ ...config, enabled: false });
    this.selectedSocketPath = undefined;
    this.selectionNonce = undefined;
    await rm(join(this.supportDir(), "instances", "selection-challenge.json"), { force: true }).catch(() => {});
    this.setRuntimeReady(false);
    await this.browserDisposer?.();
    return { ok: true };
  }

  async selectInstance(instanceId: string): Promise<BrowserBridgeActionResult> {
    if (!(await this.connectionConfig()).enabled) return { ok: false, error: "请先开始连接，再选择 Chrome 实例。" };
    if (instanceId === "") {
      this.verifiedBridgeReady = false;
      this.selectedSocketPath = undefined;
      await this.browserDisposer?.();
      await this.saveConfig({ ...(await this.connectionConfig()), selectedInstanceId: undefined, selectionRequested: true });
      this.setRuntimeReady(false);
      return { ok: true, operationId: randomUUID() };
    }
    if (!INSTANCE_ID.test(instanceId)) return { ok: false, error: "扩展实例标识无效。" };
    const candidates = await this.discoverInstances();
    if (!candidates.some((candidate) => candidate.instanceId === instanceId) || candidates.filter((candidate) => candidate.instanceId === instanceId).length !== 1) {
      return { ok: false, error: "目标扩展未连接或身份有冲突。" };
    }
    const config = await this.connectionConfig();
    const clicked = await this.selectedByChromeClick(candidates);
    if (clicked?.instanceId !== instanceId) return { ok: false, error: "请在目标 Chrome 用户资料中点击扩展图标确认连接。" };
    this.verifiedBridgeReady = false;
    await this.browserDisposer?.();
    await this.saveConfig({ ...config, enabled: true, selectedInstanceId: instanceId });
    this.selectedSocketPath = undefined;
    this.setRuntimeReady(false);
    return { ok: true };
  }

  private supportDir(): string {
    return process.env.ABB_SUPPORT_DIR ?? join(homedir(), "Library", "Application Support", "AgentBrowserBridge");
  }

  private async discoverInstances(): Promise<InstanceRecord[]> {
    const folder = join(this.supportDir(), "instances");
    const names = await readdir(folder).catch(() => []);
    const candidates: InstanceRecord[] = [];
    for (const name of names.filter((value) => /^s-[0-9a-f]{16}\.sock\.json$/.test(value)).slice(0, 20)) {
      try {
        const file = join(folder, name);
        const metadata = await stat(file);
        if (!metadata.isFile() || metadata.uid !== process.getuid?.() || metadata.mode & 0o077) continue;
        const record = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
        const socketPath = join(this.supportDir(), name.slice(0, -5));
        if (record.hostId !== basename(socketPath) || record.socketPath !== socketPath ||
          typeof record.extensionInstanceId !== "string" || !INSTANCE_ID.test(record.extensionInstanceId) ||
          record.protocolVersion !== "0.2.0" || typeof record.hostVersion !== "string" || typeof record.extensionVersion !== "string") continue;
        const socket = await stat(socketPath);
        if (!socket.isSocket() || socket.uid !== process.getuid?.() || socket.mode & 0o077) continue;
        const info = await runCommand(this.binPath, ["info", "--json", "--socket", socketPath], undefined, 2_000);
        if (!info.ok) continue;
        const response = JSON.parse(info.stdout) as Record<string, unknown>;
        const running = response.result as Record<string, unknown> | undefined;
        if (response.ok !== true || !running || typeof running !== "object") continue;
        if (running.instanceId !== record.extensionInstanceId || running.version !== record.extensionVersion || running.protocolVersion !== record.protocolVersion ||
          running.hostId !== record.hostId || running.hostVersion !== record.hostVersion) continue;
        candidates.push({ instanceId: record.extensionInstanceId, hostId: record.hostId,
          hostVersion: record.hostVersion, extensionVersion: record.extensionVersion,
          protocolVersion: record.protocolVersion, socketPath });
      } catch { /* Stale or untrusted records are never selectable. */ }
    }
    return candidates;
  }

  private async selectedByChromeClick(candidates: readonly InstanceRecord[]): Promise<InstanceRecord | undefined> {
    const folder = join(this.supportDir(), "instances");
    const challengePath = join(folder, "selection-challenge.json");
    if (this.selectionNonce) {
      const challenge = await stat(challengePath).catch(() => undefined);
      if (!challenge || Date.now() - challenge.mtimeMs > 5 * 60_000) this.selectionNonce = undefined;
    }
    if (!this.selectionNonce) {
      this.selectionNonce = randomUUID();
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(challengePath, JSON.stringify({ nonce: this.selectionNonce }), { mode: 0o600 });
      return undefined;
    }
    const matches: InstanceRecord[] = [];
    for (const candidate of candidates) {
      try {
        const path = join(folder, `selection-${candidate.hostId}.json`);
        const file = await stat(path);
        if (!file.isFile() || file.uid !== process.getuid?.() || file.mode & 0o077 || Date.now() - file.mtimeMs > 5 * 60_000) continue;
        const selected = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        if (selected.nonce === this.selectionNonce && selected.instanceId === candidate.instanceId && selected.hostId === candidate.hostId) matches.push(candidate);
      } catch { /* No click from this profile. */ }
    }
    if (matches.length !== 1) return undefined;
    await rm(challengePath, { force: true });
    this.selectionNonce = undefined;
    return matches[0];
  }

  getStatus(repoRoot?: string | null): Promise<BrowserBridgeStatus> {
    const key = repoRoot ?? "";
    const cached = this.statusErrorCache;
    if (cached && cached.key === key && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.status);
    }
    if (this.statusInFlight?.key === key) return this.statusInFlight.promise;

    const generation = this.statusGeneration;
    const promise = this.loadStatus(repoRoot)
      .then((rawStatus) => {
        if (generation !== this.statusGeneration && this.statusInFlight?.promise !== promise) return this.getStatus(repoRoot);
        const status = this.decorateStatus(rawStatus);
        if (generation === this.statusGeneration) {
          if (status.runState === "error") {
            this.statusErrorCache = {
              key,
              expiresAt: Date.now() + this.statusErrorRetryMs,
              status,
            };
          } else if (this.statusErrorCache?.key === key) {
            this.statusErrorCache = undefined;
          }
        }
        return status;
      })
      .finally(() => {
        if (this.statusInFlight?.promise === promise) this.statusInFlight = undefined;
      });
    this.statusInFlight = { key, promise };
    return promise;
  }

  private decorateStatus(status: BrowserBridgeStatus): BrowserBridgeStatus {
    const observedAt = new Date().toISOString();
    if (status.runState === "ready") this.lastSuccessAt = observedAt;
    const layer = (state: "ok" | "pending" | "unknown" | "failed") => ({ status: state, observedAt });
    const registration = status.doctorChecks.find((check) => check.name === "native_messaging_host");
    const failedCode = status.runState === "error" ? "CHECK_FAILED" : status.runState === "host_not_installed" ? "REGISTRATION_INVALID"
      : status.runState === "not_installed" ? "HOST_MISSING" : status.runState === "update_required" ? "VERSION_INCOMPATIBLE"
      : status.runState === "awaiting_selection" ? "INSTANCE_CONFLICT" : undefined;
    return { ...status, revision: this.revision, observedAt,
      connectionState: !status.enabled ? "disconnected" : this.preparePromise ? "preparing" : status.runState === "ready" ? "connected"
        : status.runState === "waiting_for_runtime" ? "waiting_for_idle" : status.runState === "extension_offline" ? this.lastSuccessAt ? "reconnecting" : "awaiting_extension"
        : status.runState === "awaiting_selection" ? "awaiting_selection" : status.runState === "update_required" ? "update_required" : "error",
      layers: { hostFile: layer(status.installed ? "ok" : "failed"), registration: layer(registration?.status === "ok" ? "ok" : registration ? "failed" : "unknown"),
        extension: layer(status.runningExtensionVersion ? "ok" : "unknown"), socketProtocol: layer(status.bridgeReady ? "ok" : status.runState === "update_required" ? "failed" : "pending"),
        runtime: layer(status.runtimeReady ? "ok" : "pending"), tools: layer(status.runtimeReady ? "ok" : "pending"), probe: layer(status.probeReady ? "ok" : "pending") },
      selectedInstance: status.instances?.find((instance) => instance.instanceId === status.selectedInstanceId),
      preparedVersions: { host: status.preparedHostVersion, extension: status.preparedExtensionVersion, protocol: "0.2.0" },
      runningVersions: { host: status.runningHostVersion, extension: status.runningExtensionVersion, protocol: status.runningHostVersion ? "0.2.0" : undefined },
      runtimeRegistration: status.runtimeReady ? "registered" : status.enabled ? "pending" : "unavailable", lastSuccessAt: this.lastSuccessAt,
      error: failedCode ? { code: failedCode, message: status.lastError ?? status.doctorSummary ?? "Chrome 连接检查尚未通过。" } : undefined,
      allowedActions: !status.enabled ? ["connect"] : ["disconnect", "retry", "openExtensions", "revealExtensionDirectory",
        ...(status.runState === "update_required" ? ["prepareUpdate" as const] : status.runState === "host_not_installed" || status.runState === "error" || status.runState === "not_installed" ? ["repairHost" as const] : [])],
    };
  }

  private async loadStatus(repoRoot?: string | null): Promise<BrowserBridgeStatus> {
    const config = await this.connectionConfig();
    const installed = await this.isInstalled();
    const sourceRoot = repoRoot ?? config.sourceRoot;
    const extensionDir = sourceRoot ? join(resolvePluginDir(sourceRoot), "apps", "chrome-extension") : this.extensionDir;
    const prepared = await this.readBundledManifest();
    const base = { sourceRoot: config.sourceRoot, enabled: config.enabled, revision: this.revision, selectedInstanceId: config.selectedInstanceId,
      runtimeReady: this.runtimeReady, installed, abbPath: this.binPath, extensionDir };
    if (!config.enabled) {
      this.verifiedBridgeReady = false;
      this.selectedSocketPath = undefined;
      return { ...base, runState: "disconnected", doctorChecks: [], lastError: this.lastError };
    }
    if (!installed) {
      this.verifiedBridgeReady = false;
      this.selectedSocketPath = undefined;
      return {
        ...base,
        runState: "not_installed",
        doctorChecks: [],
        lastError: this.lastError,
      };
    }

    const doctor = await this.runAbb(["doctor", "--json"]);
    if (!doctor.ok) {
      this.verifiedBridgeReady = false;
      this.selectedSocketPath = undefined;
      return {
        ...base,
        runState: "error",
        doctorChecks: [],
        lastError: doctor.error ?? (doctor.stderr || "abb doctor 执行失败。"),
      };
    }

    const parsedDoctor = parseDoctor(doctor.stdout);
    const capabilities = await this.runAbb(["capabilities", "--json"]);
    const candidates = await this.discoverInstances();
    const matching = config.selectedInstanceId
      ? candidates.filter((candidate) => candidate.instanceId === config.selectedInstanceId)
      : candidates;
    let selected = !config.selectionRequested && matching.length === 1 && (config.selectedInstanceId || candidates.length === 1) ? matching[0] : undefined;
    if (!selected && (candidates.length > 1 || config.selectionRequested) && !config.selectedInstanceId) selected = await this.selectedByChromeClick(candidates);
    const ambiguous = !selected && (config.selectionRequested || candidates.length > 1 && !config.selectedInstanceId || matching.length > 1);
    if (this.config !== config) return this.loadStatus(repoRoot);
    if (selected && !config.selectedInstanceId) await this.saveConfig({ ...config, selectedInstanceId: selected.instanceId, selectionRequested: false });
    if (this.selectedSocketPath !== selected?.socketPath) this.runtimeReady = false;
    this.selectedSocketPath = selected?.socketPath;
    let probeReady = false;
    if (selected) {
      const probe = await runCommand(this.binPath, ["tabs", "--json", "--socket", selected.socketPath], undefined, 3_000);
      probeReady = probe.ok;
    }
    const doctorChecks = parsedDoctor.checks.map((check) => check.name !== "local_rpc_socket" ? check : selected
      ? { ...check, status: probeReady ? "ok" : "offline", detail: probeReady
        ? `Local bridge socket is accepting requests at ${selected.socketPath}.`
        : `Local bridge socket is not reachable at ${selected.socketPath}.` }
      : candidates.length > 1
        ? { ...check, status: "selection_required", detail: "Multiple Chrome connections are online. Select the target profile in ActSpace." }
        : check);
    if (this.config?.enabled !== config.enabled || (config.selectedInstanceId && this.config?.selectedInstanceId !== config.selectedInstanceId)) return this.loadStatus(repoRoot);
    const doctorState = resolveRunState(doctorChecks);
    const versionMatches = !selected || !prepared || (selected.hostVersion === prepared.hostVersion && selected.extensionVersion === prepared.extensionVersion && selected.protocolVersion === prepared.protocolVersion);
    const bridgeReady = Boolean(selected && probeReady && versionMatches && doctorState !== "host_not_installed" && !this.bootRecoveryMode);
    const lostBridge = this.verifiedBridgeReady && !bridgeReady;
    this.verifiedBridgeReady = bridgeReady;
    if (lostBridge) await this.browserDisposer?.();
    if (bridgeReady && this.runtimeReady) await this.cleanupVerifiedBackups();
    return {
      ...base,
      runtimeReady: this.runtimeReady,
      selectedInstanceId: selected?.instanceId ?? config.selectedInstanceId,
      instances: candidates.map(({ instanceId, extensionVersion, hostVersion, hostId }) => ({ instanceId, extensionVersion, hostVersion, hostId })),
      probeReady,
      preparedHostVersion: prepared?.hostVersion,
      preparedExtensionVersion: prepared?.extensionVersion,
      runningHostVersion: selected?.hostVersion,
      runningExtensionVersion: selected?.extensionVersion,
      bridgeReady,
      runState: ambiguous ? "awaiting_selection" : !versionMatches ? "update_required" : !bridgeReady ? doctorState === "host_not_installed" ? "host_not_installed" : "extension_offline" : this.runtimeReady ? "ready" : "waiting_for_runtime",
      doctorSummary: parsedDoctor.summary,
      doctorChecks,
      capabilitiesJson: capabilities.ok ? capabilities.stdout : undefined,
      lastError: capabilities.ok ? this.lastError : capabilities.error ?? capabilities.stderr,
    };
  }

  async buildAndInstall(repoRoot: string): Promise<BrowserBridgeInstallResult> {
    const sourceValidation = await this.useSourceExtension(repoRoot);
    if (!sourceValidation.ok) return { ok: false, error: sourceValidation.error };
    const pluginDir = resolvePluginDir(repoRoot);
    const buildScript = join(pluginDir, "build.sh");
    const sourceBinary = join(pluginDir, "skill", "scripts", "abb");
    const extensionDir = join(pluginDir, "apps", "chrome-extension");
    try {
      await stat(buildScript);
      await stat(join(extensionDir, "manifest.json"));
    } catch {
      return {
        ok: false,
        error: `在该路径下找不到 browser-bridge 插件（缺少 browser-bridge/build.sh 或 Chrome extension）：${repoRoot}`,
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
    const selected = await this.useSourceExtension(repoRoot);
    if (!selected.ok) return { ok: false, error: selected.error };
    const registered = await this.installNativeHost();
    if (!registered.ok) return { ok: false, error: registered.error };
    return { ok: true, abbPath: this.binPath, extensionDir };
  }

  async installBundled(): Promise<BrowserBridgeInstallResult> {
    this.preparePromise ??= this.installBundledInternal().finally(() => { this.preparePromise = undefined; });
    return this.preparePromise;
  }

  private async installBundledInternal(): Promise<BrowserBridgeInstallResult> {
    if (!this.bundledRoot) return { ok: false, error: "当前版本未包含 Chrome 连接组件。" };
    try {
      const manifest = JSON.parse(await readFile(join(this.bundledRoot, "manifest.json"), "utf8")) as {
        schemaVersion?: number; platform?: string; arch?: string; hostVersion?: string; extensionVersion?: string; protocolVersion?: string; files?: Record<string, string>;
      };
      if (manifest.schemaVersion !== 1 || manifest.platform !== process.platform || manifest.arch !== process.arch ||
          manifest.protocolVersion !== "0.2.0" || typeof manifest.hostVersion !== "string" || typeof manifest.extensionVersion !== "string" || !manifest.files) {
        return { ok: false, error: "Chrome 连接组件与当前系统不匹配。" };
      }
      for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
        if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).some((part) => part === ".." || part === "" || part === ".") || !/^[a-f0-9]{64}$/.test(expectedHash)) {
          return { ok: false, error: "Chrome 连接组件清单无效。" };
        }
        const resourcePath = join(this.bundledRoot, relativePath);
        const resourceInfo = await lstat(resourcePath);
        if (!resourceInfo.isFile()) return { ok: false, error: `Chrome 连接组件不是普通文件：${relativePath}` };
        const actualHash = createHash("sha256").update(await readFile(resourcePath)).digest("hex");
        if (actualHash !== expectedHash) return { ok: false, error: `Chrome 连接组件校验失败：${relativePath}` };
      }
      if (!manifest.files["bin/abb"] || !manifest.files["extension/manifest.json"] || !manifest.files["extension/src/background.js"]) {
        return { ok: false, error: "Chrome 连接组件不完整。" };
      }
      const extensionManifest = JSON.parse(await readFile(join(this.bundledRoot, "extension", "manifest.json"), "utf8")) as Record<string, unknown>;
      if (extensionManifest.version !== manifest.extensionVersion || extensionManifest.manifest_version !== 3 ||
          extensionManifest.name !== "ActSpace Browser" || typeof extensionManifest.key !== "string" || chromeExtensionId(extensionManifest.key) !== EXTENSION_ID) {
        return { ok: false, error: "Chrome 扩展组件身份或版本不匹配。" };
      }
      const staging = `${this.extensionDir}.staging-${randomUUID()}`;
      const backup = `${this.extensionDir}.backup-${randomUUID()}`;
      const binaryBackup = `${this.binPath}.backup-${randomUUID()}`;
      await mkdir(this.pluginRoot, { recursive: true });
      const hadBinary = await stat(this.binPath).then(() => true, () => false);
      const hadExtension = await stat(this.extensionDir).then(() => true, () => false);
      try {
        await cp(join(this.bundledRoot, "extension"), staging, { recursive: true });
        if (hadBinary) await copyFile(this.binPath, binaryBackup);
        const installed = await this.installFromFile(join(this.bundledRoot, "bin", "abb"));
        if (!installed.ok) throw new Error(installed.error ?? "本机组件安装失败。");
        if (hadExtension) await rename(this.extensionDir, backup);
        await rename(staging, this.extensionDir);
        const registration = await this.installNativeHost();
        if (!registration.ok) throw new Error(registration.error ?? "本机组件注册失败。");
        // Keep the previous version until the newly running Host and extension pass the live probe.
      } catch (error) {
        if (await stat(backup).then(() => true, () => false)) {
          await rm(this.extensionDir, { recursive: true, force: true });
          await rename(backup, this.extensionDir);
        } else if (!hadExtension) await rm(this.extensionDir, { recursive: true, force: true });
        if (hadBinary && await stat(binaryBackup).then(() => true, () => false)) {
          await rename(binaryBackup, this.binPath);
          await chmod(this.binPath, 0o755);
          await this.installNativeHost();
        } else if (!hadBinary) await rm(this.binPath, { force: true });
        await rm(binaryBackup, { force: true });
        throw error;
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      this.invalidateStatusState();
      return { ok: true, abbPath: this.binPath, extensionDir: this.extensionDir };
    } catch (error) {
      return { ok: false, error: `准备 Chrome 连接组件失败：${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private async cleanupVerifiedBackups(): Promise<void> {
    const extensionEntries = await readdir(this.pluginRoot).catch(() => []);
    const binaryEntries = await readdir(dirname(this.binPath)).catch(() => []);
    await Promise.allSettled([
      ...extensionEntries.filter((name) => /^extension\.backup-[0-9a-f-]{36}$/.test(name))
        .map((name) => rm(join(this.pluginRoot, name), { recursive: true, force: true })),
      ...binaryEntries.filter((name) => /^abb\.backup-[0-9a-f-]{36}$/.test(name))
        .map((name) => rm(join(dirname(this.binPath), name), { force: true })),
    ]);
  }

  private async readBundledManifest(): Promise<{ hostVersion: string; extensionVersion: string; protocolVersion: string } | undefined> {
    if (!this.bundledRoot) return undefined;
    try {
      const value = JSON.parse(await readFile(join(this.bundledRoot, "manifest.json"), "utf8")) as Record<string, unknown>;
      if (typeof value.hostVersion !== "string" || typeof value.extensionVersion !== "string" || typeof value.protocolVersion !== "string") return undefined;
      return { hostVersion: value.hostVersion, extensionVersion: value.extensionVersion, protocolVersion: value.protocolVersion };
    } catch { return undefined; }
  }

  async installFromFile(sourcePath: string): Promise<BrowserBridgeInstallResult> {
    const tmpPath = `${this.binPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await mkdir(dirname(this.binPath), { recursive: true });
      await copyFile(sourcePath, tmpPath);
      await chmod(tmpPath, 0o755);
      const help = await this.runAbbAt(tmpPath, ["help"]);
      if (!help.ok) {
        const error = `abb help 探测失败：${commandFailureDetail(help)}`;
        this.lastError = error;
        return { ok: false, error };
      }
      if (!help.stdout.includes("Agent Browser Bridge")) {
        const error = "abb help 探测失败：输出不包含 Agent Browser Bridge 标识。";
        this.lastError = error;
        return { ok: false, error };
      }
      await rename(tmpPath, this.binPath);
      await this.writeManagedSkill();
      this.lastError = undefined;
      this.invalidateStatusState();
      this.log("browser-bridge abb installed", { abbPath: this.binPath, skillPath: this.skillPath });
      return { ok: true, abbPath: this.binPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      return { ok: false, error: `安装失败：${message}` };
    } finally {
      await rm(tmpPath, { force: true }).catch(() => {});
    }
  }

  async installNativeHost(): Promise<BrowserBridgeActionResult> {
    if (!(await this.isInstalled())) {
      return { ok: false, error: "browser-bridge 尚未安装，请先编译并安装 abb。" };
    }
    const manifestPath = process.env.ABB_CHROME_MANIFEST_PATH ?? join(homedir(), "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", "com.agent_browser_bridge.host.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      const origins = manifest.allowed_origins;
      if (manifest.name !== "com.agent_browser_bridge.host" || !Array.isArray(origins) || origins.length !== 1 || origins[0] !== "chrome-extension://eneeikpgpieikinaimmgmdiafbgbanei/" ||
          (manifest.path !== this.binPath && manifest.path !== join(this.supportDir(), "abb-native-host"))) {
        return { ok: false, error: "Chrome 已登记其他来源的本机组件。请先检查并移除该登记，再连接 ActSpace。" };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { ok: false, error: "Chrome 本机登记无法读取，请检查权限。" };
    }
    const result = await this.runAbb(["install-native-host", "--binary", this.binPath, "--json"]);
    if (!result.ok) {
      const error = result.error ?? (result.stderr || "Native Messaging host 安装失败。");
      this.lastError = error;
      return { ok: false, error };
    }
    this.lastError = undefined;
    this.invalidateStatusState();
    return { ok: true };
  }

  private async isInstalled(): Promise<boolean> {
    try {
      const binary = await stat(this.binPath);
      return binary.isFile() && (binary.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }

  private runAbb(args: string[]): Promise<AbbCommandResult> {
    return this.runAbbAt(this.binPath, args);
  }

  private runAbbAt(command: string, args: string[]): Promise<AbbCommandResult> {
    return runCommand(command, args, undefined, this.commandTimeoutMs);
  }

  private invalidateStatusState(): void {
    this.statusGeneration += 1;
    this.revision += 1;
    this.statusInFlight = undefined;
    this.statusErrorCache = undefined;
  }

  private async writeManagedSkill(): Promise<void> {
    await mkdir(this.skillDir, { recursive: true });
    await writeFile(this.skillPath, renderManagedSkill(this.binPath), "utf8");
  }
}

/**
 * Browser Bridge 源码在主仓库顶层 `browser-bridge/`，不属于 pnpm Agent package 图。
 */
function resolvePluginDir(repoRoot: string): string {
  return join(repoRoot, "browser-bridge");
}

function renderManagedSkill(abbPath: string): string {
  return [
    "---",
    "name: browser-bridge",
    "description: Use only to diagnose or repair Browser Bridge when the standard browser_* tools report that the native host, socket, or Chrome extension is unavailable.",
    "---",
    "",
    "# Browser Bridge",
    "",
    "Normal browser tasks must use the standard `browser_*` tools exposed by actspace-agent. Do not invoke `abb` through Bash for tabs, page reads, navigation, screenshots, or browser interaction.",
    "",
    "## Diagnostic Command",
    "",
    `- CLI: \`${abbPath}\``,
    "- Always quote the absolute path in bash commands because it may contain spaces.",
    "- Use only `help`, `doctor --json`, `capabilities --json`, or installation/registration commands needed to repair the bridge.",
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

function commandFailureDetail(result: AbbCommandResult): string {
  return result.error ?? (result.stderr || "未知错误");
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

    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: AbbCommandResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

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

    timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 进程可能已退出
      }
      const pid = child.pid ? `，PID ${child.pid}` : "";
      finish({
        ok: false,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: `命令超时（超过 ${Math.round(timeoutMs / 1000)} 秒${pid}，已请求 SIGKILL）`,
      });
    }, timeoutMs);

    child.once("error", (error) => {
      finish({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), error: error.message });
    });
    child.once("close", (code, signal) => {
      if (code === 0) finish({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() });
      else {
        const tail = `${stdout}\n${stderr}`.slice(-BROWSER_BRIDGE_ERROR_TAIL_CHARS).trim();
        const fallback = signal ? `命令被信号 ${signal} 终止` : `命令退出码 ${code ?? "未知"}`;
        finish({ ok: false, stdout: stdout.trim(), stderr: stderr.trim(), error: tail || fallback });
      }
    });
  });
}
