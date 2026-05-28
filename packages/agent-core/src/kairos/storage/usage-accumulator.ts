/**
 * Kairos 的 token / 成本累加器（**双维度**：全生命周期 + 阶段）。
 *
 * 这层独立出来是为了：
 * 1. **双语义可信**：用户既要"全期总账"（重置按钮不清），又要"阶段账"（reset 清零）。
 *    两份在同一文件里串行累加，写盘一次，UI 通过 `KairosRuntimeState` 同时拿到。
 * 2. **跨重启不丢**：每次 `accumulate` 都 debounce 写 `usage-accumulator.json`（atomic rename）。
 * 3. **复盘鲁棒**：accumulator 文件缺失/损坏时回退到"扫所有短期记忆段"重建 lifetime
 *    （用户语义：除非删文件，全期账不应清零）；sinceReset 此时保守归零，因为 reset
 *    边界只能由 accumulator 文件维护。
 *
 * 关于 `currency`：单条 `llm_usage` 自带 `cost.currency`（USD/CNY）；两份维度各自独立维护
 * "见过哪个币种 / 是否混合"状态机，最终输出的 `currency` 可能一边 USD 另一边 MIXED——
 * UI 用 `≈` 前缀提示"已混合币种"。
 *
 * Schema 版本演进：
 * - v1（旧）：`{ summary, seenCurrency, currencyMixed }` —— 只有一份。
 * - v2（当前）：`{ lifetime, sinceReset, lastUpdatedAt }` —— 双维度。
 * - 读到 v1 时自动迁移：把旧 summary 同时拷贝到 lifetime + sinceReset，作为升级锚点。
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  accumulateKairosUsage,
  aggregateKairosUsage,
  emptyKairosUsageSummary,
  type KairosUsageSummary,
  type LlmUsageCost,
  type LlmUsagePayload,
  type SessionEvent,
} from "@actspace/shared";

interface DimensionSnapshot {
  summary: KairosUsageSummary;
  seenCurrency: LlmUsageCost["currency"] | null;
  currencyMixed: boolean;
}

interface AccumulatorSnapshotV2 {
  schemaVersion: 2;
  lifetime: DimensionSnapshot;
  sinceReset: DimensionSnapshot;
  lastUpdatedAt: string;
}

interface AccumulatorSnapshotV1 {
  schemaVersion: 1;
  summary: KairosUsageSummary;
  seenCurrency: LlmUsageCost["currency"] | null;
  currencyMixed: boolean;
  lastUpdatedAt: string;
}

export interface UsageAccumulatorOptions {
  filePath: string;
  debounceMs?: number;
  atomicWrite?: boolean;
}

/**
 * 单条维度运行时状态——封装 summary + currency 状态机，避免在 accumulator 主类里
 * 大量重复字段。
 */
class UsageDimensionState {
  summary: KairosUsageSummary = emptyKairosUsageSummary();
  seenCurrency: LlmUsageCost["currency"] | null = null;
  currencyMixed = false;

  apply(snapshot: DimensionSnapshot): void {
    this.summary = { ...snapshot.summary };
    this.seenCurrency = snapshot.seenCurrency;
    this.currencyMixed = snapshot.currencyMixed;
    this.refreshCurrencyOnSummary();
  }

  accumulate(payload: LlmUsagePayload): void {
    accumulateKairosUsage(this.summary, payload, {
      onCurrencyObserved: (currency) => {
        if (this.currencyMixed) return;
        if (this.seenCurrency === null) {
          this.seenCurrency = currency;
        } else if (this.seenCurrency !== currency) {
          this.currencyMixed = true;
          this.seenCurrency = null;
        }
      },
    });
    this.refreshCurrencyOnSummary();
  }

  reset(): void {
    this.summary = emptyKairosUsageSummary();
    this.seenCurrency = null;
    this.currencyMixed = false;
  }

  /** 从 events 流批量重建——load() 回退路径调用，等价于"一次性把过去喂一遍"。 */
  rebuildFromEvents(events: SessionEvent[]): void {
    const rebuilt = aggregateKairosUsage(events);
    this.summary = rebuilt;
    if (rebuilt.currency === "MIXED") {
      this.currencyMixed = true;
      this.seenCurrency = null;
    } else if (rebuilt.callCount > 0) {
      this.seenCurrency = rebuilt.currency;
      this.currencyMixed = false;
    } else {
      this.seenCurrency = null;
      this.currencyMixed = false;
    }
  }

  toSnapshot(): DimensionSnapshot {
    return {
      summary: { ...this.summary },
      seenCurrency: this.seenCurrency,
      currencyMixed: this.currencyMixed,
    };
  }

  getSummary(): KairosUsageSummary {
    return { ...this.summary };
  }

  /**
   * 把 `seenCurrency`/`currencyMixed` 同步回 summary.currency。
   * `accumulateKairosUsage` 只更新 cost/token，currency 由外层维护。
   */
  private refreshCurrencyOnSummary(): void {
    if (this.summary.callCount === 0) {
      this.summary.currency = "USD"; // 出厂默认；UI 此时不渲染单位
      return;
    }
    if (this.currencyMixed) {
      this.summary.currency = "MIXED";
    } else if (this.seenCurrency) {
      this.summary.currency = this.seenCurrency;
    }
  }
}

export class KairosUsageAccumulator {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private readonly atomicWrite: boolean;

  private readonly lifetime = new UsageDimensionState();
  private readonly sinceReset = new UsageDimensionState();

  private dirty = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> | null = null;

  constructor(opts: UsageAccumulatorOptions) {
    this.filePath = opts.filePath;
    this.debounceMs = opts.debounceMs ?? 300;
    this.atomicWrite = opts.atomicWrite ?? true;
  }

  /**
   * 启动时调用。
   *
   * - 文件存在 + valid v2：直接 apply 两份维度。
   * - 文件存在 + valid v1（旧 schema）：把旧 summary **同时**填进 lifetime / sinceReset，
   *   作为升级锚点；这样老用户升级后 UI 不会突然显示 0。
   * - 文件不存在 / 损坏：调用 `rebuildFromAllJsonl()` 兜底——只重建 `lifetime`，
   *   `sinceReset` 归零（reset 边界丢失，只能保守归零）。
   *
   * 该方法**不**立刻写盘，避免引导阶段产生 IO；下一次 `accumulate()` / 显式 `flush()`
   * 才会落盘。
   */
  async load(rebuildFromAllJsonl: () => Promise<SessionEvent[]>): Promise<void> {
    const snapshot = await this.tryReadFile();
    if (snapshot) {
      if (snapshot.schemaVersion === 2) {
        this.lifetime.apply(snapshot.lifetime);
        this.sinceReset.apply(snapshot.sinceReset);
      } else {
        // v1 → v2 迁移：单一 summary 同时作为 lifetime + sinceReset 起点
        const dim: DimensionSnapshot = {
          summary: snapshot.summary,
          seenCurrency: snapshot.seenCurrency,
          currencyMixed: snapshot.currencyMixed,
        };
        this.lifetime.apply(dim);
        this.sinceReset.apply(dim);
        // 标 dirty 让下一次 accumulate/flush 把文件升到 v2，但不主动写盘
        this.dirty = true;
      }
      return;
    }
    try {
      const events = await rebuildFromAllJsonl();
      this.lifetime.rebuildFromEvents(events);
      // sinceReset 保留为空：reset 边界丢失，无法推断"用户最后一次 reset 在哪"，保守归零。
      this.sinceReset.reset();
    } catch {
      // 完全失败：维持空 summary。controller 仍可正常运行，UI 上显示 "--"。
    }
  }

  /**
   * 收到一条 `llm_usage` payload 时调用——**同步**累加到两份维度。
   * debounced 写盘异步进行，不阻塞 eventSink 主路径。
   */
  accumulate(payload: LlmUsagePayload): void {
    this.lifetime.accumulate(payload);
    this.sinceReset.accumulate(payload);
    this.dirty = true;
    this.scheduleWrite();
  }

  /**
   * `重置今日` 时调用——**只清 `sinceReset`，保留 `lifetime`**。
   *
   * 这是与 v1 行为最大的差异：旧版会 `unlink` 整个文件，导致 lifetime 也归零。
   * 现在只是把 sinceReset 段写回 0，lifetime 维度不动；下次启动也能完整恢复。
   *
   * 等 in-flight 写完再写新版本，避免覆盖竞态。
   */
  async resetSinceReset(): Promise<void> {
    this.sinceReset.reset();
    this.dirty = true;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.pendingWrite) {
      try {
        await this.pendingWrite;
      } catch {
        // 上次失败不影响本次
      }
    }
    await this.persist();
  }

  /** 取当前累加快照（lifetime + sinceReset），用于推送给 renderer。 */
  getLifetimeSummary(): KairosUsageSummary {
    return this.lifetime.getSummary();
  }
  getSinceResetSummary(): KairosUsageSummary {
    return this.sinceReset.getSummary();
  }

  /** 等待所有 debounced 写盘落地；测试 / shutdown 时调用。 */
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (!this.dirty) {
      if (this.pendingWrite) await this.pendingWrite;
      return;
    }
    await this.persist();
  }

  // ─── Internal ────────────────────────────────────────────────────────

  private scheduleWrite(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.persist();
    }, this.debounceMs);
    if (typeof this.writeTimer === "object" && this.writeTimer && "unref" in this.writeTimer) {
      (this.writeTimer as { unref: () => void }).unref();
    }
  }

  private async persist(): Promise<void> {
    if (this.pendingWrite) {
      try {
        await this.pendingWrite;
      } catch {
        // 忽略前一次错误，继续尝试本次
      }
    }
    const snapshot: AccumulatorSnapshotV2 = {
      schemaVersion: 2,
      lifetime: this.lifetime.toSnapshot(),
      sinceReset: this.sinceReset.toSnapshot(),
      lastUpdatedAt: new Date().toISOString(),
    };
    this.dirty = false;
    this.pendingWrite = this.writeSnapshot(snapshot)
      .catch(() => {
        // 写盘失败：标 dirty，下次 accumulate / flush 会重试
        this.dirty = true;
      })
      .finally(() => {
        this.pendingWrite = null;
      });
    await this.pendingWrite;
  }

  private async writeSnapshot(snapshot: AccumulatorSnapshotV2): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (this.atomicWrite) {
      const tmp = `${this.filePath}.tmp`;
      await writeFile(tmp, json, "utf8");
      await rename(tmp, this.filePath);
    } else {
      await writeFile(this.filePath, json, "utf8");
    }
  }

  /**
   * 兼容读 v2 / v1；解析失败返回 null。
   * 该方法只关心**结构性**有效性，不校验业务字段（业务字段错误时也按"可用"
   * 返回，UI 会显示异常累计，但不至于让 controller 启动崩）。
   */
  private async tryReadFile(): Promise<AccumulatorSnapshotV2 | AccumulatorSnapshotV1 | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;

    if (obj.schemaVersion === 2) {
      const lifetime = obj.lifetime as DimensionSnapshot | undefined;
      const sinceReset = obj.sinceReset as DimensionSnapshot | undefined;
      if (!lifetime?.summary || typeof lifetime.summary.callCount !== "number") return null;
      if (!sinceReset?.summary || typeof sinceReset.summary.callCount !== "number") return null;
      return obj as unknown as AccumulatorSnapshotV2;
    }
    if (obj.schemaVersion === 1) {
      const summary = obj.summary as KairosUsageSummary | undefined;
      if (!summary || typeof summary.callCount !== "number") return null;
      return obj as unknown as AccumulatorSnapshotV1;
    }
    return null;
  }
}

// 让 vitest 友好导出（用于覆盖单元测试边界）
export { UsageDimensionState as __UsageDimensionState };
