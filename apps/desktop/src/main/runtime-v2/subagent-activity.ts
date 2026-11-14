// 实现已迁到 @actspace/client/live，Web 端共用。
import { SubagentActivity } from "@actspace/client/live";
import type { AgentLiveEvent } from "@actspace/shared/runtime-v2";
export { SubagentActivity };

const TERMINAL = new Set(["completed", "failed", "aborted", "step-limit"]);
const LIMIT = 200;

/**
 * 每个运行中子会话此刻在做什么（右侧「子 Agent」列表第二行，front-子Agent与后台任务规范 §2.2）。
 * 后台派发的工具早已返回，渲染流里的父调用找不到了，所以按子会话 id 另记；只在内存里，run 结束即删。
 */
export class SubagentActivityBoard {
  readonly #entries = new Map<string, { activity: SubagentActivity; label: string }>();

  accept(event: AgentLiveEvent): void {
    if (!event.parentSessionId) return;
    if (event.kind === "run-state" && TERMINAL.has(event.message)) {
      this.#entries.delete(event.sessionId);
      return;
    }
    let entry = this.#entries.get(event.sessionId);
    if (!entry) {
      if (this.#entries.size >= LIMIT) this.#entries.delete(this.#entries.keys().next().value!);
      entry = { activity: new SubagentActivity(), label: "" };
      this.#entries.set(event.sessionId, entry);
    }
    entry.label = entry.activity.accept(event);
  }

  /** 子会话当前的动态；没有记录（还没事件、已结束、应用重启后）时为空。 */
  label(childSessionId: string): string | undefined {
    return this.#entries.get(childSessionId)?.label || undefined;
  }
}
