/**
 * ContextManager — 统一编排器
 *
 * 持有 Context 对象，协调各 ContextModule 构建完整的 LLM 调用输入。
 *
 * 编排流程：
 * 1. 调用各模块的 format() 收集 systemParts
 * 2. 所有 systemParts 通过 render() 渲染为 XML 标签文本，拼接为 context.systemPrompt
 * 3. 返回 context（messages 已通过 ConversationContext 管理）
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/context-manager.ts
 */

import type { ContextUsageSnapshot } from "@actspace/shared";
import type { Context, Message, Tool } from "../messages";
import type { ContextModule, CompressionConfig } from "./types";
import { SystemPart } from "./types";
import { ConversationContext } from "./modules/conversation";
import {
  estimateTokens,
  estimateMessagesTokens,
  createContextUsageSnapshot,
} from "./token-estimator";

export interface ContextManagerOptions {
  /** 系统提示词模块（或其他模块组合） */
  systemPromptModule: ContextModule;
  /** 长期记忆模块（V1） */
  longTermModule?: ContextModule;
  /** 压缩配置 */
  config?: Partial<CompressionConfig>;
  /**
   * 可选：注入已构造好的 conversation 模块（用于 async 工厂、测试或 mock 场景）。
   * 缺省时构造一个空的 ConversationContext。
   */
  conversation?: ConversationContext;
}

/** createForSession 的可选输入，可选 sessionPath 用来一次性预加载历史 */
export interface ContextManagerForSessionOptions
  extends Omit<ContextManagerOptions, "conversation"> {
  /** session.jsonl 路径；若不提供则构造空会话历史 */
  sessionPath?: string;
}

const DEFAULT_CONFIG: CompressionConfig = {
  contextWindow: 200_000,
  compressionThreshold: 0.85,
  compressKeepRatio: 0.3,
};

export class ContextManager {
  private systemPromptModule: ContextModule;
  private longTermModule?: ContextModule;
  private conversation: ConversationContext;
  private config: CompressionConfig;
  private tools: Tool[] = [];

  constructor(options: ContextManagerOptions) {
    this.systemPromptModule = options.systemPromptModule;
    this.longTermModule = options.longTermModule;
    this.conversation = options.conversation ?? new ConversationContext();
    this.config = { ...DEFAULT_CONFIG, ...options.config };
  }

  /**
   * async 工厂：面向特定 session 构造 ContextManager。
   *
   * 在构造阶段一次性完成会话历史加载（委托 ConversationContext.createFromSession），
   * 让运行期 getContext() 始终同步可用且自然包含完整历史。
   *
   * 与 SystemPromptContext 在构造时吃 corePrompt 的机制保持一致：
   * 上下文模块统一是"构造时吃数据、运行期只读内存"。
   *
   * @param options - sessionPath 缺省时只是普通空会话历史
   */
  static async createForSession(
    options: ContextManagerForSessionOptions,
  ): Promise<ContextManager> {
    const { sessionPath, ...rest } = options;
    const conversation = sessionPath
      ? await ConversationContext.createFromSession(sessionPath)
      : new ConversationContext();
    return new ContextManager({ ...rest, conversation });
  }

  /** 追加消息到会话历史 */
  appendMessage(message: Message): void {
    this.conversation.appendMessage(message);
  }

  /** 设置可用工具列表 */
  setTools(tools: Tool[]): void {
    this.tools = tools;
  }

  /**
   * 返回完整的 Context。
   * 从模块收集 systemParts 并刷新 systemPrompt，附加 tools，返回完整输入。
   */
  getContext(): Context {
    const systemPrompt = this.buildSystemPrompt();
    const messages = this.conversation.getMessages();

    return {
      systemPrompt,
      messages,
      tools: this.tools.length > 0 ? this.tools : undefined,
    };
  }

  /** 判断是否需要触发压缩 */
  needsCompression(): boolean {
    const tokens = this.estimateTotalTokens();
    return tokens >= this.config.contextWindow * this.config.compressionThreshold;
  }

  /** 获取当前 Token 估算总量 */
  estimateTotalTokens(): number {
    const ctx = this.getContext();
    let total = 0;
    if (ctx.systemPrompt) {
      total += estimateTokens(ctx.systemPrompt);
    }
    total += estimateMessagesTokens(ctx.messages);
    if (ctx.tools) {
      total += estimateTokens(JSON.stringify(ctx.tools));
    }
    return total;
  }

  /** 生成 ContextUsageSnapshot（驱动前端 Context popup） */
  getUsageSnapshot(): ContextUsageSnapshot {
    const ctx = this.getContext();
    const systemPromptTokens = ctx.systemPrompt ? estimateTokens(ctx.systemPrompt) : 0;
    const toolsTokens = ctx.tools ? estimateTokens(JSON.stringify(ctx.tools)) : 0;
    const conversationTokens = estimateMessagesTokens(ctx.messages);

    return createContextUsageSnapshot({
      systemPromptTokens,
      toolsTokens,
      conversationTokens,
      maxTokens: this.config.contextWindow,
    });
  }

  /** 获取会话消息数量 */
  getMessageCount(): number {
    return this.conversation.getMessageCount();
  }

  /** 获取压缩配置 */
  getConfig(): CompressionConfig {
    return { ...this.config };
  }

  /** 从各模块收集 systemParts，渲染为 XML 并拼接 */
  private buildSystemPrompt(): string | undefined {
    const allParts: SystemPart[] = [];

    const modules = [
      this.systemPromptModule.format(),
      this.longTermModule?.format(),
    ];

    for (const parts of modules) {
      if (parts?.systemParts) {
        allParts.push(...parts.systemParts);
      }
    }

    const filtered = allParts.filter((p) => p.content.trim());
    return filtered.length > 0
      ? filtered.map((p) => p.render()).join("\n\n")
      : undefined;
  }
}
