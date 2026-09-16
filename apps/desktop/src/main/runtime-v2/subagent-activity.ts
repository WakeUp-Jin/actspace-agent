import type { AgentLoopLiveEvent } from "@actspace/runtime";

type ToolActivity = { active: string; recent: string };

/** Transient activity only: never retain or project streamed reply/reasoning text. */
export class SubagentActivity {
  readonly tools = new Map<string, ToolActivity>();
  label = "正在思考";
  recent = "";
  accept(event: AgentLoopLiveEvent): string {
    if (event.kind === "tool-prepared") {
      const args = event.arguments && typeof event.arguments === "object" && !Array.isArray(event.arguments) ? event.arguments as Readonly<Record<string, unknown>> : {};
      const path = typeof args.path === "string" ? args.path.split(/[\\/]/).filter(Boolean).at(-1) : undefined;
      const detail = safeDetail(event.name === "grep" || event.name === "glob" ? args.pattern : path);
      const verb = ({ read_file: "读取", list_directory: "查看目录", grep: "搜索", glob: "查找" } as Record<string, string>)[event.name] ?? "执行工具";
      this.tools.set(event.callId, { active: `正在${verb}${detail ? ` · ${detail}` : ""}`, recent: `刚${verb}${detail ? ` ${detail}` : ""}` });
    } else if (event.kind === "tool-started") {
      if (!this.tools.has(event.callId)) this.tools.set(event.callId, { active: "正在执行工具", recent: "刚执行工具" });
    } else if (event.kind === "tool-finished") {
      const tool = this.tools.get(event.callId);
      if (tool) this.recent = event.result.status === "completed" ? tool.recent : tool.recent.replace(/^刚/, "刚尝试");
      this.tools.delete(event.callId);
      this.label = "正在分析";
    } else if (event.kind === "assistant-delta") this.label = "正在整理回复";
    else if (event.kind === "reasoning-delta") this.label = "正在分析";
    else if (event.kind === "run-state") {
      if (event.message === "request-started" || event.message === "step-started") this.label = "正在思考";
      if (["completed", "failed", "aborted", "step-limit"].includes(event.message)) {
        this.tools.clear();
        this.recent = "";
        this.label = event.message === "completed" ? "正在交回结果" : event.message === "step-limit" ? "达到执行步数上限" : event.message === "aborted" ? "已停止" : "执行失败";
      }
    }
    const active = [...this.tools.values()];
    if (active.length > 1) return `正在执行 ${active.length} 项工具调用 · ${active.at(-1)!.active}`;
    if (active.length === 1) return active[0]!.active;
    return this.recent && this.label !== "正在整理回复" ? `${this.label} · ${this.recent}` : this.label;
  }
}

function safeDetail(value: unknown): string {
  // Hide credential-shaped values, not ordinary names such as token-usage.ts.
  if (typeof value !== "string" || /(?:api[_-]?key|secret|password|token)\s*[=:]\s*\S|bearer\s+\S|\bsk-[a-z0-9_-]{16,}/i.test(value)) return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 72);
}
