/**
 * Agent-core 内部工具类型体系
 *
 * 采用 definition + executor 分离模式：
 * - InternalTool：系统内部完整工具（含 handler/checkPermissions/renderResult/isReadOnly）
 * - Tool（来自 messages.ts）：给 LLM 看的 definition 子集（name/description/parameters）
 *
 * InternalTool.handler 返回统一的 ToolResult { success, data?, error? }，
 * 调度器用同一套逻辑处理所有工具的结果（裁剪、格式化、错误重试等）。
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/tools/tool-definition.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/tool-definition.ts
 */

import type { ImageContent, TextContent, Tool } from "./messages";
import type {
  AgentToolPreview,
  SessionEvent,
  SubAgentTranscriptRef,
  ToolPreviewKind,
  ToolOutputRef,
  ToolArtifact,
} from "@actspace/shared";

// ─── ToolResult（统一返回类型） ───

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 会话级产物引用；只保存本地路径和 MIME，不内联大文件。 */
  artifacts?: ToolArtifact[];
  /**
   * Optional rich content returned to the next LLM call. Use this when a tool
   * produces native model input such as an image; `data` remains the textual
   * summary used for UI previews and persisted output.
   */
  content?: (TextContent | ImageContent)[];
  /**
   * 工具全量输出的回读引用，由 executor / postProcess 填充、engine/bridge 消费：
   * - bash 大输出落盘：`{ kind: "file", value: <绝对路径> }`
   * - 非 bash 工具摘要：`{ kind: "inline", value: <截断/摘要前的全量文本> }`
   * 不影响传给 LLM 的 `data`（始终是回填文本），仅用于持久化契约与前端「查看完整输出」。
   */
  outputRef?: ToolOutputRef;
  /**
   * Executor 已按工具语义完成模型输出裁剪时，跳过通用 OutputTruncator。
   * 仅用于不能安全交给 flash 摘要的结构化读取结果，例如 DOM snapshot、
   * 精确工具 schema 和已分页的 Browser 列表。
   */
  preserveModelOutput?: boolean;
  /**
   * renderResult 把 data 替换为回填文本之前的原始结构化结果。
   * scheduler postProcess 填充、engine/bridge 消费：bash 的 backgrounded
   * taskId / sandboxed 等 preview 元数据从这里读，不再依赖 data 的形状。
   */
  structured?: unknown;
  /**
   * Keep the real result available to the current model call, but replace it
   * in session events, UI previews and run logs. Browser page/clipboard output
   * uses this boundary because it may contain credentials or private content.
   */
  redactInPersistence?: boolean;
  /**
   * Agent 工具专用的进程内元数据。bridge/main 消费它来推流和单独写 transcript，
   * 不应展开写入主 session.jsonl。
   */
  subagent?: {
    transcriptRef: SubAgentTranscriptRef;
    transcriptEvents: SessionEvent[];
    uiPreview: AgentToolPreview;
  };
}

// ─── Permission（权限验证） ───

export type ToolPermissionDecision = "allow" | "deny" | "ask";

export type ToolRiskLevel = "low" | "medium" | "high";

export interface PermissionResult {
  /** 权限决策只有三种：直接执行、硬拒绝、请求用户审核 */
  decision: ToolPermissionDecision;
  /** 给用户、日志或模型看的解释。deny/ask 时应提供 */
  reason?: string;
  /** 人类可读动作摘要，用于审核面板或日志 */
  summary?: string;
  /** 风险分层是决策元数据，不是额外决策状态 */
  riskLevel?: ToolRiskLevel;
  /** 是否允许把一次审批扩展为类似操作放行；缺省保留旧行为。 */
  allowSimilar?: boolean;
  /** 审批作用域；Browser Use 用 session 级租约替代逐命令审批。 */
  approvalScope?: "browser_session";
  /** 审批通过后计划使用的执行环境；当前用于 Bash 审批展示。 */
  executionEnvironment?: "sandbox" | "real";
  /** 验证通过后可修正参数（如路径展开、超时值清洗） */
  sanitizedArgs?: Record<string, unknown>;
}

// ─── 函数类型 ───

export type ToolHandler = (
  args: Record<string, unknown>,
  options?: import("./tools/manager").ToolExecuteOptions,
) => Promise<ToolResult>;
export type PermissionChecker = (args: Record<string, unknown>) => Promise<PermissionResult>;
export type ResultRenderer = (result: ToolResult) => string;

// ─── Parameter Schema ───

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string; enum?: string[] };
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required: string[];
  additionalProperties?: boolean;
}

// ─── InternalTool（系统内部完整工具） ───

export interface InternalTool {
  name: string;
  /** 工具描述：LLM 选择工具的唯一依据。应包含功能定位 + 使用约束 + 负面指引 */
  description: string;
  parameters: ToolParameterSchema;
  handler: ToolHandler;
  /** 权限验证，在执行前调用。可拒绝/修正参数/通过 */
  checkPermissions?: PermissionChecker;
  /** 结果格式化，将 ToolResult 转为 LLM 可读自然语言 */
  renderResult?: ResultRenderer;
  /** 工具分类 */
  category?: string;
  /** 前端展示语义，由 shared ToolUiPreview.kind 消费 */
  previewKind: ToolPreviewKind;
  /** 只读标记，影响审批模式和并行调度策略 */
  isReadOnly?: boolean;
  /**
   * 工具参数 → 路径数组的提取 hook。仅 Kairos 调用路径会读取它，
   * 用于 allowedRoots + blocklist 校验。主 Agent 调用时不会调用。
   */
  extractPaths?: (args: Record<string, unknown>) => string[];
}

// ─── InternalTool → Tool 转换 ───

export function toToolDefinition(tool: InternalTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
  };
}

// ─── InternalToolRegistry ───

export class InternalToolRegistry {
  private tools = new Map<string, InternalTool>();

  static from(tools: InternalTool[]): InternalToolRegistry {
    const registry = new InternalToolRegistry();
    for (const tool of tools) {
      registry.register(tool);
    }
    return registry;
  }

  register(tool: InternalTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): InternalTool | undefined {
    return this.tools.get(name);
  }

  getAll(): InternalTool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 导出为 LLM 消费的 Tool[] 格式 */
  getToolDefinitions(): Tool[] {
    return this.getAll().map(toToolDefinition);
  }
}
