/**
 * 上下文管理器
 * 协调各子模块构建完整的 Context（LLM 调用的完整输入）。
 *
 * ContextManager 直接持有 Context 对象，appendMessage 操作 context.messages，
 * getContext() 刷新 systemPrompt 后返回持有的 context 引用。
 */

import {
  Message, Context,
  MessagePriority,
  getMessageText,
} from './llm-service';

// ─── SystemPart：系统级内容片段（XML 标签包裹） ───

class SystemPart {
  constructor(
    /** XML 标签名，如 system_prompt、user_instructions、memory_summary */
    public tag: string,
    /** 标签的描述属性 */
    public description: string,
    /** 实际内容文本 */
    public content: string,
  ) {}

  /** 渲染为 <tag description="...">内容</tag> 格式 */
  render(): string {
    if (this.description) {
      return `<${this.tag} description="${this.description}">\n${this.content}\n</${this.tag}>`;
    }
    return `<${this.tag}>\n${this.content}\n</${this.tag}>`;
  }
}

// ─── ContextParts：模块 format() 的返回类型 ───

interface ContextParts {
  /** 系统级内容片段，最终合并为 Context.systemPrompt */
  systemParts: SystemPart[];
  /** 对话消息（保留接口兼容，实际模块仅贡献 systemParts） */
  messages: Message[];
}

// ─── ContextModule：子模块接口 ───

interface ContextModule {
  format(): ContextParts;
}

// ─── CompressionConfig ───

interface CompressionConfig {
  /** 模型上下文窗口大小（Token） */
  contextWindow: number;
  /** 触发压缩的阈值，占上下文窗口的比例（如 0.85 = 85%） */
  compressionThreshold: number;
  /** 压缩时保留最近消息的比例 */
  compressKeepRatio: number;
}

// ─── ContextManager：统一编排器 ───

export class ContextManager {
  private systemPromptModule: ContextModule;
  private context: Context = { messages: [] };
  private longTermModule?: ContextModule;
  private config: CompressionConfig;

  constructor(options: {
    /** 系统提示词：传入字符串会自动包装为 ContextModule */
    systemPrompt: string | ContextModule;
    longTermMemory?: ContextModule;
    config?: Partial<CompressionConfig>;
  }) {
    this.systemPromptModule = typeof options.systemPrompt === 'string'
      ? ContextManager.wrapString(options.systemPrompt)
      : options.systemPrompt;
    this.longTermModule = options.longTermMemory;
    this.config = {
      contextWindow: 128000,
      compressionThreshold: 0.85,
      compressKeepRatio: 0.3,
      ...options.config,
    };
  }

  /** 追加消息，自动为工具相关消息设置默认优先级 */
  appendMessage(message: Message): void {
    if (message.role === 'assistant') {
      const hasTools = message.content.some(c => c.type === 'toolCall');
      if (hasTools) {
        message.priority ??= MessagePriority.HIGH;
      }
    }
    if (message.role === 'toolResult') {
      message.priority ??= MessagePriority.HIGH;
    }
    this.context.messages.push(message);
  }

  /**
   * 返回完整的 Context。
   * 从模块收集 systemParts 并刷新 systemPrompt，然后返回持有的 context。
   */
  getContext(): Context {
    this.context.systemPrompt = this.buildSystemPrompt();
    return this.context;
  }

  /** 判断是否需要触发压缩 */
  needsCompression(): boolean {
    const tokens = this.estimateTokens();
    return tokens >= this.config.contextWindow * this.config.compressionThreshold;
  }

  /** 从各模块收集 systemParts，渲染为 XML 并拼接 */
  private buildSystemPrompt(): string | undefined {
    const systemParts: SystemPart[] = [];

    const modules = [
      this.systemPromptModule.format(),
      this.longTermModule?.format(),
    ];

    for (const parts of modules) {
      if (parts?.systemParts) {
        systemParts.push(...parts.systemParts);
      }
    }

    const filtered = systemParts.filter(p => p.content.trim());
    return filtered.length > 0
      ? filtered.map(p => p.render()).join('\n\n')
      : undefined;
  }

  private estimateTokens(): number {
    return this.context.messages.reduce(
      (sum, msg) => sum + Math.ceil(getMessageText(msg).length / 3.5),
      0,
    );
  }

  private static wrapString(text: string): ContextModule {
    return {
      format: () => ({
        systemParts: [new SystemPart('system_prompt', '', text)],
        messages: [],
      }),
    };
  }
}

export { SystemPart, MessagePriority };
export type { ContextParts, ContextModule, CompressionConfig };
