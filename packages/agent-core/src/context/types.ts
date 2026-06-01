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

// ─── 缓存稳定性档位 ───

/**
 * 缓存稳定性档位：数字越大越不易变，越应排在请求前缀以提高 DeepSeek prefix-cache 命中率。
 *
 * 设计动机见 docs/design-docs/agent-token-usage-and-context-state.md「DeepSeek Cache 设计影响」，
 * 借鉴 reasonix 的「不变前缀 / 只追加历史 / 临时不入前缀」三区域。
 */
export const CACHE_STABILITY = {
  /** 整会话不变：核心系统提示词、工具协议说明。 */
  IMMUTABLE: 100,
  /** 基本稳定：规则、长期记忆摘要。 */
  STABLE: 70,
  /** 半易变：会话级注入但本轮内不变。 */
  SEMI: 40,
  /** 每轮常变：动态注入内容（暂未引入实例，仅保留语义）。 */
  VOLATILE: 10,
} as const;

export type CacheStability = (typeof CACHE_STABILITY)[keyof typeof CACHE_STABILITY];

// ─── SystemPart ───

export class SystemPart {
  constructor(
    /** XML 标签名（如 system_prompt、user_instructions、memory_summary） */
    public tag: string,
    /** 标签的描述属性 */
    public description: string,
    /** 实际内容文本 */
    public content: string,
    /** 缓存稳定性（越大越靠前），由 ContextManager 组装系统提示词时排序读取 */
    public stability: number = CACHE_STABILITY.STABLE,
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
  /** 缓存稳定性档位（CACHE_STABILITY），同稳定性内再按 priority 排序。核心段为 IMMUTABLE */
  stability: number;
  enabled: boolean;
}

// ─── CompressionConfig ───

/**
 * 压缩相关的全部可调阈值的单一事实来源。
 *
 * 历史侧字段（contextWindow / compressionThreshold / compressKeepRatio /
 * compactMinIntervalCalls）由 ContextManager 消费；工具侧字段
 * （toolTruncateThreshold / readTruncateThreshold / bashInlineThreshold /
 * bashDiskCap / absoluteMaxChars）由 ToolManager / OutputTruncator / bash executor
 * 消费。集中在一处便于统一调参，见
 * docs/design-docs/agent-context-compression.md「配置与阈值」。
 */
export interface CompressionConfig {
  /** 模型上下文窗口大小（Token） */
  contextWindow: number;
  /** 触发历史压缩的阈值，占上下文窗口的比例（如 0.85 = 85%） */
  compressionThreshold: number;
  /** 历史压缩时保留最近消息的比例 */
  compressKeepRatio: number;
  /** 两次历史压缩之间的最小模型调用间隔，防抖动反复触发 */
  compactMinIntervalCalls: number;
  /** 通用工具（web/generic）输出超过此字符数即 flash 摘要 */
  toolTruncateThreshold: number;
  /** 读取类工具（read/grep/glob/directory_list）输出超过此字符数才摘要 */
  readTruncateThreshold: number;
  /** bash 输出超过此字符数才落盘并回填头部，低于则原样 inline、不落盘 */
  bashInlineThreshold: number;
  /** bash 流式写盘硬上限（字节），防跑飞命令撑爆磁盘 */
  bashDiskCap: number;
  /** 非 bash 工具送入 flash 摘要前的头尾截断上限（字符数） */
  absoluteMaxChars: number;
}

/** 压缩配置默认值（单一事实来源，context 与 tools 两侧共用）。 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  contextWindow: 200_000,
  compressionThreshold: 0.85,
  compressKeepRatio: 0.3,
  compactMinIntervalCalls: 2,
  toolTruncateThreshold: 2000,
  readTruncateThreshold: 20_000,
  bashInlineThreshold: 4000,
  bashDiskCap: 5 * 1024 * 1024,
  absoluteMaxChars: 100_000,
};
