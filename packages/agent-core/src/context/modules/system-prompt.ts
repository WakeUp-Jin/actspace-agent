/**
 * SystemPromptContext — 分段式系统提示词模块
 *
 * 系统提示词由多个有序片段（PromptSegment）组合而成。
 * 每个 segment 独立管理：id、content、priority、enabled。
 * 组装时按优先级降序排列，只拼接 enabled 的 segment。
 *
 * 核心指令 segment（id="core"，priority=100）始终存在、始终启用、不可移除。
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/context/type-system-prompt.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/system-prompt.ts
 */

import type { ContextModule, ContextParts, PromptSegment } from "../types";
import { SystemPart } from "../types";

const CORE_SEGMENT_ID = "core";
const CORE_PRIORITY = 100;

export class SystemPromptContext implements ContextModule {
  private segments = new Map<string, PromptSegment>();

  constructor(corePrompt: string) {
    this.segments.set(CORE_SEGMENT_ID, {
      id: CORE_SEGMENT_ID,
      content: corePrompt,
      priority: CORE_PRIORITY,
      enabled: true,
    });
  }

  registerSegment(segment: Omit<PromptSegment, "enabled"> & { enabled?: boolean }): void {
    if (segment.id === CORE_SEGMENT_ID) return;
    this.segments.set(segment.id, { enabled: true, ...segment });
  }

  updateSegment(id: string, content: string): void {
    const seg = this.segments.get(id);
    if (seg) seg.content = content;
  }

  removeSegment(id: string): void {
    if (id === CORE_SEGMENT_ID) return;
    this.segments.delete(id);
  }

  enableSegment(id: string): void {
    const seg = this.segments.get(id);
    if (seg) seg.enabled = true;
  }

  disableSegment(id: string): void {
    const seg = this.segments.get(id);
    if (seg && id !== CORE_SEGMENT_ID) seg.enabled = false;
  }

  getSegment(id: string): PromptSegment | undefined {
    return this.segments.get(id);
  }

  getAllSegments(): PromptSegment[] {
    return Array.from(this.segments.values());
  }

  /** 按优先级降序组装所有启用的 segment */
  getPrompt(): string {
    return Array.from(this.segments.values())
      .filter((s) => s.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map((s) => s.content)
      .join("\n\n");
  }

  format(): ContextParts {
    return {
      systemParts: [
        new SystemPart("system_prompt", "核心指令与行为规范", this.getPrompt()),
      ],
      messages: [],
    };
  }
}
