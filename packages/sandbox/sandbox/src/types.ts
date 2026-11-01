/** Host port: the only place that starts processes. Sandbox plugins build on it; they never decide whether to sandbox. */
export const SANDBOX_HOST_PORT_ID = "actspace.host.sandbox" as const;
export const SANDBOX_SERVICE_ID = "sandbox" as const;

export type OutputChunk = { readonly stream: "stdout" | "stderr"; readonly text: string };
export type HostProcessSpec = { readonly command: string; readonly args: readonly string[]; readonly cwd: string; readonly env: NodeJS.ProcessEnv };
export type HostProcessExit = { readonly exitCode: number | null; readonly signal: NodeJS.Signals | null; readonly startError?: string };
export interface HostProcess {
  readonly pid: number | undefined;
  onOutput(listener: (chunk: OutputChunk) => void): void;
  /** Resolves once the process exited and its stdio closed. */
  readonly exited: Promise<HostProcessExit>;
  /** Signals the whole process group (single process on Windows). */
  signalGroup(signal: "SIGTERM" | "SIGKILL"): void;
  /** Whether any process of the group is still alive after the leader exited. */
  groupAlive(): boolean;
}
export interface SandboxHostPort {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly resources: { readonly nonoPath?: string };
  /** Set only by an explicit Host launch flag: this process already runs inside an outer sandbox. */
  readonly inherited?: true;
  spawn(spec: HostProcessSpec): HostProcess;
  /** Bounded helper for backend probes. */
  run(spec: HostProcessSpec & { readonly timeoutMs: number }): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string; readonly error?: string }>;
}

export type SandboxPurpose = "tool" | "evaluation";
export type SandboxNetwork =
  | { readonly mode: "unrestricted" }
  | { readonly mode: "blocked" }
  | {
    readonly mode: "allowlist";
    readonly domains: readonly string[];
    /** Loopback ports reachable directly; clients bypass the proxy for 127.0.0.1 and localhost. */
    readonly localPorts?: readonly number[];
    /** `host:port` of the proxy that allowed connections go through. */
    readonly upstreamProxy?: string;
    /** Reserved: no backend injects credentials yet. */
    readonly credentials?: readonly SandboxCredential[];
  };
export type SandboxCredential = { readonly domain: string; readonly header: string; readonly source: { readonly env: string } };
/** Reserved: no backend enforces limits yet. */
export type SandboxLimits = { readonly memoryBytes?: number; readonly cpuSeconds?: number };
export type SandboxRead = { readonly mode: "all" } | { readonly mode: "only"; readonly paths: readonly string[] };
export const SANDBOX_CAPABILITIES = Object.freeze(["filesystem.write", "filesystem.read-deny", "filesystem.write-deny", "network.blocked", "network.allowlist", "network.local-ports", "network.upstream-proxy", "network.credential-injection", "process.inherit", "process.resource-limits"] as const);
export type SandboxCapability = (typeof SANDBOX_CAPABILITIES)[number];
export type CapabilityLevel = "full" | "partial" | "unsupported";
export type CapabilityLevels = Readonly<Record<SandboxCapability, CapabilityLevel>>;

/** What the caller needs. The manager merges it over defaults and the purpose template; it can only narrow. */
export type SandboxRequest = {
  readonly purpose: SandboxPurpose;
  /** `none` is only for execution outside the sandbox that the user already approved. */
  readonly isolation: "sandboxed" | "none";
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly filesystem?: { readonly read?: SandboxRead; readonly readWrite?: readonly string[]; readonly denyRead?: readonly string[]; readonly denyWrite?: readonly string[] };
  readonly network?: SandboxNetwork;
  readonly timeoutMs?: number;
  readonly limits?: SandboxLimits;
  readonly requiredCapabilities?: readonly SandboxCapability[];
  /** Private directory for this execution; backends write their policy files here. */
  readonly scratchDir: string;
};
export type SandboxFilesystemPolicy = { readonly read: SandboxRead; readonly readWrite: readonly string[]; readonly denyRead: readonly string[]; readonly denyWrite: readonly string[] };
/** Fixed once resolved: canonical absolute paths, merged limits, derived capabilities. */
export type SandboxPolicy = {
  readonly purpose: SandboxPurpose;
  readonly isolation: "sandboxed" | "none";
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly scratchDir: string;
  readonly filesystem: SandboxFilesystemPolicy;
  readonly network: SandboxNetwork;
  readonly requiredCapabilities: readonly SandboxCapability[];
  readonly timeoutMs?: number;
  readonly limits?: SandboxLimits;
  /** sha256 over the limits only (not argv/env), stable across equal policies. */
  readonly fingerprint: string;
};

export type BackendProbe = { readonly available: true; readonly version: string; readonly capabilities: CapabilityLevels } | { readonly available: false; readonly reason: string };
export type PreparedLaunch = { readonly spawn: HostProcessSpec; dispose(): Promise<void> };
export interface SandboxBackend {
  readonly id: string;
  /** Higher wins: nono 100, seatbelt 50. */
  readonly priority: number;
  probe(): Promise<BackendProbe>;
  prepare(policy: SandboxPolicy): Promise<PreparedLaunch>;
}

export type SandboxOutcome =
  | { readonly status: "prepare_failed"; readonly reasons: readonly string[] }
  | { readonly status: "exited"; readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }
  | { readonly status: "timed_out" | "cancelled"; readonly exitCode: number | null; readonly signal: NodeJS.Signals | null; readonly residual: boolean };
export type SandboxIsolation = "sandboxed" | "inherited" | "none";
export type SandboxFacts = {
  readonly isolation: SandboxIsolation;
  readonly backend?: { readonly id: string; readonly version: string };
  readonly capabilities?: CapabilityLevels;
  readonly policyFingerprint?: string;
  readonly cleanup: "ok" | { readonly failed: string };
};
export type SandboxResult = { readonly outcome: SandboxOutcome; readonly facts: SandboxFacts };
export interface SandboxExecution {
  onOutput(listener: (chunk: OutputChunk) => void): void;
  /** SIGTERM to the group, SIGKILL after the grace period, then residue is reported. */
  terminate(): void;
  forceTerminate(): void;
  readonly result: Promise<SandboxResult>;
}

export type SandboxStatus = { readonly available: boolean; readonly isolation: "sandboxed" | "inherited"; readonly backend?: { readonly id: string; readonly version: string }; readonly reasons: readonly string[] };
export interface SandboxService {
  /** Returns the unregister function. */
  register(backend: SandboxBackend): () => void;
  status(purpose?: SandboxPurpose): Promise<SandboxStatus>;
  run(request: SandboxRequest): SandboxExecution;
}
/** No options: inherited mode comes from the Host port, so a Harness composition cannot turn the sandbox off. */
export type SandboxManagerConfig = Record<string, never>;
