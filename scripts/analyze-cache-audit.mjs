#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const USAGE = `usage:
  node scripts/analyze-cache-audit.mjs <cache-audit-session-dir> [--id <auditId>]
  node scripts/analyze-cache-audit.mjs --previous <previous.context.json> --current <current.context.json>

examples:
  node scripts/analyze-cache-audit.mjs ~/Library/Application\\ Support/actspace/cache-audit/session-abc
  node scripts/analyze-cache-audit.mjs --previous previous.context.json --current current.context.json
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === "--help" || item === "-h") {
      args.help = true;
      continue;
    }
    if (item === "--id") {
      args.id = argv[++i];
      continue;
    }
    if (item === "--previous") {
      args.previous = argv[++i];
      continue;
    }
    if (item === "--current") {
      args.current = argv[++i];
      continue;
    }
    args._.push(item);
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function hash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

function unwrapContext(raw) {
  if (raw && typeof raw === "object" && raw.context && typeof raw.context === "object") {
    return raw.context;
  }
  return raw;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function describeContext(raw) {
  const context = unwrapContext(raw) ?? {};
  const systemPrompt = context.systemPrompt ?? context.system ?? null;
  const tools = toArray(context.tools);
  const messages = toArray(context.messages);
  const provider = context.provider ?? raw.provider ?? null;
  const model = context.model ?? raw.model ?? null;
  const options = context.options ?? raw.options ?? null;
  const prefix = { systemPrompt, tools, provider, model, options };
  return {
    context,
    prefix,
    prefixHash: hash(prefix),
    requestHash: hash({ prefix, messages }),
    messageHashes: messages.map((message) => hash(message)),
    messageCount: messages.length,
    toolCount: tools.length,
  };
}

function diffSnapshots(previousRaw, currentRaw) {
  const previous = describeContext(previousRaw);
  const current = describeContext(currentRaw);
  const prefixChanged = previous.prefixHash !== current.prefixHash;
  const min = Math.min(previous.messageHashes.length, current.messageHashes.length);
  let firstChangedMessageIndex = null;
  for (let i = 0; i < min; i++) {
    if (previous.messageHashes[i] !== current.messageHashes[i]) {
      firstChangedMessageIndex = i;
      break;
    }
  }
  if (firstChangedMessageIndex === null && previous.messageHashes.length > current.messageHashes.length) {
    firstChangedMessageIndex = current.messageHashes.length;
  }
  const appendOnly =
    previous.messageHashes.length <= current.messageHashes.length &&
    previous.messageHashes.every((item, index) => item === current.messageHashes[index]);
  const appendOnlyBroken = !appendOnly;
  return {
    prefixChanged,
    appendOnlyBroken,
    firstChangedMessageIndex,
    previous,
    current,
  };
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMaybe(value) {
  return value === null || value === undefined ? "-" : String(value);
}

function printDiffReport(label, diff) {
  console.log(`\n${label}`);
  console.log(`  prefix changed:          ${diff.prefixChanged ? "yes" : "no"}`);
  console.log(`  append-only broken:      ${diff.appendOnlyBroken ? "yes" : "no"}`);
  console.log(`  first changed msg index: ${formatMaybe(diff.firstChangedMessageIndex)}`);
  console.log(`  previous messages:       ${diff.previous.messageCount}`);
  console.log(`  current messages:        ${diff.current.messageCount}`);
  console.log(`  previous prefix hash:    ${diff.previous.prefixHash}`);
  console.log(`  current prefix hash:     ${diff.current.prefixHash}`);
  console.log(`  previous request hash:   ${diff.previous.requestHash}`);
  console.log(`  current request hash:    ${diff.current.requestHash}`);
}

function readSummary(summaryPath) {
  try {
    return readJson(summaryPath);
  } catch (err) {
    return {
      auditId: basename(dirname(summaryPath)),
      error: `failed to parse summary.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function findAuditDirs(root, id) {
  if (id) {
    const dir = join(root, id);
    return existsSync(dir) ? [dir] : [];
  }
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })
    .filter((path) => existsSync(join(path, "summary.json")));
}

function resolveSummaryFile(summary, auditDir, key, fallback) {
  const file = summary?.files?.[key] ?? fallback;
  return resolve(auditDir, file);
}

function analyzeAuditDir(rootInput, id) {
  const root = resolve(rootInput);
  if (!existsSync(root)) {
    throw new Error(`audit directory does not exist: ${root}`);
  }
  const auditDirs = findAuditDirs(root, id);
  if (auditDirs.length === 0) {
    throw new Error(id ? `audit id not found: ${id}` : `no audit entries with summary.json under ${root}`);
  }

  const rows = auditDirs.map((auditDir) => {
    const summary = readSummary(join(auditDir, "summary.json"));
    return { auditDir, summary };
  });
  rows.sort((a, b) => {
    const ar = typeof a.summary.cacheHitRatio === "number" ? a.summary.cacheHitRatio : Number.POSITIVE_INFINITY;
    const br = typeof b.summary.cacheHitRatio === "number" ? b.summary.cacheHitRatio : Number.POSITIVE_INFINITY;
    return ar - br;
  });

  console.log(`cache audit root: ${root}`);
  console.log(`entries: ${rows.length}`);

  for (const { auditDir, summary } of rows) {
    const auditId = summary.auditId ?? basename(auditDir);
    const ratio = typeof summary.cacheHitRatio === "number" ? pct(summary.cacheHitRatio) : "-";
    console.log(`\n${auditId}`);
    console.log(`  cache hit:               ${ratio}`);
    console.log(`  cache status:            ${summary.cacheStatus === true ? "low" : "unknown"}`);
    console.log(`  provider/model:          ${formatMaybe(summary.provider)}/${formatMaybe(summary.model)}`);
    console.log(`  turn/call:               ${formatMaybe(summary.turnId)}/${formatMaybe(summary.callId)}`);
    console.log(`  suspect before send:     ${summary.suspectBeforeSend === true ? "yes" : "no"}`);
    console.log(`  prefix changed:          ${summary.prefixChanged === true ? "yes" : "no"}`);
    console.log(`  append-only broken:      ${summary.appendOnlyBroken === true ? "yes" : "no"}`);
    console.log(`  first changed msg index: ${formatMaybe(summary.firstChangedMessageIndex)}`);
    console.log(`  summary:                 ${join(auditDir, "summary.json")}`);

    const previousPath = resolveSummaryFile(summary, auditDir, "previousContext", "previous.context.json");
    const currentPath = resolveSummaryFile(summary, auditDir, "currentContext", "current.context.json");
    const diffPath = resolveSummaryFile(summary, auditDir, "diff", "diff.txt");
    console.log(`  previous context:        ${previousPath}`);
    console.log(`  current context:         ${currentPath}`);
    console.log(`  diff:                    ${diffPath}`);

    if (existsSync(previousPath) && existsSync(currentPath)) {
      try {
        const diff = diffSnapshots(readJson(previousPath), readJson(currentPath));
        printDiffReport("  recomputed diff", diff);
      } catch (err) {
        console.log(`  recomputed diff:         failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
}

function analyzePair(previousPathInput, currentPathInput) {
  const previousPath = resolve(previousPathInput);
  const currentPath = resolve(currentPathInput);
  if (!existsSync(previousPath)) throw new Error(`previous context does not exist: ${previousPath}`);
  if (!existsSync(currentPath)) throw new Error(`current context does not exist: ${currentPath}`);
  const diff = diffSnapshots(readJson(previousPath), readJson(currentPath));
  console.log(`previous: ${previousPath}`);
  console.log(`current:  ${currentPath}`);
  printDiffReport("context diff", diff);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.previous || args.current) {
    if (!args.previous || !args.current) throw new Error("--previous and --current must be provided together");
    analyzePair(args.previous, args.current);
    return;
  }
  const root = args._[0];
  if (!root) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  analyzeAuditDir(root, args.id);
}

try {
  main();
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}

