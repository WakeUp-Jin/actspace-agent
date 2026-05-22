/**
 * 分段式系统提示词示例
 * 系统提示词由多个有序片段（PromptSegment）组合而成，
 * 支持动态注册、启用/禁用和按优先级裁剪。
 */

import { SystemPart, type ContextParts, type ContextModule } from './context-manager';

// ─── PromptSegment：系统提示词片段 ───

interface PromptSegment {
  id: string;
  content: string;
  priority: number;   // 越高越靠前，核心指令通常为 100
  enabled: boolean;
}

// ─── SystemPromptContext ───

export class SystemPromptContext implements ContextModule {
  private segments: Map<string, PromptSegment> = new Map();

  constructor(corePrompt: string) {
    this.segments.set('core', {
      id: 'core',
      content: corePrompt,
      priority: 100,
      enabled: true,
    });
  }

  registerSegment(segment: Omit<PromptSegment, 'enabled'> & { enabled?: boolean }): void {
    if (segment.id === 'core') return;
    this.segments.set(segment.id, { enabled: true, ...segment });
  }

  updateSegment(id: string, content: string): void {
    const seg = this.segments.get(id);
    if (seg) seg.content = content;
  }

  removeSegment(id: string): void {
    if (id === 'core') return;
    this.segments.delete(id);
  }

  enableSegment(id: string): void {
    const seg = this.segments.get(id);
    if (seg) seg.enabled = true;
  }

  disableSegment(id: string): void {
    const seg = this.segments.get(id);
    if (seg && id !== 'core') seg.enabled = false;
  }

  /** 按优先级降序组装所有启用的 segment */
  getPrompt(): string {
    return Array.from(this.segments.values())
      .filter(s => s.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map(s => s.content)
      .join('\n\n');
  }

  format(): ContextParts {
    return {
      systemParts: [
        new SystemPart('system_prompt', '核心指令与行为规范', this.getPrompt()),
      ],
      messageItems: [],
    };
  }
}

// ─── 使用示例 ───

function demo() {
  const ctx = new SystemPromptContext(
    '你是一个全栈开发助手。使用中文回复。'
  );

  ctx.registerSegment({
    id: 'tools',
    content: '可用工具：search_code, read_file, write_file, run_tests',
    priority: 60,
  });

  ctx.registerSegment({
    id: 'skill_catalog',
    content: '已加载 Skill：代码审查、重构建议、测试生成',
    priority: 40,
  });

  ctx.registerSegment({
    id: 'formatting',
    content: '输出格式：使用 markdown，代码块标注语言。',
    priority: 80,
  });

  console.log('=== 完整系统提示词 ===');
  console.log(ctx.getPrompt());

  // 窗口紧张时，禁用低优先级 segment
  ctx.disableSegment('skill_catalog');
  console.log('\n=== 裁剪后（禁用 skill_catalog） ===');
  console.log(ctx.getPrompt());

  // 运行时更新工具描述
  ctx.updateSegment('tools', '可用工具：search_code, read_file, write_file');
  console.log('\n=== 更新工具描述后 ===');
  console.log(ctx.getPrompt());

  // format() 输出
  const parts = ctx.format();
  console.log('\n=== SystemPart 渲染 ===');
  console.log(parts.systemParts[0].render());
}

demo();
