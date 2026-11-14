/**
 * 请求记录的读取规则（规范 agent-spec-request-record.md §4.3）。
 *
 * `request/system-prompt`、`request/tools` 只在内容变化时写。某次请求生效的提示词与工具，
 * 是 seq 不大于该请求 `request/context` 的最近一条。所有读取方都用这里的函数，不各写一套。
 */

export type RequestRecordEvent = { readonly seq: number; readonly type: string; readonly data: unknown };

export type RequestSystemPromptSection = {
  readonly id: string;
  readonly owner: string;
  readonly order: number;
  readonly content: unknown;
  readonly provenance?: unknown;
};
export type RequestModelFact = {
  readonly owner: string;
  readonly id: string;
  readonly order: number;
  readonly content: unknown;
};

export type RequestSystemPromptData = {
  readonly requestId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly digest: string;
  readonly sections: readonly RequestSystemPromptSection[];
  readonly modelFacts: readonly RequestModelFact[];
  readonly contributorProvenance: readonly unknown[];
};

export type RequestToolsData = {
  readonly requestId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly digest: string;
  readonly tools: readonly { readonly name: string; readonly pluginId?: string; readonly [key: string]: unknown }[];
};

export type EffectiveRequestRecord = {
  readonly systemPrompt?: { readonly seq: number; readonly data: RequestSystemPromptData };
  readonly tools?: { readonly seq: number; readonly data: RequestToolsData };
};

export const REQUEST_SYSTEM_PROMPT_EVENT = "request/system-prompt";
export const REQUEST_TOOLS_EVENT = "request/tools";

export function isRequestRecordEvent(type: string): boolean {
  return type === REQUEST_SYSTEM_PROMPT_EVENT || type === REQUEST_TOOLS_EVENT;
}

/** 不晚于 `atSeq` 的最近一条提示词与工具。`atSeq` 省略时取最新。 */
export function effectiveRequestRecord(
  events: readonly RequestRecordEvent[],
  atSeq = Number.POSITIVE_INFINITY,
): EffectiveRequestRecord {
  let systemPrompt: EffectiveRequestRecord["systemPrompt"];
  let tools: EffectiveRequestRecord["tools"];
  for (let index = events.length - 1; index >= 0 && (systemPrompt === undefined || tools === undefined); index--) {
    const event = events[index];
    if (event.seq > atSeq) continue;
    if (systemPrompt === undefined && event.type === REQUEST_SYSTEM_PROMPT_EVENT)
      systemPrompt = { seq: event.seq, data: event.data as RequestSystemPromptData };
    else if (tools === undefined && event.type === REQUEST_TOOLS_EVENT)
      tools = { seq: event.seq, data: event.data as RequestToolsData };
  }
  return { ...(systemPrompt ? { systemPrompt } : {}), ...(tools ? { tools } : {}) };
}

/**
 * 一次扫描建好索引，之后按 seq 查（轨迹、历史投影要对每个请求都查一次）。
 * `events` 需按 seq 升序。
 */
export function indexRequestRecords(events: readonly RequestRecordEvent[]): (atSeq?: number) => EffectiveRequestRecord {
  const prompts = events.filter((event) => event.type === REQUEST_SYSTEM_PROMPT_EVENT);
  const tools = events.filter((event) => event.type === REQUEST_TOOLS_EVENT);
  const latest = (list: readonly RequestRecordEvent[], atSeq: number) => {
    let low = 0,
      high = list.length - 1,
      found: RequestRecordEvent | undefined;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (list[mid].seq <= atSeq) {
        found = list[mid];
        low = mid + 1;
      } else high = mid - 1;
    }
    return found;
  };
  return (atSeq = Number.POSITIVE_INFINITY) => {
    const prompt = latest(prompts, atSeq);
    const tool = latest(tools, atSeq);
    return {
      ...(prompt ? { systemPrompt: { seq: prompt.seq, data: prompt.data as RequestSystemPromptData } } : {}),
      ...(tool ? { tools: { seq: tool.seq, data: tool.data as RequestToolsData } } : {}),
    };
  };
}
