import type { TrajectoryCellKind, TrajectoryStatus } from "./contract";

/** DSH 轨迹页的中文文案（zh locale），只收录 ActSpace 用到的条目。 */
export const T = {
  toolbarAria: "轨迹工具栏",
  duration: "时长",
  useActualDuration: "使用实际时长",
  useEqualWidth: "使用等宽操作",
  turns: "轮次",
  expandTurns: "展开所有轮次",
  collapseTurns: "收起所有轮次",
  calls: "调用",
  expandCalls: "展开所有调用",
  collapseCalls: "收起所有调用",
  search: "搜索轨迹",
  searchPlaceholder: "搜索",
  stop: "停止",
  stopping: "正在停止…",
  betweenTurns: "轮次之间",
  messageGroup: "消息",
  notAvailable: "不可用",
  notRecorded: "未记录",
  stepStartUnavailable: "步骤开始时间不可用",
  firstTokenUnavailable: "首 token 时间不可用",
  usageUnavailable: "用量不可用",
  outputTokensUnavailable: "输出 token 数不可用",
  durationTooShort: "时长过短",
  showLocalTime: "显示本地时间",
  showUnixTimestamp: "显示 Unix 时间戳",
  started: "开始时间",
  totalDuration: "总时长",
  ttft: "首 token 延迟",
  generation: "生成",
  throughput: "吞吐量",
  timingSource: "计时来源",
  sessionTimestamps: "会话时间戳",
  sessionTimestampsRunning: "会话时间戳（运行中）",
  requestTiming: "请求计时",
  tokens: "Token",
  reasoning: "推理",
  content: "内容",
  usageNotReported: "未报告用量",
  usageInput: "输入",
  usageCached: "缓存读取",
  usageCacheCreated: "缓存写入",
  usageOther: "其他",
  usageOutput: "输出",
  usageThisRequest: "本次请求",
  usageSessionCumulative: "会话累计",
  optionsNotRecorded: "未记录选项",
  sourceNotRecorded: "未记录来源",
  toolCallOnly: "（仅工具调用）",
  noContent: "无内容",
  noPayload: "未捕获参数",
  noResult: "未捕获结果",
  noOutput: "无输出",
  schemaUnavailable: "Schema 不可用",
  parameters: "参数",
  thinking: "思考",
  systemPromptMissing: "本次请求没有系统提示词",
  toolsMissing: "本次请求没有工具",
  openBlockSummaryTitle: "打开工具调用概述",
  loadingTrajectory: "正在加载轨迹…",
  loadingEarlier: "正在加载更早的历史…",
  loadEarlier: "加载更早的历史",
  compactionPurpose: "压缩",
  details: "事件详情",
  resize: "调整事件详情宽度",
  resizeTitle: "拖动调整大小；双击恢复默认值。",
  close: "关闭详情",
  status: "状态",
  purpose: "用途",
  provider: "提供方",
  model: "模型",
  toolCalls: "工具调用",
  subtoolCalls: "子工具调用",
  error: "错误",
  lastAttemptError: "上次尝试错误",
  retry: "重试",
  retryDelay: "重试延迟",
  result: "结果",
  compacted: "已压缩",
  assistantMessage: "助手消息",
  source: "来源",
  hierarchy: "层级",
  toolCall: "工具调用",
  approval: "审批",
  timelineAria: "轨迹时间线",
  timelineOverviewAria: "时间线概览；水平拖动可聚焦事件",
  noTimingData: "无计时数据",
  compacting: "正在压缩上下文…",
  compactionFailed: "上下文压缩失败",
  contextCompacted: "上下文已压缩",
  optionsJson: "请求选项 JSON",
  messageSourceJson: "消息来源 JSON",
  resultJson: "结果 JSON",
  payloadJson: "参数 JSON",
  sourceUser: "用户",
  sourceGoal: "目标",
  sourceUnknown: "未知",
  toolCallUnavailable: "工具调用不可用",
} as const;

export const KIND_LABEL: Record<TrajectoryCellKind, string> = {
  system: "系统",
  user: "用户",
  context: "上下文",
  compacted: "已压缩",
  message: "助手",
  tool: "工具",
  subtool: "子工具",
};

export const STATUS_LABEL: Record<TrajectoryStatus, string> = { completed: "已完成", running: "等待中", failed: "失败" };
export const APPROVAL_LABEL = { pending: "等待批准", allowed: "已允许", denied: "已拒绝" } as const;

export const TAB_LABEL = {
  overview: "概述",
  rawOutput: "原始输出",
  preview: "预览",
  raw: "原始内容",
  source: "来源",
  payload: "参数",
  result: "结果",
  schema: "Schema",
  timing: "计时",
  diff: "差异",
  systemPrompt: "系统提示词",
  tools: "工具",
  options: "选项",
  usage: "用量",
} as const;

export const turnLabel = (turn: number) => `第 ${turn} 轮`;
export const stepLabel = (step: number) => `第 ${step} 步`;
export const requestLabel = (request: number) => `请求 #${request}`;
export const compactionSection = (section: string) => `压缩 · ${section}`;
export const toolCallsSummary = (count: number) => `${count} 个工具调用`;
export const stepsSummary = (count: number) => `${count} 个步骤`;
export const blockLabel = (index: number, type: string) => `块 #${index} ${type}`;
export const openBlockSummary = (index: number) => `打开第 ${index} 个块的工具调用概述`;
export const timelineTotal = (duration: string) => `总计 ${duration}`;
export const timelineTtftDecoding = (ttft: string, decoding: string) => `首 token ${ttft} · 解码 ${decoding}`;
export const collapsedRowAria = (kind: "turn" | "assistant", summary: string) => `已收起的${kind === "turn" ? "轮次" : "助手"}概述，${summary}`;
export const rowAria = (request: number | null, kind: string, content: string) =>
  `${request === null ? "" : `请求 ${request}，`}${kind}，${content || "无内容"}`;
export const namedParametersJson = (name: string) => `${name} 参数 JSON`;
export const goalRoundLabel = (round: number) => `目标 · Round ${round}`;
