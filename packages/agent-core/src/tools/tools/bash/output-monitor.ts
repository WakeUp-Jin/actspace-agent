/**
 * 后台 bash 任务输出监控：输出订阅（notifyOnOutput）+ 交互式卡死看门狗
 *
 * 挂在 startProcessSink 的 onChunk 回调链上做增量行扫描（不重读文件）。
 * 订阅匹配从进程启动就开始记录，但通知只在任务转后台（attach）之后投递；
 * 前台完成的命令输出已全量回填，订阅无意义，pending 匹配直接丢弃。
 *
 * 设计事实来源：docs/design-docs/agent-bash工具设计文档.md「三个事件源」。
 */

export interface OutputSubscriptionSpec {
  /** 行级匹配正则（编译失败在 executor 层拒绝）。 */
  pattern: string;
  /** ≤ 5 词的订阅原因，通知与前端展示用。 */
  reason: string;
  /** 通知节流，最小 5_000ms。 */
  debounceMs: number;
}

export interface TaskOutputMonitorEvents {
  /** 订阅正则命中（过 debounce 后）。参数为命中行。 */
  onOutputMatch: (line: string) => void;
  /** 输出停滞且尾行像交互式提问。参数为尾行。 */
  onStall: (tailLine: string) => void;
  /** 卡死后输出恢复（仅前端状态复位用，不通知模型）。 */
  onStallRecovered?: () => void;
}

export const MIN_SUBSCRIPTION_DEBOUNCE_MS = 5_000;
export const MAX_SUBSCRIPTION_PATTERN_LENGTH = 256;
const DEFAULT_STALL_TIMEOUT_MS = 45_000;
/** 行长截断后再匹配，防御灾难性回溯正则。 */
const MAX_SCAN_LINE_LENGTH = 4_096;
/** attach 前暂存的命中行上限。 */
const MAX_PENDING_MATCHES = 20;

/** 交互式提问尾行特征：两条件看门狗的第二个条件（第一个是输出停滞）。 */
const INTERACTIVE_PROMPT_RE =
  /(\(y\/n\)|\[y\/n\]|\(yes\/no\)|\[yes\/no\]|password[^\n]{0,40}:\s*$|passphrase[^\n]{0,40}:\s*$|press enter|continue\?|are you sure|proceed\?|overwrite[^\n]{0,40}\?)/i;

export class TaskOutputMonitor {
  private lineBuffer = "";
  private lastCompletedLine = "";
  private readonly regex?: RegExp;
  private readonly subscription?: OutputSubscriptionSpec;
  private readonly stallTimeoutMs: number;

  private events?: TaskOutputMonitorEvents;
  private pendingMatches: string[] = [];
  private lastMatchNotifiedAt = 0;
  private stallTimer?: ReturnType<typeof setTimeout>;
  private stalled = false;
  private disposed = false;

  constructor(options: { subscription?: OutputSubscriptionSpec; stallTimeoutMs?: number } = {}) {
    this.subscription = options.subscription;
    this.stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    if (options.subscription) {
      // 编译失败让它在 executor 的参数校验层就抛出，这里不再兜
      this.regex = new RegExp(options.subscription.pattern);
    }
  }

  /** startProcessSink onChunk 回调入口。 */
  handleChunk = (text: string): void => {
    if (this.disposed) return;

    // 卡死恢复：停滞期后有任何新输出即复位
    if (this.stalled) {
      this.stalled = false;
      this.events?.onStallRecovered?.();
    }
    this.resetStallTimer();

    if (!text) return;
    this.lineBuffer += text;

    const lines = this.lineBuffer.split("\n");
    // 最后一段是未完成行，留在缓冲里
    this.lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line) this.lastCompletedLine = line;
      this.scanLine(line);
    }
    // 防御：未完成行过长时截断收缩，避免无换行输出把缓冲撑爆
    if (this.lineBuffer.length > MAX_SCAN_LINE_LENGTH) {
      this.lastCompletedLine = this.lineBuffer.slice(0, MAX_SCAN_LINE_LENGTH);
      this.scanLine(this.lastCompletedLine);
      this.lineBuffer = "";
    }
  };

  /** 任务转后台时挂接事件；attach 前的命中会补投（过 debounce）。 */
  attach(events: TaskOutputMonitorEvents): void {
    if (this.disposed) return;
    this.events = events;
    const pending = this.pendingMatches;
    this.pendingMatches = [];
    for (const line of pending) {
      this.notifyMatch(line);
    }
    this.resetStallTimer();
  }

  /** 任务终态时停表。 */
  dispose(): void {
    this.disposed = true;
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
    this.events = undefined;
    this.pendingMatches = [];
  }

  private scanLine(line: string): void {
    if (!this.regex) return;
    const scannable = line.length > MAX_SCAN_LINE_LENGTH ? line.slice(0, MAX_SCAN_LINE_LENGTH) : line;
    if (!this.regex.test(scannable)) return;

    if (this.events) {
      this.notifyMatch(scannable);
    } else if (this.pendingMatches.length < MAX_PENDING_MATCHES) {
      this.pendingMatches.push(scannable);
    }
  }

  private notifyMatch(line: string): void {
    const debounce = Math.max(MIN_SUBSCRIPTION_DEBOUNCE_MS, this.subscription?.debounceMs ?? MIN_SUBSCRIPTION_DEBOUNCE_MS);
    const now = Date.now();
    if (now - this.lastMatchNotifiedAt < debounce) return;
    this.lastMatchNotifiedAt = now;
    this.events?.onOutputMatch(line);
  }

  private resetStallTimer(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    // 只有挂接后（已转后台）才需要看门狗
    if (!this.events || this.disposed) return;
    this.stallTimer = setTimeout(() => {
      const tail = (this.lineBuffer || this.lastCompletedLine).trimEnd();
      // 两条件缺一不可：停滞 + 尾行像交互式提问；慢构建（尾行是普通日志）不误报
      if (tail && INTERACTIVE_PROMPT_RE.test(tail)) {
        this.stalled = true;
        this.events?.onStall(tail);
      }
      // 未命中提问模式：不重排定时器，等下一次输出重置（持续静默的普通慢命令只检查一次）
    }, this.stallTimeoutMs);
    this.stallTimer.unref?.();
  }
}
