/**
 * Context 模块类型定义
 *
 * SystemPart：XML 标签包裹的系统级内容片段
 * ContextParts：模块 format() 返回类型
 * ContextModule：子模块接口
 * PromptSegment：系统提示词片段
 * CompressionConfig：压缩配置
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/context-manager.ts
 */

import type { Message } from "../messages";

// ─── SystemPart ───

export class SystemPart {
  constructor(
    /** XML 标签名（如 system_prompt、user_instructions、memory_summary） */
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

// ─── ContextParts ───

export interface ContextParts {
  /** 系统级内容片段，最终合并为 Context.systemPrompt */
  systemParts: SystemPart[];
  /** 对话消息 */
  messages: Message[];
}

// ─── ContextModule ───

export interface ContextModule {
  format(): ContextParts;
}

// ─── PromptSegment ───

export interface PromptSegment {
  id: string;
  content: string;
  /** 优先级数值，越高越靠前。核心指令通常为 100 */
  priority: number;
  enabled: boolean;
}

// ─── CompressionConfig ───

export interface CompressionConfig {
  /** 模型上下文窗口大小（Token） */
  contextWindow: number;
  /** 触发压缩的阈值，占上下文窗口的比例（如 0.85 = 85%） */
  compressionThreshold: number;
  /** 压缩时保留最近消息的比例 */
  compressKeepRatio: number;
}
