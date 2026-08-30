import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  COMPOSITION_SOURCES,
  EVENT_SOURCES,
  GENERATOR_VERSION,
  MANIFEST_PATHS,
  PACKAGE_PATHS,
  SERVICE_SOURCE,
  VERIFICATION_SOURCES,
} from "./source-registry.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "../..");
const jsonOutput = "artifacts/agent-contract-matrix.json";
const markdownOutput = "docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md";

const TEST_BY_KIND = Object.freeze({
  service: ["cordis-adapter/service-contract"],
  event: ["session-journal/core-codec-contract", "cordis-adapter/event-contract"],
  session: ["session-journal/core-codec-contract", "session-persistence/provider-seam"],
  capability: ["composition/admission-contract"],
  plugin: ["cordis-adapter/event-contract", "cordis-adapter/service-contract"],
  package: ["composition/admission-contract"],
  verification: [],
});

const SESSION_SURFACES = Object.freeze({
  "turn/start": "internal",
  "turn/end": "internal",
  "step/start": "internal",
  "step/end": "internal",
  "user/message": "user",
  "assistant/chunk": "assistant",
  "assistant/message": "assistant",
  "tool/call": "internal",
  "tool/result": "tool-result",
  "todo/write": "internal",
  "request/header": "internal",
  "request/context": "internal",
  "session/end-seed": "internal",
});

const LOOP_META = Object.freeze({
  "system-prompt/assemble": { mode: "waterfall", scope: "agent", containment: "request-reject" },
  "agent/pre-step": { mode: "waterfall", scope: "agent", containment: "step-skip-or-rewrite" },
  "agent/request": { mode: "waterfall", scope: "agent", containment: "request-reject" },
  "llm/stream": { mode: "waterfall", scope: "agent", containment: "abort-or-replace" },
  "agent/request-error": { mode: "waterfall", scope: "agent", containment: "retry-abort-escalate" },
  "tools/pre-execute": { mode: "waterfall", scope: "agent", containment: "deny-or-rewrite" },
  "tools/execute": { mode: "waterfall", scope: "agent", containment: "wrap-or-replace" },
  "tools/post-execute": { mode: "waterfall", scope: "agent", containment: "result-fail-or-redact" },
  "agent/turn-stopping": { mode: "serial", scope: "agent", containment: "stop-or-continue" },
});

const NOTIFICATION_META = Object.freeze({
  "agent/session-start": { scope: "agent", containment: "observer-isolated" },
  "agent/status": { scope: "agent", containment: "observer-isolated" },
  "agent/error": { scope: "agent", containment: "observer-isolated" },
  "tools/result": { scope: "tool", containment: "observer-isolated" },
  "session/event": { scope: "session", containment: "post-commit-observer-isolated" },
});

const readCache = new Map();

async function readRelative(relativePath) {
  const cached = readCache.get(relativePath);
  if (cached !== undefined) return cached;
  const absolutePath = resolve(repoRoot, relativePath);
  const value = await readFile(absolutePath, "utf8");
  readCache.set(relativePath, value);
  return value;
}

async function assertRelativePath(relativePath) {
  if (!relativePath || relativePath.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(relativePath)) throw new Error(`Absolute source path is forbidden: ${relativePath}`);
  try {
    await access(resolve(repoRoot, relativePath));
  } catch {
    throw new Error(`Missing allowlisted source: ${relativePath}`);
  }
}

function quotedStrings(fragment) {
  return [...fragment.matchAll(/"([^"\n]+)"|'([^'\n]+)'/gu)].map((match) => match[1] ?? match[2]).filter(Boolean);
}

function extractArray(source, marker) {
  const match = source.match(new RegExp(`${marker}\\s*=\\s*(?:Object\\.freeze\\(\\s*)?\\[([\\s\\S]*?)\\]`, "u"));
  if (!match) throw new Error(`Could not parse array ${marker}`);
  return quotedStrings(match[1]);
}

function extractUnion(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?);`, "u"));
  if (!match) throw new Error(`Could not parse union ${typeName}`);
  return quotedStrings(match[1]);
}

function sourceRef(path, symbol) {
  return `${path}#${symbol}`;
}

function stableSort(rows) {
  return [...rows].sort((left, right) => `${left.kind}\u0000${left.id}`.localeCompare(`${right.kind}\u0000${right.id}`));
}

function row(kind, id, owner, status, sourceRefs, extra = {}) {
  return Object.freeze({ kind, id, owner, status, sourceRefs: Object.freeze([...sourceRefs]), tests: Object.freeze([...(TEST_BY_KIND[kind] ?? [])]), ...extra });
}

async function parseEvents() {
  const journalSource = await readRelative(EVENT_SOURCES.sessionCore.path);
  const eventSource = await readRelative(EVENT_SOURCES.loopInterventions.path);
  const core = extractArray(journalSource, "export const CORE_EVENT_TYPES");
  const extensions = extractArray(journalSource, "export const PERSISTED_EXTENSION_EVENT_TYPES");
  const interventions = extractUnion(eventSource, "AgentLoopIntervention");
  const notifications = extractUnion(eventSource, "AgentNotification");
  if (core.length !== 13) throw new Error(`Expected 13 Session core events, found ${core.length}.`);
  if (interventions.length !== 9) throw new Error(`Expected 9 Agent Loop interventions, found ${interventions.length}.`);
  if (notifications.length !== 5) throw new Error(`Expected 5 notifications, found ${notifications.length}.`);

  const rows = [];
  for (const id of core) rows.push(row("event", `session:${id}`, "@actspace/session-journal", "active", [sourceRef(EVENT_SOURCES.sessionCore.path, EVENT_SOURCES.sessionCore.symbol)], { plane: "session", category: "core", eventType: id, scope: "session", surface: SESSION_SURFACES[id] ?? "internal", codecStatus: "present", producerStatus: "present", required: true }));
  for (const id of extensions) {
    const future = id === "goal/change" || id === "schedule/change";
    rows.push(row("event", `session:${id}`, "@actspace/session-journal", future ? "unimplemented" : "active", [sourceRef(EVENT_SOURCES.sessionExtensions.path, EVENT_SOURCES.sessionExtensions.symbol)], { plane: "session", category: "extension", eventType: id, scope: "session", surface: "internal", codecStatus: "present", producerStatus: future ? "not-implemented" : "none", required: true }));
  }
  for (const id of interventions) rows.push(row("event", `intervention:${id}`, "@actspace/cordis-adapter", "active", [sourceRef(EVENT_SOURCES.loopInterventions.path, EVENT_SOURCES.loopInterventions.symbol)], { plane: "intervention", category: "agent-loop", eventType: id, scope: LOOP_META[id]?.scope ?? "agent", mode: LOOP_META[id]?.mode ?? "waterfall", containment: LOOP_META[id]?.containment ?? "defined", codecStatus: "n/a", producerStatus: "present", required: true }));
  for (const id of notifications) rows.push(row("event", `notification:${id}`, "@actspace/cordis-adapter", "active", [sourceRef(EVENT_SOURCES.notifications.path, EVENT_SOURCES.notifications.symbol)], { plane: "notification", category: "notification", eventType: id, scope: NOTIFICATION_META[id]?.scope ?? "runtime", containment: NOTIFICATION_META[id]?.containment ?? "observer-isolated", mode: "emit", codecStatus: "n/a", producerStatus: "present", required: true }));
  return stableSort(rows);
}

function parseField(call, field) {
  const match = call.match(new RegExp(`${field}\\s*:\\s*([^,}]+)`, "u"));
  return match?.[1]?.trim();
}

function parseArrayField(call, field) {
  const match = call.match(new RegExp(`${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "u"));
  return match ? quotedStrings(match[1]) : [];
}

function parseManifestSource(path, source) {
  const callMatch = source.match(/defineBuiltinPluginManifest\(\{([\s\S]*?)\}\);/u);
  if (!callMatch) throw new Error(`Could not parse manifest call: ${path}`);
  const call = callMatch[1];
  const pluginId = parseField(call, "pluginId")?.replace(/\s+/gu, "") ?? "";
  const pluginConstant = pluginId.match(/([A-Z0-9_]+)$/u)?.[1];
  const resolvedPluginId = pluginId.startsWith("\"") ? pluginId.slice(1, -1) : parseConstantString(source, pluginConstant) ?? pluginId;
  const version = parseField(call, "version")?.replace(/^"|"$/gu, "") ?? "";
  const name = parseField(call, "name")?.replace(/^"|"$/gu, "") ?? "";
  const entryMatch = call.match(/entry\s*:\s*\{([\s\S]*?)\}/u);
  const entry = entryMatch?.[1] ?? "";
  const entryId = parseField(entry, "entryId")?.replace(/^"|"$/gu, "") ?? "";
  const behavior = parseField(entry, "behavior")?.replace(/^"|"$/gu, "") ?? "";
  const codec = parseField(entry, "codec")?.replace(/^"|"$/gu, "");
  const hostMatch = call.match(/host\s*:\s*\{([\s\S]*?)\}/u);
  const host = hostMatch?.[1] ?? "";
  const requiredCapabilities = parseArrayField(host, "required");
  const optionalCapabilities = parseArrayField(host, "optional");
  const contributionsMatch = call.match(/contributions\s*:\s*\{([\s\S]*?)\}/u);
  const contributions = contributionsMatch?.[1] ?? "";
  const services = resolveArrayField(source, contributions, "services");
  const tools = resolveArrayField(source, contributions, "tools");
  const prompts = resolveArrayField(source, contributions, "prompts");
  const events = resolveArrayField(source, contributions, "events");
  const injects = parseArrayField(call, "injects");
  if (!resolvedPluginId || !entryId || !name) throw new Error(`Incomplete manifest ${path}.`);
  return Object.freeze({ path, pluginId: resolvedPluginId, version, name, entryId, behavior, codec: codec || null, requiredCapabilities, optionalCapabilities, services, tools, prompts, events, injects, required: parseField(entry, "required") !== "false", enabled: parseField(entry, "enabled") !== "false" });
}

function parseConstantString(source, name) {
  if (!name) return undefined;
  return source.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "u"))?.[1];
}

function resolveArrayField(source, fragment, field) {
  const array = fragment.match(new RegExp(`${field}\\s*:\\s*\\[([^\\]]*)\\]`, "u"));
  if (array) return quotedStrings(array[1]);
  const direct = fragment.match(new RegExp(`${field}\\s*:\\s*([^,]+)`, "u"))?.[1]?.trim();
  if (!direct) return [];
  if (direct.startsWith("[")) return quotedStrings(direct);
  const constant = direct.match(/([A-Z0-9_]+)\.([a-zA-Z0-9_]+)/u);
  if (constant) {
    const match = source.match(new RegExp(`${constant[1]}[\\s\\S]*?${constant[2]}\\s*:\\s*Object\\.freeze\\(\\[([^\\]]*)\\]`, "u"));
    if (match) return quotedStrings(match[1]);
  }
  return [];
}

async function parseManifests() {
  const manifests = [];
  for (const path of MANIFEST_PATHS) manifests.push(parseManifestSource(path, await readRelative(path)));
  const pluginIds = new Set();
  const entryIds = new Set();
  const rows = [];
  for (const manifest of manifests) {
    if (pluginIds.has(manifest.pluginId)) throw new Error(`Duplicate plugin id ${manifest.pluginId}.`);
    pluginIds.add(manifest.pluginId);
    if (entryIds.has(manifest.entryId)) throw new Error(`Duplicate Entry id ${manifest.entryId}.`);
    entryIds.add(manifest.entryId);
    const provided = new Set(manifest.services);
    if (provided.size !== manifest.services.length) throw new Error(`Manifest ${manifest.pluginId} repeats a provided service.`);
    rows.push(row("plugin", manifest.pluginId, manifest.pluginId, manifest.enabled ? (manifest.required ? "active" : "optional") : "degraded", [sourceRef(manifest.path, "manifest")], { version: manifest.version, name: manifest.name, entryId: manifest.entryId, behavior: manifest.behavior, codec: manifest.codec, required: manifest.required, enabled: manifest.enabled, provides: [...manifest.services].sort(), injects: [...manifest.injects].sort(), tools: [...manifest.tools].sort(), prompts: [...manifest.prompts].sort(), events: [...manifest.events].sort(), requiredCapabilities: [...manifest.requiredCapabilities].sort(), optionalCapabilities: [...manifest.optionalCapabilities].sort() }));
  }
  return { manifests, rows: stableSort(rows) };
}

async function parseServices() {
  const source = await readRelative(SERVICE_SOURCE.path);
  const idsObject = source.match(/ACTSPACE_SERVICE_IDS[\s\S]*?= Object\.freeze\(\{([\s\S]*?)\}\s*as const\)/u)?.[1] ?? "";
  const ids = new Map([...idsObject.matchAll(/([a-zA-Z0-9_]+)\s*:\s*serviceId\("([^"]+)"\)/gu)].map((match) => [match[1], match[2]]));
  const definitionsObject = source.match(/ACTSPACE_SERVICE_DEFINITIONS[\s\S]*?= Object\.freeze\(\{([\s\S]*?)\}\);/u)?.[1] ?? "";
  const roles = [...source.matchAll(/serviceRole\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[([^\]]*)\]\)/gu)].map((match) => ({ key: match[1], providerOwner: match[2], providerId: match[3], consumers: quotedStrings(match[4]) }));
  const rows = [];
  for (const role of roles) {
    const definitionMatch = definitionsObject.match(new RegExp(`${role.key}:\\s*defineServiceDefinition\\(\\{([\\s\\S]*?)\\}\\)`, "u"));
    if (!definitionMatch) throw new Error(`Missing Service Definition ${role.key}.`);
    const definition = definitionMatch[1];
    const idKey = definition.match(/id:\s*ACTSPACE_SERVICE_IDS\.([a-zA-Z0-9_]+)/u)?.[1];
    const id = ids.get(idKey);
    const owner = definition.match(/owner:\s*"([^"]+)"/u)?.[1];
    const scope = definition.match(/scope:\s*"([^"]+)"/u)?.[1] ?? "root";
    const required = !/required:\s*false/u.test(definition);
    const description = definition.match(/description:\s*"([^"]+)"/u)?.[1] ?? "";
    const publicSurface = quotedStrings(definition.match(/publicSurface:\s*\[([^\]]*)\]/u)?.[1] ?? "");
    if (!id || !owner || !description) throw new Error(`Incomplete Service Definition ${role.key}.`);
    rows.push(row("service", id, owner, required ? "active" : "optional", [sourceRef(SERVICE_SOURCE.path, `${SERVICE_SOURCE.definitionsSymbol}.${role.key}`)], { abiVersion: 1, scope, required, description, providerId: role.providerId, providerOwner: role.providerOwner, consumerIds: [...role.consumers].sort(), publicSurface, configSchema: { type: "object" } }));
  }
  return stableSort(rows);
}

async function parseCapabilities(manifests) {
  const owners = new Map();
  for (const manifest of manifests) {
    for (const capability of manifest.requiredCapabilities) owners.set(capability, { requiredBy: new Set([...(owners.get(capability)?.requiredBy ?? []), manifest.pluginId]), optionalBy: owners.get(capability)?.optionalBy ?? new Set() });
    for (const capability of manifest.optionalCapabilities) owners.set(capability, { requiredBy: owners.get(capability)?.requiredBy ?? new Set(), optionalBy: new Set([...(owners.get(capability)?.optionalBy ?? []), manifest.pluginId]) });
  }
  return stableSort([...owners].map(([id, value]) => row("capability", id, "@actspace/cordis-adapter", value.requiredBy.size > 0 ? "active" : "optional", [sourceRef("packages/cordis-adapter/src/manifest.ts", "PluginHostRequirement")], { requiredBy: [...value.requiredBy].sort(), optionalBy: [...value.optionalBy].sort(), required: value.requiredBy.size > 0 })));
}

async function parsePackages() {
  const rows = [];
  for (const path of PACKAGE_PATHS) {
    const packageJson = JSON.parse(await readRelative(path));
    const id = packageJson.name ?? path.replace(/\/package\.json$/u, "");
    const exports = packageJson.exports && typeof packageJson.exports === "object" ? Object.keys(packageJson.exports).sort() : [];
    if (!packageJson.private && !exports.includes(".")) throw new Error(`Package ${id} is missing public exports.`);
    rows.push(row("package", id, id, "active", [sourceRef(path, "package.json")], { path, exports, dependencies: Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.optionalDependencies ?? {}), ...(packageJson.peerDependencies ?? {}) }).sort(), packageRole: path.startsWith("apps/") ? "host" : "domain" }));
  }
  return stableSort(rows);
}

async function parseComposition() {
  const bundleRows = [];
  for (const path of ["packages/runtime/src/profiles/base.bundle.ts", "packages/runtime/src/profiles/kernel.bundle.ts"]) {
    const source = await readRelative(path);
    const match = source.match(/export const ([A-Z_]+) = Object\.freeze\(\{\s*id:\s*"([^"]+)",\s*version:\s*"([^"]+)",\s*entries:\s*Object\.freeze\(\[([^\]]*)\]\)/u);
    if (!match) throw new Error(`Could not parse bundle ${path}.`);
    bundleRows.push({ id: match[2], version: match[3], entries: quotedStrings(match[4]), sourceRefs: [sourceRef(path, match[1])] });
  }
  const desktopBundleSource = await readRelative("packages/desktop-app/src/bundle.ts");
  const desktopBundle = desktopBundleSource.match(/id:\s*"([^"]+)"[\s\S]*?version:\s*manifest\.version/u);
  if (desktopBundle) bundleRows.push({ id: desktopBundle[1], version: "0.1.0", entries: ["desktop.app"], sourceRefs: [sourceRef("packages/desktop-app/src/bundle.ts", "DESKTOP_APP_BUNDLE")] });
  bundleRows.push({ id: "actspace.headless", version: "0.1.0", entries: ["headless.runner"], sourceRefs: [sourceRef("packages/headless/src/manifest.ts", "manifest")] });
  const profileSource = await readRelative("packages/runtime/src/profiles/composition.ts");
  const profiles = [
    { id: "actspace.headless", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["actspace.kernel", "actspace.base", "actspace.headless"] },
    { id: "actspace.desktop", runtimeContract: "actspace.runtime.v2", orderedBundleIds: ["actspace.kernel", "actspace.base", "actspace.desktop-app"] },
  ].map((profile) => ({ ...profile, sourceRefs: [sourceRef("packages/runtime/src/profiles/composition.ts", "profileDefinitions")] }));
  if (!profileSource.includes("RUNTIME_PROFILE_IDS.headless") || !profileSource.includes("RUNTIME_PROFILE_IDS.desktop")) throw new Error("Could not parse runtime Profile declarations.");
  return Object.freeze({ profiles, bundles: bundleRows.sort((a, b) => a.id.localeCompare(b.id)), patches: { supportedKinds: ["insert", "replace-config", "disable", "remove"], sourceRefs: [sourceRef("packages/bundle/src/index.ts", "PatchOperation"), sourceRef("packages/composition/src/compose.ts", "composeRuntime")] } });
}

async function parseVerification() {
  const rows = [];
  for (const entry of VERIFICATION_SOURCES) {
    const status = await access(resolve(repoRoot, entry.path)).then(() => "active").catch(() => "missing");
    rows.push(row("verification", entry.id, "@actspace/verification", status, [sourceRef(entry.path, entry.kind)], { evidenceKind: entry.kind, required: true }));
  }
  return stableSort(rows);
}

export function validateRows(matrix) {
  const diagnostics = [];
  for (const kind of ["services", "events", "sessions", "capabilities", "plugins", "packages", "verification"]) {
    const rows = matrix[kind];
    const seen = new Set();
    for (const item of rows) {
      if (seen.has(item.id)) diagnostics.push({ severity: "error", code: "DUPLICATE_ID", message: `${kind} duplicates ${item.id}` });
      seen.add(item.id);
      if (!item.owner || item.sourceRefs.length === 0) diagnostics.push({ severity: "error", code: "INCOMPLETE_ROW", message: `${kind}:${item.id} must have owner and sourceRefs` });
      if (item.sourceRefs.some((ref) => ref.startsWith("/") || ref.includes("\\"))) diagnostics.push({ severity: "error", code: "ABSOLUTE_SOURCE_REF", message: `${kind}:${item.id} has an unsafe sourceRef` });
    }
  }
  const requiredServices = new Set(matrix.services.filter((item) => item.required).map((item) => item.id));
  for (const service of matrix.services) if (!service.providerId) diagnostics.push({ severity: "error", code: "MISSING_PROVIDER", message: `Service ${service.id} has no Provider.` });
  const core = matrix.events.filter((item) => item.category === "core");
  const interventions = matrix.events.filter((item) => item.category === "agent-loop");
  const notifications = matrix.events.filter((item) => item.category === "notification");
  if (core.length !== 13 || interventions.length !== 9 || notifications.length !== 5) diagnostics.push({ severity: "error", code: "EVENT_COUNT_DRIFT", message: `Expected 13/9/5 event surfaces, got ${core.length}/${interventions.length}/${notifications.length}.` });
  for (const item of matrix.events.filter((event) => event.category === "notification")) if (item.mode === "waterfall") diagnostics.push({ severity: "error", code: "NOTIFICATION_VETO", message: `${item.eventType} cannot be a waterfall/veto event.` });
  if (requiredServices.size === 0) diagnostics.push({ severity: "warning", code: "NO_REQUIRED_SERVICES", message: "No required Service Definitions were found." });
  return diagnostics;
}

function canonical(value) {
  return JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

export function renderMarkdown(matrix) {
  const lines = [
    "# Agent Contract Matrix",
    "",
    "> Generated artifact; edit source declarations instead. Do not hand-edit this file.",
    `> Generator ${matrix.generatorVersion}; source digest \`${matrix.sourceDigest}\`.`,
    "",
    "This document is an audit view of the current ActSpace v2 declarations. It never activates Runtime services, plugins, Session persistence, tools or Cordis entries.",
    "",
    `- Services: ${matrix.services.length}`,
    `- Events: ${matrix.events.length} (Session core ${matrix.events.filter((item) => item.category === "core").length}, Loop interventions ${matrix.events.filter((item) => item.category === "agent-loop").length}, notifications ${matrix.events.filter((item) => item.category === "notification").length})`,
    `- Plugins: ${matrix.plugins.length}`,
    `- Packages: ${matrix.packages.length}`,
    "",
  ];
  renderSection(lines, "Services", matrix.services, ["id", "owner", "status", "scope", "providerId", "consumerIds", "sourceRefs", "tests"]);
  renderSection(lines, "Events", matrix.events, ["eventType", "category", "plane", "status", "scope", "mode", "codecStatus", "producerStatus", "containment", "owner", "sourceRefs", "tests"]);
  renderSection(lines, "Session boundaries", matrix.sessions, ["id", "owner", "status", "scope", "sourceRefs", "tests"]);
  renderSection(lines, "Host capabilities", matrix.capabilities, ["id", "status", "required", "requiredBy", "optionalBy", "owner", "sourceRefs", "tests"]);
  renderSection(lines, "Plugins", matrix.plugins, ["id", "name", "version", "entryId", "status", "required", "provides", "injects", "requiredCapabilities", "sourceRefs", "tests"]);
  renderSection(lines, "Packages", matrix.packages, ["id", "packageRole", "status", "exports", "dependencies", "sourceRefs", "tests"]);
  lines.push("## Composition declarations", "", "| Profile | Bundles | Patch kinds | Source refs |", "| --- | --- | --- | --- |", `| ${matrix.composition.profiles.map((item) => item.id).join(", ")} | ${matrix.composition.bundles.map((item) => `${item.id}@${item.version}`).join(", ")} | ${matrix.composition.patches.supportedKinds.join(", ")} | ${[...matrix.composition.profiles.flatMap((item) => item.sourceRefs), ...matrix.composition.bundles.flatMap((item) => item.sourceRefs), ...matrix.composition.patches.sourceRefs].join("; ")} |`, "");
  renderSection(lines, "Verification evidence", matrix.verification, ["id", "status", "evidenceKind", "owner", "sourceRefs", "tests"]);
  lines.push("## Diagnostics", "");
  lines.push(...(matrix.diagnostics.length === 0 ? ["- none"] : matrix.diagnostics.map((item) => `- **${item.severity}** \`${item.code}\`: ${item.message}`)), "");
  return `${lines.join("\n")}\n`;
}

function renderSection(lines, title, rows, columns) {
  lines.push(`## ${title}`, "", `| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`);
  for (const item of rows) lines.push(`| ${columns.map((column) => formatCell(item[column])).join(" | ")} |`);
  lines.push("");
}

function formatCell(value) {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.length === 0 ? "-" : value.join("<br>");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value).replaceAll("|", "\\|");
}

async function collectSourceSnapshot() {
  const paths = [...Object.values(EVENT_SOURCES).map((item) => item.path), SERVICE_SOURCE.path, ...MANIFEST_PATHS, ...COMPOSITION_SOURCES, ...PACKAGE_PATHS, ...VERIFICATION_SOURCES.map((item) => item.path)];
  const unique = [...new Set(paths)].sort();
  const snapshot = [];
  for (const path of unique) {
    await assertRelativePath(path);
    snapshot.push({ path, content: (await readRelative(path)).replaceAll("\r\n", "\n") });
  }
  return snapshot;
}

export async function buildMatrix() {
  readCache.clear();
  const sourceSnapshot = await collectSourceSnapshot();
  const events = await parseEvents();
  const { manifests, rows: plugins } = await parseManifests();
  const services = await parseServices();
  const capabilities = await parseCapabilities(manifests);
  const packages = await parsePackages();
  const composition = await parseComposition();
  const verification = await parseVerification();
  const sessions = [
    row("session", "session.journal", "@actspace/session-journal", "active", ["packages/session/journal/src/index.ts#SessionJournal"], { scope: "session", required: true, responsibility: "codec registry, envelope validation, replay" }),
    row("session", "session.persistence", "@actspace/session-persistence", "active", ["packages/session/persistence/src/session-persistence.ts#SessionPersistence", "packages/session/persistence/src/session-driver.ts#SessionPersistenceDriver"], { scope: "session", required: true, responsibility: "Core/Provider binding and durability lifecycle" }),
    row("session", "session.projection", "@actspace/session-projection", "optional", ["packages/session/projection/src/index.ts#SessionProjection"], { scope: "session", required: false, responsibility: "read-only projection" }),
  ];
  const matrixWithoutDigest = { schemaVersion: 1, generatorVersion: GENERATOR_VERSION, sourceRefs: Object.freeze({ events: EVENT_SOURCES, services: SERVICE_SOURCE, manifests: MANIFEST_PATHS, composition: COMPOSITION_SOURCES, packages: PACKAGE_PATHS, verification: VERIFICATION_SOURCES }), services, events, sessions, capabilities, plugins, packages, composition, verification };
  const sourceDigest = createHash("sha256").update(canonical(sourceSnapshot)).digest("hex");
  const matrix = { ...matrixWithoutDigest, sourceDigest, diagnostics: [] };
  matrix.diagnostics = validateRows(matrix);
  if (matrix.diagnostics.some((item) => item.severity === "error")) throw new Error(`Contract matrix validation failed:\n${matrix.diagnostics.map((item) => `${item.severity}: ${item.code}: ${item.message}`).join("\n")}`);
  return Object.freeze({ ...matrix, diagnostics: Object.freeze(matrix.diagnostics) });
}

export function renderJson(matrix) {
  return `${JSON.stringify(matrix, null, 2)}\n`;
}

export async function generate({ check = false } = {}) {
  const matrix = await buildMatrix();
  const json = renderJson(matrix);
  const markdown = renderMarkdown(matrix);
  const outputs = [[jsonOutput, json], [markdownOutput, markdown]];
  const failures = [];
  for (const [relativePath, content] of outputs) {
    const absolutePath = resolve(repoRoot, relativePath);
    const existing = await readFile(absolutePath, "utf8").catch(() => undefined);
    if (check) {
      if (existing !== content) failures.push(`${relativePath} is stale or missing`);
    } else {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return { matrix, outputs: outputs.map(([path]) => path), checked: check };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(scriptPath).href;
if (isMain) {
  const check = process.argv.includes("--check");
  try {
    const result = await generate({ check });
    process.stdout.write(`contract matrix ${check ? "check" : "generated"}: ${result.outputs.join(", ")} (digest ${result.matrix.sourceDigest})\n`);
  } catch (error) {
    process.stderr.write(`contract matrix failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
