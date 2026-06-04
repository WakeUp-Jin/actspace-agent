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

function diffOptionalSnapshots(previousRaw, currentRaw) {
  if (previousRaw) return diffSnapshots(previousRaw, currentRaw);
  const current = describeContext(currentRaw);
  return {
    prefixChanged: false,
    appendOnlyBroken: false,
    firstChangedMessageIndex: null,
    previous: null,
    current,
  };
}

function contentTextSize(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return stableStringify(content ?? "").length;
  return content.reduce((sum, block) => {
    if (!block || typeof block !== "object") return sum;
    if (typeof block.text === "string") return sum + block.text.length;
    if (typeof block.thinking === "string") return sum + block.thinking.length;
    return sum + stableStringify(block).length;
  }, 0);
}

function messageTextSize(message) {
  if (!message || typeof message !== "object") return 0;
  return contentTextSize(message.content);
}

function countBy(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

function formatCounts(counts) {
  if (!counts || counts.size === 0) return "-";
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");
}

function toolCallNamesFromMessage(message) {
  if (!message || typeof message !== "object") return [];
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .filter((block) => block && typeof block === "object" && block.type === "toolCall" && typeof block.name === "string")
    .map((block) => block.name);
}

function toolResultNamesFromMessage(message) {
  if (!message || typeof message !== "object") return [];
  return message.role === "toolResult" && typeof message.toolName === "string" ? [message.toolName] : [];
}

function analyzeMessageDelta(diff) {
  const previousMessages = diff.previous ? toArray(diff.previous.context.messages) : [];
  const currentMessages = toArray(diff.current.context.messages);
  const hasPrevious = Boolean(diff.previous);
  const baseIndex = hasPrevious
    ? diff.appendOnlyBroken
      ? diff.firstChangedMessageIndex ?? 0
      : previousMessages.length
    : 0;
  const currentDeltaMessages = currentMessages.slice(baseIndex);
  const previousDeltaMessages = previousMessages.slice(baseIndex);
  const currentDeltaChars = currentDeltaMessages.reduce((sum, message) => sum + messageTextSize(message), 0);
  const previousDeltaChars = previousDeltaMessages.reduce((sum, message) => sum + messageTextSize(message), 0);
  const currentMessageChars = currentMessages.reduce((sum, message) => sum + messageTextSize(message), 0);
  const reusableMessageChars = currentMessages
    .slice(0, Math.max(0, baseIndex))
    .reduce((sum, message) => sum + messageTextSize(message), 0);
  const prefixChars = stableStringify(diff.current.prefix ?? {}).length;
  const stablePrefixChars = !hasPrevious || diff.prefixChanged ? 0 : prefixChars + reusableMessageChars;
  const currentRequestChars = prefixChars + currentMessageChars;
  const changedShare = currentRequestChars > 0 ? currentDeltaChars / currentRequestChars : undefined;
  const roles = countBy(currentDeltaMessages.map((message) => message.role ?? "unknown"));
  const sources = countBy(currentDeltaMessages.map((message) => message.source ?? undefined));
  const toolCalls = countBy(currentDeltaMessages.flatMap(toolCallNamesFromMessage));
  const toolResults = countBy(currentDeltaMessages.flatMap(toolResultNamesFromMessage));

  return {
    hasPrevious,
    baseIndex,
    currentDeltaMessageCount: currentDeltaMessages.length,
    previousDeltaMessageCount: previousDeltaMessages.length,
    currentDeltaChars,
    previousDeltaChars,
    currentRequestChars,
    stablePrefixChars,
    changedShare,
    roles,
    sources,
    toolCalls,
    toolResults,
  };
}

function classifyAudit(summary, diff, delta) {
  if (summary?.error) {
    return {
      label: "summary parse error",
      note: "summary.json could not be parsed; inspect the file before trusting this entry.",
    };
  }
  if (!delta.hasPrevious) {
    return {
      label: "cold start",
      note: "No previous context snapshot was available, so a low first-call cache hit is expected.",
    };
  }
  if (diff.prefixChanged) {
    return {
      label: "prefix changed",
      note: "Check system prompt, tool definitions, provider/model, and options for byte-level drift.",
    };
  }
  if (diff.appendOnlyBroken) {
    return {
      label: "append-only broken",
      note: "History changed before the tail; check compaction, replay, retry, or session recovery paths.",
    };
  }
  if (isLargeAppendedSuffix(delta)) {
    return {
      label: "large appended suffix",
      note: "The reusable prefix is stable, but newly appended messages are large; inspect tool results first.",
    };
  }
  return {
    label: "provider/cache uncertainty",
    note: "Prefix and message chain look stable; consider cache warmup, expiry, or provider-side behavior.",
  };
}

function isLargeAppendedSuffix(delta) {
  return (
    delta.currentDeltaChars >= 8_000 ||
    delta.currentDeltaMessageCount >= 4 ||
    (typeof delta.changedShare === "number" && delta.changedShare >= 0.35)
  );
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function pctMaybe(value) {
  return typeof value === "number" && Number.isFinite(value) ? pct(value) : "-";
}

function formatMaybe(value) {
  return value === null || value === undefined ? "-" : String(value);
}

function printDiffReport(label, diff) {
  console.log(`\n${label}`);
  console.log(`  prefix changed:          ${diff.prefixChanged ? "yes" : "no"}`);
  console.log(`  append-only broken:      ${diff.appendOnlyBroken ? "yes" : "no"}`);
  console.log(`  first changed msg index: ${formatMaybe(diff.firstChangedMessageIndex)}`);
  console.log(`  previous messages:       ${formatMaybe(diff.previous?.messageCount)}`);
  console.log(`  current messages:        ${diff.current.messageCount}`);
  console.log(`  previous prefix hash:    ${formatMaybe(diff.previous?.prefixHash)}`);
  console.log(`  current prefix hash:     ${diff.current.prefixHash}`);
  console.log(`  previous request hash:   ${formatMaybe(diff.previous?.requestHash)}`);
  console.log(`  current request hash:    ${diff.current.requestHash}`);
}

function printDiagnosisReport(label, diagnosis, delta) {
  console.log(`\n${label}`);
  if (diagnosis) {
    console.log(`  diagnosis:              ${diagnosis.label}`);
    console.log(`  note:                   ${diagnosis.note}`);
  }
  if (!delta) return;
  const deltaLabel = delta.hasPrevious
    ? delta.previousDeltaMessageCount > 0
      ? "changed current msgs"
      : "added messages"
    : "current messages";
  const charsLabel = delta.hasPrevious
    ? delta.previousDeltaMessageCount > 0
      ? "changed current chars"
      : "added chars"
    : "current chars";
  console.log(`  ${deltaLabel.padEnd(23)} ${delta.currentDeltaMessageCount}`);
  console.log(`  ${charsLabel.padEnd(23)} ${delta.currentDeltaChars}`);
  if (delta.previousDeltaMessageCount > 0) {
    console.log(`  changed previous msgs:  ${delta.previousDeltaMessageCount}`);
    console.log(`  changed previous chars: ${delta.previousDeltaChars}`);
  }
  console.log(`  roles:                  ${formatCounts(delta.roles)}`);
  console.log(`  sources:                ${formatCounts(delta.sources)}`);
  console.log(`  tool calls:             ${formatCounts(delta.toolCalls)}`);
  console.log(`  tool results:           ${formatCounts(delta.toolResults)}`);
  console.log(`  stable prefix chars:    ${delta.stablePrefixChars}`);
  console.log(`  current request chars:  ${delta.currentRequestChars}`);
  console.log(`  new/changed share:      ${pctMaybe(delta.changedShare)}`);
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
  const dirs = findAuditDirsRecursive(root);
  if (id) {
    return dirs.filter((dir) => basename(dir) === id);
  }
  return dirs;
}

function findAuditDirsRecursive(root) {
  const results = [];
  const visit = (dir) => {
    if (existsSync(join(dir, "summary.json"))) {
      results.push(dir);
      return;
    }
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      try {
        if (statSync(path).isDirectory()) visit(path);
      } catch {
        // Ignore disappearing files while scanning local audit output.
      }
    }
  };
  visit(root);
  return results;
}

function resolveSummaryFile(summary, auditDir, key, fallback) {
  const file = summary?.files?.[key] ?? fallback;
  return resolve(auditDir, file);
}

function analyzeAuditRow(row) {
  const { auditDir, summary } = row;
  const previousPath = resolveSummaryFile(summary, auditDir, "previousContext", "previous.context.json");
  const currentPath = resolveSummaryFile(summary, auditDir, "currentContext", "current.context.json");
  const diffPath = resolveSummaryFile(summary, auditDir, "diff", "diff.txt");
  const files = { previousPath, currentPath, diffPath };

  let diff = null;
  let delta = null;
  let diagnosis = null;
  let analysisError = null;
  try {
    if (!existsSync(currentPath)) {
      throw new Error(`current context does not exist: ${currentPath}`);
    }
    const previousRaw = existsSync(previousPath) ? readJson(previousPath) : null;
    const currentRaw = readJson(currentPath);
    diff = diffOptionalSnapshots(previousRaw, currentRaw);
    delta = analyzeMessageDelta(diff);
    diagnosis = classifyAudit(summary, diff, delta);
  } catch (err) {
    analysisError = err instanceof Error ? err.message : String(err);
  }

  return { ...row, files, diff, delta, diagnosis, analysisError };
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

  const rows = auditDirs
    .map((auditDir) => {
      const summary = readSummary(join(auditDir, "summary.json"));
      return { auditDir, summary };
    })
    .map(analyzeAuditRow);
  rows.sort((a, b) => {
    const ar = typeof a.summary.cacheHitRatio === "number" ? a.summary.cacheHitRatio : Number.POSITIVE_INFINITY;
    const br = typeof b.summary.cacheHitRatio === "number" ? b.summary.cacheHitRatio : Number.POSITIVE_INFINITY;
    return ar - br;
  });

  printAuditOverview(root, rows);

  for (const { auditDir, summary, files, diff, delta, diagnosis, analysisError } of rows) {
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
    console.log(`  diagnosis:              ${diagnosis?.label ?? "-"}`);
    console.log(`  summary:                 ${join(auditDir, "summary.json")}`);

    console.log(`  previous context:        ${files.previousPath}`);
    console.log(`  current context:         ${files.currentPath}`);
    console.log(`  diff:                    ${files.diffPath}`);

    if (analysisError) {
      console.log(`  context analysis:        failed (${analysisError})`);
      continue;
    }
    if (diff && delta) {
      printDiffReport("  recomputed diff", diff);
      printDiagnosisReport("  context diagnosis", diagnosis, delta);
    }
  }
}

function printAuditOverview(root, rows) {
  const hit = rows.reduce((sum, row) => sum + positiveNumber(row.summary.cacheHitTokens), 0);
  const miss = rows.reduce((sum, row) => sum + positiveNumber(row.summary.cacheMissTokens), 0);
  const denominator = hit + miss;
  const diagnosisCounts = countBy(rows.map((row) => row.diagnosis?.label ?? "analysis unavailable"));
  const worst = rows.slice(0, 5);

  console.log(`cache audit root: ${root}`);
  console.log(`entries: ${rows.length}`);
  console.log(`weighted cache hit: ${denominator > 0 ? pct(hit / denominator) : "-"}`);
  console.log(`cache tokens: hit=${hit} miss=${miss}`);
  console.log("diagnosis breakdown:");
  for (const [label, count] of [...diagnosisCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${label}: ${count}`);
  }
  if (worst.length > 0) {
    console.log("\nworst entries:");
    for (const row of worst) {
      const summary = row.summary;
      const ratio = typeof summary.cacheHitRatio === "number" ? pct(summary.cacheHitRatio) : "-";
      const auditId = summary.auditId ?? basename(row.auditDir);
      const delta = row.delta;
      const suffix = delta
        ? `+${delta.currentDeltaMessageCount} msgs / +${delta.currentDeltaChars} chars`
        : "no context analysis";
      const toolResults = delta ? formatCounts(delta.toolResults) : "-";
      console.log(`  ${ratio}  ${row.diagnosis?.label ?? "-"}  ${suffix}  toolResults=${toolResults}  ${auditId}`);
    }
  }
}

function analyzePair(previousPathInput, currentPathInput) {
  const previousPath = resolve(previousPathInput);
  const currentPath = resolve(currentPathInput);
  if (!existsSync(previousPath)) throw new Error(`previous context does not exist: ${previousPath}`);
  if (!existsSync(currentPath)) throw new Error(`current context does not exist: ${currentPath}`);
  const diff = diffSnapshots(readJson(previousPath), readJson(currentPath));
  const delta = analyzeMessageDelta(diff);
  const diagnosis = classifyAudit({}, diff, delta);
  console.log(`previous: ${previousPath}`);
  console.log(`current:  ${currentPath}`);
  printDiffReport("context diff", diff);
  printDiagnosisReport("context diagnosis", diagnosis, delta);
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
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
