import type { SessionRunState } from "./run-state.js";

/**
 * 一次模型请求还没定稿的输出（规范 agent-spec-live-assistant-stream §6）：轨迹的流式层按 `requestId`
 * 把它放进占位行。来自界面进程的运行状态，不读日志。
 */
export type RequestLiveOutput = {
  readonly messageId: string | null;
  readonly text: string;
  readonly thinking: string;
  /** 正在流式生成参数的工具调用；参数定稿后由日志里的 `tool/call` 显示。 */
  readonly calls: ReadonlyMap<string, { readonly toolName: string }>;
};

const NONE: ReadonlyMap<string, RequestLiveOutput> = new Map();

/** 运行状态里按请求归组的正文、思考与工具调用。没有请求身份的旧帧不计入。 */
export function requestOutputs(run: SessionRunState | undefined): ReadonlyMap<string, RequestLiveOutput> {
  if (run === undefined) return NONE;
  const outputs = new Map<string, { messageId: string | null; text: string; thinking: string; calls: Map<string, { toolName: string }> }>();
  const entry = (requestId: string) => {
    let output = outputs.get(requestId);
    if (output === undefined) { output = { messageId: null, text: "", thinking: "", calls: new Map() }; outputs.set(requestId, output); }
    return output;
  };
  for (const segment of run.state.segments) {
    if ((segment.type !== "text" && segment.type !== "thinking") || segment.llmCallId === undefined) continue;
    const output = entry(segment.llmCallId);
    output.messageId ??= segment.messageId ?? null;
    if (segment.type === "text") output.text += segment.text; else output.thinking += segment.text;
  }
  for (const [callId, tool] of run.state.activeTools) {
    if (tool.llmCallId !== undefined) entry(tool.llmCallId).calls.set(callId, { toolName: tool.toolName });
  }
  return outputs.size === 0 ? NONE : outputs;
}
