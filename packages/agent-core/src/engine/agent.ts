/**
 * Agent — 极简入口类
 *
 * 只做三件事：
 * 1. 组装：持有 llm + contextManager + toolManager 的引用
 * 2. 入口：提供 run(userText) 方法
 * 3. 取消：持有 AbortController，提供 abort()
 *
 * 不做状态管理（isStreaming 等是 UI 层关注点）。
 *
 * run 流程：
 * 构造 UserMessage → appendMessage → getContext → 附加 tools → runAgentLoop → 返回结果
 *
 * 设计参考：.agents/skills/llm-agent-dev/examples/agent-loop.ts
 */

import type { UserMessage } from "../messages";
import { MessagePriority, getTextContent } from "../messages";
import type { LLMService } from "../llm/types";
import type { ToolManager } from "../tools/manager";
import type { ContextManager } from "../context/manager";
import type { Summarizer } from "../context/compression/summarizer";
import type { CacheAuditTracker } from "../observability/cache-audit";
import { toToolDefinition } from "../internal-tools";
import { runAgentLoop } from "./loop";
import type {
  AgentEventSink,
  AgentLoopConfig,
  AgentLoopResult,
  ToolExecutionMode,
} from "./types";

export interface AgentOptions {
  llm: LLMService;
  contextManager: ContextManager;
  toolManager: ToolManager;
  onEvent?: AgentEventSink;
  toolExecution?: ToolExecutionMode;
  shouldStopAfterTurn?: AgentLoopConfig["shouldStopAfterTurn"];
  getSteeringMessages?: AgentLoopConfig["getSteeringMessages"];
  getFollowUpMessages?: AgentLoopConfig["getFollowUpMessages"];
  thinkingEnabled?: boolean;
  /**
   * flash 摘要器，用于 mid-loop 历史压缩。缺省时仍会按 token 水位触发压缩，
   * 但 HistoryCompactor 内部退化为「丢弃最旧 + session.jsonl 指针」兜底。
   */
  summarizer?: Summarizer;
  cacheAudit?: CacheAuditTracker;
}

export class Agent {
  private llm: LLMService;
  private contextManager: ContextManager;
  private toolManager: ToolManager;
  private abortController?: AbortController;
  private onEvent?: AgentEventSink;
  private toolExecution?: ToolExecutionMode;
  private shouldStopAfterTurn?: AgentLoopConfig["shouldStopAfterTurn"];
  private getSteeringMessages?: AgentLoopConfig["getSteeringMessages"];
  private getFollowUpMessages?: AgentLoopConfig["getFollowUpMessages"];
  private thinkingEnabled?: boolean;
  private summarizer?: Summarizer;
  private cacheAudit?: CacheAuditTracker;

  constructor(options: AgentOptions) {
    this.llm = options.llm;
    this.contextManager = options.contextManager;
    this.toolManager = options.toolManager;
    this.onEvent = options.onEvent;
    this.toolExecution = options.toolExecution;
    this.shouldStopAfterTurn = options.shouldStopAfterTurn;
    this.getSteeringMessages = options.getSteeringMessages;
    this.getFollowUpMessages = options.getFollowUpMessages;
    this.thinkingEnabled = options.thinkingEnabled;
    this.summarizer = options.summarizer;
    this.cacheAudit = options.cacheAudit;
  }

  /** 执行一次完整的 agent 交互 */
  async run(userText: string): Promise<AgentLoopResult> {
    const userMsg: UserMessage = {
      role: "user",
      content: userText,
      timestamp: Date.now(),
      source: "user",
      priority: MessagePriority.HIGH,
    };
    this.contextManager.appendMessage(userMsg);

    // 将 ToolManager 中的工具定义注入 Context
    const toolDefs = this.toolManager.getAll().map((t) => toToolDefinition(t));
    this.contextManager.setTools(toolDefs);

    const context = this.contextManager.getContext();

    this.abortController = new AbortController();

    const config: AgentLoopConfig = {
      toolManager: this.toolManager,
      toolExecution: this.toolExecution,
      shouldStopAfterTurn: this.shouldStopAfterTurn,
      getSteeringMessages: this.getSteeringMessages,
      getFollowUpMessages: this.getFollowUpMessages,
      thinkingEnabled: this.thinkingEnabled,
      cacheAudit: this.cacheAudit,
      maybeCompact: async () => {
        const report = await this.contextManager.compactIfNeeded(this.summarizer);
        if (!report?.compacted) return null;
        return {
          messages: this.contextManager.getMessages(),
          trigger: "auto",
          status: "compacted",
          triggerTokens: report.triggerTokens,
          thresholdTokens: report.thresholdTokens,
          beforeCount: report.beforeCount,
          afterCount: report.afterCount,
          removedCount: report.removedCount,
          summaryChars: report.summaryChars,
          historyRefPath: report.historyRefPath,
          reason: report.reason,
        };
      },
    };

    const emit: AgentEventSink = this.onEvent ?? (() => {});

    try {
      return await runAgentLoop(
        context,
        this.llm,
        config,
        emit,
        this.abortController.signal,
      );
    } finally {
      this.abortController = undefined;
    }
  }

  /** 获取最后一次交互的文本回复 */
  async runAndGetText(userText: string): Promise<string> {
    const result = await this.run(userText);
    return getTextContent(result.message);
  }

  /** 取消当前执行 */
  abort(): void {
    this.abortController?.abort();
  }
}
