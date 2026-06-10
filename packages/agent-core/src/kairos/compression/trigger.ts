/**
 * KairosCompressionTrigger — 短期记忆压缩的触发与调度。
 *
 * 调用策略（design doc agent-kairos-autonomous-mode.md §压缩触发）：
 * - controller 在每次 tick 闭合（进入 sleep）后 fire-and-forget 调
 *   `maybeCompressInBackground()`，不阻塞调度循环；
 * - 触发条件：磁盘短期记忆全量 token ≥ contextWindow × compressionThreshold；
 * - 压缩对象：「前天往前」未被 summary 覆盖的日期，旧到新取最多 7 天，
 *   且限定同一自然月（week summary 落在该月目录，`findCoveringSummary`
 *   只查日期所在月目录——跨月批次会让另一个月的日期失去覆盖、重复加载）；
 * - 失败策略：吞错 + onWarning，跳过本轮，下次 tick 闭合后重试；
 * - V1 不做 intra-day fallback（当日数据单独超阈值的场景：单日 tick 量
 *   有限，实际很难触达；真发生时仅 warning 提示）。
 */
import type { ContextCompactionPayload, SessionEvent } from "@actspace/shared";
import type { LLMService } from "../../llm/types";
import { toIsoDate, type ShortMemoryStore } from "../storage/short-memory-store";
import type { KairosShortTermMemoryContext } from "../context/short-term";
import { compressKairosSegments } from "./compressor";

export interface KairosCompressionTriggerOptions {
  store: ShortMemoryStore;
  shortTerm: KairosShortTermMemoryContext;
  llm: LLMService;
  contextWindow: number;
  /** 闭包读取——config reload 后自动取到最新阈值。 */
  getCompressionThreshold: () => number;
  /** 压缩完成后由 controller 包装成完整 SessionEvent 落盘（留痕，不进 LLM 上下文）。 */
  emitCompactionEvent: (payload: ContextCompactionPayload) => Promise<void>;
  /** 压缩失败 / 超阈值但无可压缩日期时回调；不抛错。 */
  onWarning?: (message: string, cause?: unknown) => void;
  getAbortSignal?: () => AbortSignal | undefined;
  now?: () => Date;
  /** 单轮最多压缩的天数，默认 7（week summary）。 */
  maxDatesPerBatch?: number;
}

export type KairosCompressionOutcome =
  | { status: "skipped_in_flight" }
  | { status: "skipped_below_threshold"; diskTokens: number; thresholdTokens: number }
  | { status: "skipped_no_candidates"; diskTokens: number; thresholdTokens: number }
  | { status: "compressed"; diskTokens: number; thresholdTokens: number; label: string; summaryPath: string };

export class KairosCompressionTrigger {
  private readonly opts: KairosCompressionTriggerOptions;
  private inFlight = false;

  constructor(opts: KairosCompressionTriggerOptions) {
    this.opts = opts;
  }

  /** tick 闭合后调用；后台执行，不阻塞、不抛错。 */
  maybeCompressInBackground(): void {
    void this.runOnce().catch((err) => {
      this.opts.onWarning?.("Kairos 短期记忆压缩失败，本轮跳过", err);
    });
  }

  /** 完整执行一轮「阈值判定 → 选段 → 压缩 → 落盘」；测试直接调它。 */
  async runOnce(): Promise<KairosCompressionOutcome> {
    if (this.inFlight) return { status: "skipped_in_flight" };
    this.inFlight = true;
    try {
      return await this.execute();
    } finally {
      this.inFlight = false;
    }
  }

  private async execute(): Promise<KairosCompressionOutcome> {
    const { store, shortTerm, llm } = this.opts;
    const thresholdTokens = Math.floor(
      this.opts.contextWindow * this.opts.getCompressionThreshold(),
    );
    const diskTokens = await shortTerm.estimateDiskTokens();
    if (diskTokens < thresholdTokens) {
      return { status: "skipped_below_threshold", diskTokens, thresholdTokens };
    }

    const candidates = await this.pickCandidateDates();
    if (candidates.length === 0) {
      this.opts.onWarning?.(
        `Kairos 短期记忆超压缩阈值（${diskTokens}/${thresholdTokens} tokens），` +
          "但近两天之前没有可压缩的日期（intra-day 压缩暂未支持），本轮跳过",
      );
      return { status: "skipped_no_candidates", diskTokens, thresholdTokens };
    }

    const segments: SessionEvent[] = [];
    for (const date of candidates) {
      segments.push(...(await store.loadDailyAll(date)));
    }
    if (segments.length === 0) {
      return { status: "skipped_no_candidates", diskTokens, thresholdTokens };
    }

    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    // label 形如 week_06-01_to_06-07；parseWeekRange 用被检查日期的年份补齐，
    // 候选已限定同月（自然同年），覆盖判定安全。
    const label = `week_${first.slice(5)}_to_${last.slice(5)}`;
    const { markdown } = await compressKairosSegments({
      segments,
      kind: "week",
      rangeLabel: `${first} ~ ${last}`,
      llm,
      signal: this.opts.getAbortSignal?.(),
    });

    const monthDir = store.getMonthDir(first);
    const fileName = `${label}.summary.md`;
    await store.saveSummary(monthDir, fileName, markdown);
    const summaryPath = `${monthDir}/${fileName}`;

    await this.opts.emitCompactionEvent({
      triggerTokens: diskTokens,
      thresholdTokens,
      beforeCount: segments.length,
      afterCount: 1,
      summaryChars: markdown.length,
      historyRefPath: summaryPath,
    });

    return { status: "compressed", diskTokens, thresholdTokens, label, summaryPath };
  }

  /**
   * 候选日期：未被 summary 覆盖、且早于「昨天」的日期（保留今天/昨天原文），
   * 升序取最多 maxDatesPerBatch 天，并截断在第一个日期所在自然月内。
   */
  private async pickCandidateDates(): Promise<string[]> {
    const { store } = this.opts;
    const now = this.opts.now?.() ?? new Date();
    const cutoff = toIsoDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
    const maxDates = this.opts.maxDatesPerBatch ?? 7;

    const datesAscending = (await store.listAllDates()).slice().reverse();
    const picked: string[] = [];
    for (const date of datesAscending) {
      if (date > cutoff) break;
      const summaries = await store.listSummaries(store.getMonthDir(date));
      if (store.findCoveringSummary(date, summaries)) continue;
      if (picked.length > 0 && date.slice(0, 7) !== picked[0].slice(0, 7)) break;
      picked.push(date);
      if (picked.length >= maxDates) break;
    }
    return picked;
  }
}
