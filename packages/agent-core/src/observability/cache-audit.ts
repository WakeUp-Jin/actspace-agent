import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ModelSpec } from "@actspace/shared";
import type { AssistantMessage, Context, Usage } from "../messages";

const DEFAULT_CACHE_THRESHOLD = 0.9;
const SNAPSHOT_SCHEMA_VERSION = 1;

export type CacheAuditPreflight = {
  suspectBeforeSend: boolean;
  prefixChanged: boolean;
  appendOnlyBroken: boolean;
  firstChangedMessageIndex?: number;
  previousPrefixHash?: string;
  currentPrefixHash: string;
  previousRequestHash?: string;
  currentRequestHash: string;
};

export type CacheAuditUsageMetadata = {
  cacheStatus?: boolean;
  cacheAuditId?: string;
  cacheHitRatio?: number;
};

export type CacheAuditCallMeta = {
  callId: string;
  turnIndex: number;
};

export type CacheAuditSnapshotFile = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  sessionId: string;
  turnId: string;
  callId: string;
  createdAt: string;
  provider?: string;
  model?: string;
  modelId?: string;
  options?: {
    thinkingEnabled?: boolean;
  };
  context: Context;
};

export type CacheAuditPreparedCall = {
  meta: CacheAuditCallMeta;
  snapshot: CacheAuditSnapshotFile;
  preflight: CacheAuditPreflight;
  current: CacheAuditContextDescription;
  previous?: CacheAuditContextDescription;
  previousSnapshot?: CacheAuditSnapshotFile;
};

export interface CacheAuditTracker {
  beforeLlmCall(context: Context, meta: CacheAuditCallMeta): Promise<CacheAuditPreparedCall | null>;
  afterLlmCall(call: CacheAuditPreparedCall | null, message: AssistantMessage): Promise<CacheAuditUsageMetadata | null>;
}

export type CacheAuditTrackerOptions = {
  rootDir: string;
  sessionId: string;
  turnId: string;
  provider?: ModelSpec["provider"] | string;
  model?: string;
  modelId?: string;
  thinkingEnabled?: boolean;
  threshold?: number;
  now?: () => Date;
};

export type CacheAuditContextDescription = {
  prefix: unknown;
  prefixHash: string;
  requestHash: string;
  messageHashes: string[];
  messageCount: number;
  toolCount: number;
};

export type CacheAuditRatio = {
  hit: number;
  miss: number;
  ratio?: number;
};

export function createCacheAuditTracker(options: CacheAuditTrackerOptions): CacheAuditTracker {
  return new FileCacheAuditTracker(options);
}

export function calculateCacheHitRatio(usage: Usage): CacheAuditRatio {
  const hit = positive(usage.cacheHit || usage.cacheRead);
  const miss = positive(usage.cacheMiss);
  const denominator = hit + miss;
  return {
    hit,
    miss,
    ratio: denominator > 0 ? hit / denominator : undefined,
  };
}

export function describeContextForCacheAudit(raw: CacheAuditSnapshotFile | Context): CacheAuditContextDescription {
  const snapshot = isSnapshotFile(raw) ? raw : undefined;
  const context = snapshot?.context ?? raw as Context;
  const systemPrompt = context.systemPrompt ?? null;
  const tools = Array.isArray(context.tools) ? context.tools : [];
  const messages = Array.isArray(context.messages) ? context.messages : [];
  const prefix = {
    systemPrompt,
    tools,
    provider: snapshot?.provider ?? null,
    model: snapshot?.model ?? null,
    options: snapshot?.options ?? null,
  };
  return {
    prefix,
    prefixHash: hash(prefix),
    requestHash: hash({ prefix, messages }),
    messageHashes: messages.map((message) => hash(message)),
    messageCount: messages.length,
    toolCount: tools.length,
  };
}

export function diffCacheAuditContexts(
  previous: CacheAuditSnapshotFile | Context | undefined,
  current: CacheAuditSnapshotFile | Context,
): CacheAuditPreflight & { previous?: CacheAuditContextDescription; current: CacheAuditContextDescription } {
  const currentDescription = describeContextForCacheAudit(current);
  if (!previous) {
    return {
      suspectBeforeSend: false,
      prefixChanged: false,
      appendOnlyBroken: false,
      currentPrefixHash: currentDescription.prefixHash,
      currentRequestHash: currentDescription.requestHash,
      current: currentDescription,
    };
  }

  const previousDescription = describeContextForCacheAudit(previous);
  const prefixChanged = previousDescription.prefixHash !== currentDescription.prefixHash;
  const firstChangedMessageIndex = findFirstChangedMessageIndex(
    previousDescription.messageHashes,
    currentDescription.messageHashes,
  );
  const appendOnlyBroken = !isAppendOnly(
    previousDescription.messageHashes,
    currentDescription.messageHashes,
  );
  return {
    suspectBeforeSend: prefixChanged || appendOnlyBroken,
    prefixChanged,
    appendOnlyBroken,
    ...(firstChangedMessageIndex !== undefined ? { firstChangedMessageIndex } : {}),
    previousPrefixHash: previousDescription.prefixHash,
    currentPrefixHash: currentDescription.prefixHash,
    previousRequestHash: previousDescription.requestHash,
    currentRequestHash: currentDescription.requestHash,
    previous: previousDescription,
    current: currentDescription,
  };
}

class FileCacheAuditTracker implements CacheAuditTracker {
  private readonly sessionDir: string;
  private readonly threshold: number;
  private readonly now: () => Date;

  constructor(private readonly options: CacheAuditTrackerOptions) {
    this.sessionDir = join(options.rootDir, sanitizeSegment(options.sessionId));
    this.threshold = options.threshold ?? DEFAULT_CACHE_THRESHOLD;
    this.now = options.now ?? (() => new Date());
  }

  async beforeLlmCall(context: Context, meta: CacheAuditCallMeta): Promise<CacheAuditPreparedCall | null> {
    try {
      const snapshot = this.createSnapshot(context, meta);
      const previousSnapshot = await this.readLastSnapshot();
      const diff = diffCacheAuditContexts(previousSnapshot, snapshot);
      return {
        meta,
        snapshot,
        preflight: {
          suspectBeforeSend: diff.suspectBeforeSend,
          prefixChanged: diff.prefixChanged,
          appendOnlyBroken: diff.appendOnlyBroken,
          ...(diff.firstChangedMessageIndex !== undefined
            ? { firstChangedMessageIndex: diff.firstChangedMessageIndex }
            : {}),
          previousPrefixHash: diff.previousPrefixHash,
          currentPrefixHash: diff.currentPrefixHash,
          previousRequestHash: diff.previousRequestHash,
          currentRequestHash: diff.currentRequestHash,
        },
        current: diff.current,
        previous: diff.previous,
        previousSnapshot,
      };
    } catch (error) {
      logCacheAuditError("failed before llm call", error);
      return null;
    }
  }

  async afterLlmCall(call: CacheAuditPreparedCall | null, message: AssistantMessage): Promise<CacheAuditUsageMetadata | null> {
    if (!call) return null;

    const cache = calculateCacheHitRatio(message.usage);
    const lowCache = cache.ratio !== undefined && cache.ratio < this.threshold;
    let metadata: CacheAuditUsageMetadata | null = cache.ratio !== undefined
      ? { cacheHitRatio: roundRatio(cache.ratio) }
      : null;

    try {
      if (lowCache && cache.ratio !== undefined) {
        const auditId = this.createAuditId(call);
        await this.writeAuditFiles(auditId, call, message, cache);
        metadata = {
          cacheStatus: true,
          cacheAuditId: auditId,
          cacheHitRatio: roundRatio(cache.ratio),
        };
      }
    } catch (error) {
      logCacheAuditError("failed to write low-cache audit files", error);
      if (lowCache && cache.ratio !== undefined) {
        metadata = { cacheStatus: true, cacheHitRatio: roundRatio(cache.ratio) };
      }
    } finally {
      try {
        await writeJson(this.lastSnapshotPath(), call.snapshot);
      } catch (error) {
        logCacheAuditError("failed to write rolling last context", error);
      }
    }

    return metadata;
  }

  private createSnapshot(context: Context, meta: CacheAuditCallMeta): CacheAuditSnapshotFile {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      sessionId: this.options.sessionId,
      turnId: this.options.turnId,
      callId: meta.callId,
      createdAt: this.now().toISOString(),
      provider: this.options.provider,
      model: this.options.model,
      modelId: this.options.modelId,
      options: {
        thinkingEnabled: this.options.thinkingEnabled,
      },
      context: cloneContext(context),
    };
  }

  private async readLastSnapshot(): Promise<CacheAuditSnapshotFile | undefined> {
    try {
      const raw = await readFile(this.lastSnapshotPath(), "utf8");
      const parsed = JSON.parse(raw) as CacheAuditSnapshotFile;
      return isSnapshotFile(parsed) ? parsed : undefined;
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      logCacheAuditError("failed to read rolling last context", error);
      return undefined;
    }
  }

  private async writeAuditFiles(
    auditId: string,
    call: CacheAuditPreparedCall,
    message: AssistantMessage,
    cache: CacheAuditRatio,
  ): Promise<void> {
    const auditDir = join(this.sessionDir, sanitizeSegment(auditId));
    await mkdir(auditDir, { recursive: true });
    if (call.previousSnapshot) {
      await writeJson(join(auditDir, "previous.context.json"), call.previousSnapshot);
    }
    await writeJson(join(auditDir, "current.context.json"), call.snapshot);
    await writeJson(join(auditDir, "summary.json"), this.createSummary(auditId, call, message, cache));
    await writeFile(join(auditDir, "diff.txt"), createDiffText(call), "utf8");
  }

  private createSummary(
    auditId: string,
    call: CacheAuditPreparedCall,
    message: AssistantMessage,
    cache: CacheAuditRatio,
  ): Record<string, unknown> {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      auditId,
      sessionId: this.options.sessionId,
      turnId: this.options.turnId,
      callId: call.meta.callId,
      createdAt: this.now().toISOString(),
      provider: message.provider || this.options.provider,
      model: message.model || this.options.model,
      modelId: this.options.modelId,
      cacheStatus: true,
      cacheHitRatio: cache.ratio !== undefined ? roundRatio(cache.ratio) : undefined,
      cacheHitTokens: cache.hit,
      cacheMissTokens: cache.miss,
      threshold: this.threshold,
      suspectBeforeSend: call.preflight.suspectBeforeSend,
      prefixChanged: call.preflight.prefixChanged,
      appendOnlyBroken: call.preflight.appendOnlyBroken,
      firstChangedMessageIndex: call.preflight.firstChangedMessageIndex ?? null,
      previous: call.previous
        ? {
            messageCount: call.previous.messageCount,
            toolCount: call.previous.toolCount,
            prefixHash: call.previous.prefixHash,
            requestHash: call.previous.requestHash,
          }
        : null,
      current: {
        messageCount: call.current.messageCount,
        toolCount: call.current.toolCount,
        prefixHash: call.current.prefixHash,
        requestHash: call.current.requestHash,
      },
      files: {
        ...(call.previousSnapshot ? { previousContext: "previous.context.json" } : {}),
        currentContext: "current.context.json",
        diff: "diff.txt",
      },
    };
  }

  private createAuditId(call: CacheAuditPreparedCall): string {
    const stamp = this.now()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    return `${stamp}-${sanitizeSegment(this.options.turnId)}-${sanitizeSegment(call.meta.callId)}`;
  }

  private lastSnapshotPath(): string {
    return join(this.sessionDir, "last.context.json");
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

function isAppendOnly(previous: string[], current: string[]): boolean {
  return previous.length <= current.length && previous.every((item, index) => item === current[index]);
}

function findFirstChangedMessageIndex(previous: string[], current: string[]): number | undefined {
  const min = Math.min(previous.length, current.length);
  for (let index = 0; index < min; index++) {
    if (previous[index] !== current[index]) return index;
  }
  return previous.length > current.length ? current.length : undefined;
}

function cloneContext(context: Context): Context {
  return JSON.parse(JSON.stringify(context)) as Context;
}

function isSnapshotFile(value: unknown): value is CacheAuditSnapshotFile {
  return Boolean(
    value &&
      typeof value === "object" &&
      "context" in value &&
      value.context &&
      typeof value.context === "object",
  );
}

function positive(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createDiffText(call: CacheAuditPreparedCall): string {
  const lines = [
    `cache audit: ${call.meta.callId}`,
    `prefix changed: ${call.preflight.prefixChanged ? "yes" : "no"}`,
    `append-only broken: ${call.preflight.appendOnlyBroken ? "yes" : "no"}`,
    `suspect before send: ${call.preflight.suspectBeforeSend ? "yes" : "no"}`,
    `first changed message index: ${call.preflight.firstChangedMessageIndex ?? "-"}`,
    `previous messages: ${call.previous?.messageCount ?? "-"}`,
    `current messages: ${call.current.messageCount}`,
    `previous prefix hash: ${call.preflight.previousPrefixHash ?? "-"}`,
    `current prefix hash: ${call.preflight.currentPrefixHash}`,
    `previous request hash: ${call.preflight.previousRequestHash ?? "-"}`,
    `current request hash: ${call.preflight.currentRequestHash}`,
  ];
  return `${lines.join("\n")}\n`;
}

function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return basename(safe) || "unknown";
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT",
  );
}

function logCacheAuditError(message: string, error: unknown): void {
  console.error("[cache-audit]", message, error instanceof Error ? error.message : String(error));
}
