/**
 * Kairos 额度护栏的**单一余额**运行态存储。
 *
 * 模型（与用户多轮确认）：
 * - 只有一个开关 `enabled` + 一个余额 `balanceCny`（剩余可花的钱，单位 ¥）。
 * - 运行时每次模型回复都把成本从余额里**扣减**（`deduct`），余额这个数不断变小。
 * - `enabled && balanceCny <= 0` → 余额耗尽，controller 据此暂停 Kairos。
 * - 用户在设置页可随时改这个余额（充值 = 改大），走 `setBudget`。
 *
 * 为什么独立成一个运行态文件（`memory/budget-state.json`），而不放 `preferences.json`：
 * 余额是 Kairos 每跑一次就回写的高频运行态数据，放进配置文件会触发配置热重载、与用户
 * 手动编辑打架，概念上也把"配置"和"运行时变化的数"混在一起。这里照抄
 * `usage-accumulator.ts` 的 debounce + atomic rename 写盘范式，但语义更简单。
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { KairosBudgetRuntime } from "@actspace/shared";

interface BudgetStateSnapshot {
  schemaVersion: 1;
  enabled: boolean;
  balanceCny: number;
  updatedAt: string;
}

export interface BudgetStoreOptions {
  filePath: string;
  /** deduct 触发的 debounce 写盘延迟（ms）。默认 300，与 usage-accumulator 对齐。 */
  debounceMs?: number;
  atomicWrite?: boolean;
}

/** 余额按 ¥ 的 6 位小数取整，避免浮点误差累积成 0.30000000000000004。 */
function roundCny(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export class KairosBudgetStore {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private readonly atomicWrite: boolean;

  private enabled = false;
  private balanceCny = 0;

  private dirty = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingWrite: Promise<void> | null = null;

  constructor(opts: BudgetStoreOptions) {
    this.filePath = opts.filePath;
    this.debounceMs = opts.debounceMs ?? 300;
    this.atomicWrite = opts.atomicWrite ?? true;
  }

  /**
   * 启动时调用。
   * - 文件存在 + 合法：apply enabled / balanceCny。
   * - 文件不存在 / 损坏：保持默认 `enabled=false`、`balanceCny=0`（无限运行，不误伤）。
   *
   * 不立刻写盘，避免引导阶段产生 IO；下一次 deduct / setBudget / flush 才落盘。
   */
  async load(): Promise<void> {
    const snapshot = await this.tryReadFile();
    if (snapshot) {
      this.enabled = snapshot.enabled === true;
      this.balanceCny = Number.isFinite(snapshot.balanceCny) ? snapshot.balanceCny : 0;
    }
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  getBalance(): number {
    return this.balanceCny;
  }

  /** 当前额度运行态快照（含派生的 `exhausted`），用于推送给 renderer。 */
  getRuntime(): KairosBudgetRuntime {
    return {
      enabled: this.enabled,
      balanceCny: this.balanceCny,
      exhausted: this.enabled && this.balanceCny <= 0,
    };
  }

  /**
   * 运行时扣减余额——controller 收到 `llm_usage` 且 `enabled` 时调。
   * `cny` 非正 / NaN 忽略（如未匹配定价的模型 cost=0）。debounce 写盘。
   */
  deduct(cny: number): void {
    if (!Number.isFinite(cny) || cny <= 0) return;
    this.balanceCny = roundCny(this.balanceCny - cny);
    this.dirty = true;
    this.scheduleWrite();
  }

  /**
   * 设置页「额度限制」开关 + 「剩余额度」输入 → 覆盖 enabled + balanceCny，立即落盘。
   * `balanceCny` 非有限 / 负数时保持原值不动（防御非法输入）。
   */
  async setBudget(input: { enabled: boolean; balanceCny: number }): Promise<void> {
    this.enabled = input.enabled === true;
    if (Number.isFinite(input.balanceCny) && input.balanceCny >= 0) {
      this.balanceCny = roundCny(input.balanceCny);
    }
    this.dirty = true;
    await this.persistNow();
  }

  /** 等待所有 debounced 写盘落地；shutdown / 测试时调用。 */
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

  /** 取消 pending debounce 并立即写一次（setBudget 用）。 */
  private async persistNow(): Promise<void> {
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

  private async persist(): Promise<void> {
    if (this.pendingWrite) {
      try {
        await this.pendingWrite;
      } catch {
        // 忽略前一次错误，继续尝试本次
      }
    }
    const snapshot: BudgetStateSnapshot = {
      schemaVersion: 1,
      enabled: this.enabled,
      balanceCny: this.balanceCny,
      updatedAt: new Date().toISOString(),
    };
    this.dirty = false;
    this.pendingWrite = this.writeSnapshot(snapshot)
      .catch(() => {
        // 写盘失败：标 dirty，下次 deduct / flush 重试
        this.dirty = true;
      })
      .finally(() => {
        this.pendingWrite = null;
      });
    await this.pendingWrite;
  }

  private async writeSnapshot(snapshot: BudgetStateSnapshot): Promise<void> {
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

  /** 解析失败 / 文件不存在返回 null；只关心结构性有效性。 */
  private async tryReadFile(): Promise<BudgetStateSnapshot | null> {
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
    if (typeof obj.balanceCny !== "number") return null;
    return {
      schemaVersion: 1,
      enabled: obj.enabled === true,
      balanceCny: obj.balanceCny,
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
    };
  }
}
