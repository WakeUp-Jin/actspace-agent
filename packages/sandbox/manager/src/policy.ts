import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SandboxCapability, SandboxLimits, SandboxNetwork, SandboxPolicy, SandboxPurpose, SandboxRead, SandboxRequest } from "./types.js";

/** A purpose template. Every field narrows the defaults; a request can only narrow it further. */
export type SandboxTemplate = {
  readonly purpose: SandboxPurpose;
  /** `domains: "requested"` caps the mode at allowlist and lets each request name its domains. */
  readonly network: SandboxNetwork | { readonly mode: "allowlist"; readonly domains: "requested" };
  readonly read: SandboxRead;
  readonly denyRead: readonly string[];
  /** Relative paths denied for writing below every writable root, e.g. `.git/hooks`. */
  readonly denyWriteWithinWritable: readonly string[];
  readonly requiredCapabilities: readonly SandboxCapability[];
};
export type TemplateEnvironment = { readonly homeDir: string; readonly platform: NodeJS.Platform };
export type PolicyResolution = { readonly ok: true; readonly policy: SandboxPolicy } | { readonly ok: false; readonly reasons: readonly string[] };

const DEFAULT_TEMPLATE: Omit<SandboxTemplate, "purpose"> = { network: { mode: "blocked" }, read: { mode: "all" }, denyRead: [], denyWriteWithinWritable: [], requiredCapabilities: ["process.inherit"] };

// Same set as nono's required deny groups, so every backend enforces one explicit policy.
const CREDENTIALS = [".ssh", ".gnupg", ".aws", ".azure", ".config/gcloud", ".gcloud", ".kube", ".docker", ".git-credentials", ".netrc", ".npmrc", ".bunfig.toml", ".config/bun/bunfig.toml", ".vault-token", ".credentials", ".secrets", ".keys", ".pki", ".terraform.d", ".config/op", ".password-store", ".1password"];
const SHELL_HISTORY = [".bash_history", ".zsh_history", ".history", ".python_history"];
const MACOS_PRIVATE = ["Library/Keychains", "Library/Group Containers/2BUA8C4S2C.com.1password", "Library/Application Support/1Password", "Library/Containers/com.1password.1password", "Library/Application Support/Google/Chrome", "Library/Application Support/Chromium", "Library/Application Support/Firefox", "Library/Application Support/Microsoft Edge", "Library/Application Support/Arc", "Library/Application Support/BraveSoftware", "Library/Application Support/Vivaldi", "Library/Application Support/com.operasoftware.Opera", "Library/Safari", "Library/Messages", "Library/Mail", "Library/Cookies", "Library/Containers/com.apple.Safari", "Library/Application Support/MobileSync"];
const LINUX_PRIVATE = [".op", ".local/share/keyrings", ".config/google-chrome", ".config/chromium", ".mozilla/firefox", ".config/microsoft-edge", ".config/BraveSoftware", ".config/vivaldi", ".config/opera"];

export function sandboxTemplate(purpose: SandboxPurpose, environment: TemplateEnvironment): SandboxTemplate | undefined {
  const home = (path: string) => join(environment.homeDir, path);
  const platformPrivate = environment.platform === "darwin" ? [...MACOS_PRIVATE.map(home), "/Library/Keychains"] : environment.platform === "linux" ? LINUX_PRIVATE.map(home) : [];
  const denyRead = [...CREDENTIALS, ...SHELL_HISTORY].map(home).concat(platformPrivate);
  // The candidate writes only its private copy, so nothing inside it needs write protection.
  if (purpose === "evaluation") return Object.freeze<SandboxTemplate>({
    purpose, network: { mode: "allowlist", domains: "requested" }, read: { mode: "all" }, denyRead, denyWriteWithinWritable: [],
    requiredCapabilities: ["filesystem.write", "filesystem.read-deny", "network.allowlist", "process.inherit"],
  });
  if (purpose !== "tool") return undefined;
  return Object.freeze<SandboxTemplate>({
    purpose, network: { mode: "unrestricted" }, read: { mode: "all" },
    denyRead,
    // Hooks and config run outside the sandbox on the user's next git command.
    denyWriteWithinWritable: [".git/hooks", ".git/config"],
    requiredCapabilities: ["filesystem.write", "filesystem.read-deny", "filesystem.write-deny", "process.inherit"],
  });
}

/** Capabilities every request of this template needs, before request-specific narrowing. */
export function templateCapabilities(template: SandboxTemplate): readonly SandboxCapability[] {
  const derived: SandboxCapability[] = [];
  if (template.denyRead.length) derived.push("filesystem.read-deny");
  if (template.denyWriteWithinWritable.length) derived.push("filesystem.write-deny");
  if (template.network.mode === "blocked") derived.push("network.blocked");
  if (template.network.mode === "allowlist") derived.push("network.allowlist");
  return unique([...DEFAULT_TEMPLATE.requiredCapabilities, ...template.requiredCapabilities, ...derived]).sort();
}

/** default → purpose template → request. Returns reasons instead of widening anything. */
export async function resolvePolicy(request: SandboxRequest, template: SandboxTemplate | undefined): Promise<PolicyResolution> {
  if (!template) return { ok: false, reasons: [`No sandbox template for purpose "${request.purpose}".`] };
  const reasons: string[] = [];
  const absolute = (label: string) => (path: string) => { if (!isAbsolute(path)) reasons.push(`${label} must be absolute: ${path}`); return path; };
  if (request.argv.length === 0 || !request.argv[0]) reasons.push("argv must name a program.");
  for (const path of [request.cwd, request.scratchDir]) absolute("Path")(path);
  const fs = request.filesystem ?? {};
  [...fs.readWrite ?? [], ...fs.denyRead ?? [], ...fs.denyWrite ?? [], ...fs.read?.mode === "only" ? fs.read.paths : []].forEach(absolute("Filesystem path"));
  const requestedNetwork: SandboxNetwork = request.network ?? (template.network.mode === "allowlist" && template.network.domains === "requested" ? { mode: "blocked" } : template.network as SandboxNetwork);
  const network = narrowNetwork(template.network, requestedNetwork);
  if (!network) reasons.push(`Network ${requestedNetwork.mode} is wider than the ${template.purpose} template allows (${template.network.mode}).`);
  else if (network.mode === "allowlist") reasons.push(...allowlistProblems(network));
  const read = narrowRead(template.read, fs.read ?? template.read);
  if (!read) reasons.push(`Read access is wider than the ${template.purpose} template allows.`);
  if (request.timeoutMs !== undefined && !positive(request.timeoutMs)) reasons.push("timeoutMs must be a positive integer.");
  const limits = request.limits && Object.fromEntries(Object.entries(request.limits).filter(([, value]) => value !== undefined)) as SandboxLimits;
  if (limits && Object.values(limits).some(value => !positive(value))) reasons.push("limits must be positive integers.");
  if (reasons.length) return { ok: false, reasons };

  const readWrite = await canonicalAll(fs.readWrite ?? []);
  const denyRead = await canonicalAll([...template.denyRead, ...DEFAULT_TEMPLATE.denyRead, ...fs.denyRead ?? []]);
  const derivedDenyWrite = readWrite.flatMap(root => template.denyWriteWithinWritable.map(path => join(root, path)));
  const denyWrite = await canonicalAll([...derivedDenyWrite, ...fs.denyWrite ?? []]);
  const readPolicy: SandboxRead = read!.mode === "all" ? read! : { mode: "only", paths: await canonicalAll(read!.paths) };
  for (const root of readWrite) {
    if (root === "/") reasons.push("The filesystem root cannot be writable.");
    for (const denied of denyRead) if (contains(root, denied) || contains(denied, root)) reasons.push(`Writable path ${root} overlaps denied read path ${denied}.`);
  }
  if (reasons.length) return { ok: false, reasons };

  const derived: SandboxCapability[] = ["process.inherit"];
  if (readWrite.length) derived.push("filesystem.write");
  if (denyRead.length) derived.push("filesystem.read-deny");
  if (denyWrite.length) derived.push("filesystem.write-deny");
  if (network!.mode === "blocked") derived.push("network.blocked");
  if (network!.mode === "allowlist") derived.push("network.allowlist");
  if (network!.mode === "allowlist" && network!.localPorts?.length) derived.push("network.local-ports");
  if (network!.mode === "allowlist" && network!.upstreamProxy) derived.push("network.upstream-proxy");
  if (network!.mode === "allowlist" && network!.credentials?.length) derived.push("network.credential-injection");
  if (limits && Object.keys(limits).length) derived.push("process.resource-limits");
  const requiredCapabilities = unique([...DEFAULT_TEMPLATE.requiredCapabilities, ...template.requiredCapabilities, ...request.requiredCapabilities ?? [], ...derived]).sort() as SandboxCapability[];
  const filesystem = Object.freeze({ read: readPolicy, readWrite, denyRead, denyWrite });
  const bounds = { purpose: request.purpose, isolation: request.isolation, filesystem, network: network!, requiredCapabilities, timeoutMs: request.timeoutMs ?? null, limits: limits ?? null };
  const policy: SandboxPolicy = {
    purpose: request.purpose, isolation: request.isolation, argv: Object.freeze([...request.argv]), cwd: resolve(request.cwd), env: Object.freeze({ ...request.env }), scratchDir: resolve(request.scratchDir),
    filesystem, network: network!, requiredCapabilities: Object.freeze(requiredCapabilities), ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(limits ? { limits: Object.freeze(limits) } : {}),
    fingerprint: createHash("sha256").update(stable(bounds)).digest("hex"),
  };
  return { ok: true, policy: Object.freeze(policy) };
}

function narrowNetwork(allowed: SandboxTemplate["network"], requested: SandboxNetwork): SandboxNetwork | undefined {
  const rank = { blocked: 0, allowlist: 1, unrestricted: 2 } as const;
  if (rank[requested.mode] > rank[allowed.mode]) return undefined;
  if (requested.mode !== "allowlist") return { mode: requested.mode };
  const network = normalizeAllowlist(requested);
  if (allowed.mode === "allowlist" && allowed.domains !== "requested") {
    const template = normalizeAllowlist(allowed);
    const within = (values: readonly (string | number)[] | undefined, limit: readonly (string | number)[] | undefined) => (values ?? []).every(value => (limit ?? []).includes(value));
    if (!within(network.domains, template.domains) || !within(network.localPorts, template.localPorts)
      || network.upstreamProxy !== template.upstreamProxy || !within(network.credentials?.map(stable), template.credentials?.map(stable))) return undefined;
  }
  return network;
}
/** Lowercase, deduplicated, sorted; empty optional lists are dropped so equal policies fingerprint equally. */
function normalizeAllowlist(network: Extract<SandboxNetwork, { mode: "allowlist" }>): Extract<SandboxNetwork, { mode: "allowlist" }> {
  const domains = unique(network.domains.map(domain => domain.trim().toLowerCase().replace(/\.$/, ""))).sort();
  const localPorts = unique(network.localPorts ?? []).sort((a, b) => a - b);
  const credentials = [...network.credentials ?? []].sort((a, b) => stable(a).localeCompare(stable(b)));
  return Object.freeze({ mode: "allowlist", domains, ...localPorts.length ? { localPorts } : {}, ...network.upstreamProxy ? { upstreamProxy: network.upstreamProxy } : {}, ...credentials.length ? { credentials } : {} });
}
const DOMAIN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
function allowlistProblems(network: Extract<SandboxNetwork, { mode: "allowlist" }>): string[] {
  const problems = network.domains.filter(domain => !DOMAIN.test(domain)).map(domain => `Invalid allowlist domain: ${domain}`);
  if (!network.domains.length && !network.localPorts?.length) problems.push("An allowlist needs at least one domain or local port; use network blocked instead.");
  for (const port of network.localPorts ?? []) if (!Number.isInteger(port) || port < 1 || port > 65_535) problems.push(`Invalid local port: ${port}`);
  const proxy = network.upstreamProxy === undefined ? undefined : /^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\]):(\d{1,5})$/.exec(network.upstreamProxy);
  if (proxy === null || proxy && (Number(proxy[2]) < 1 || Number(proxy[2]) > 65_535)) problems.push(`upstreamProxy must be host:port: ${network.upstreamProxy}`);
  return problems;
}
function narrowRead(allowed: SandboxRead, requested: SandboxRead): SandboxRead | undefined {
  if (allowed.mode === "all") return requested;
  if (requested.mode === "all") return undefined;
  return requested.paths.every(path => allowed.paths.some(root => contains(root, resolve(path)))) ? requested : undefined;
}

/** Resolve symlinks of the longest existing prefix so policies compare real locations. */
export async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch {
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(await canonicalPath(parent), basename(absolute));
  }
}
async function canonicalAll(paths: readonly string[]): Promise<readonly string[]> { return Object.freeze(unique(await Promise.all(paths.map(canonicalPath))).sort()); }
export function contains(root: string, candidate: string): boolean { const nested = relative(root, candidate); return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested)); }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function positive(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) > 0; }
export function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}
