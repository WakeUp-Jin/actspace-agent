import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode } from '@actspace/shared/runtime-v2';
import type { TrajectoryPromptDetail, TrajectoryRecord } from './contract';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value) ?? '';
export type ContextSection = { id: string; owner: string; order: number; content: RuntimeV2JsonValue; provenance?: RuntimeV2JsonValue };
export function readContextSections(value: unknown): ContextSection[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(item => typeof object(item).id === 'string' && typeof object(item).owner === 'string' && typeof object(item).order === 'number' && object(item).content !== undefined)) return null;
  return value as ContextSection[];
}
const fixed = (section: ContextSection) => section.owner === 'actspace.context-system' || section.owner === 'system';
export function fixedSystemText(prompt: TrajectoryPromptDetail): string {
  const sections = readContextSections(prompt.contextSections);
  return sections === null ? prompt.systemPrompt ?? text(prompt.systemPromptParts ?? '') : sections.filter(fixed).map(section => text(section.content).trim()).filter(Boolean).join('\n\n');
}
export function contextCategory(owner: string, id = ''): string {
  if (owner === 'actspace.context-rules') return '规则';
  if (owner === 'actspace.context-skills') return id === 'core/skills-catalog' ? '技能目录' : '已加载技能';
  if (owner === 'actspace.context-disclosure' || owner === 'actspace.context.disclosure') return '路径导航';
  if (owner === 'task-notification') return '通知';
  if (owner === 'actspace.context-background-tasks') return '后台任务';
  if (owner === 'runtime' || owner === 'actspace.context-runtime') return '运行信息';
  return '动态补充';
}
const titleOf = (section: ContextSection) => ({ 'host/user-instructions': '用户规则', 'host/workspace-instructions': '工作区规则（AGENTS.md）', 'core/skills-catalog': '可用技能目录', 'core/selected-skills': '本次加载的技能', 'background-tasks': '后台任务清单' }[section.id] ?? section.id);

/** Request composition is a display projection, not a fabricated user/injection event. */
export function contextSectionRecords(nodes: readonly RuntimeV2TrajectoryNode[], base: (node: RuntimeV2TrajectoryNode, overrides: Partial<TrajectoryRecord>) => TrajectoryRecord): TrajectoryRecord[] {
  const output: TrajectoryRecord[] = [];
  let previous = new Map<string, ContextSection>();
  for (const node of [...nodes].sort((a, b) => a.eventSeq - b.eventSeq)) {
    if (node.eventType !== 'request/context') continue;
    const snapshot = object(object(node.data).snapshot);
    const sections = readContextSections(snapshot.contextSections);
    if (sections === null) continue;
    const facts = readContextSections(snapshot.contextModelFacts) ?? [];
    const current = new Map([...sections.filter(section => !fixed(section)), ...facts].filter(section => !(Array.isArray(section.content) && section.content.length === 0) && section.content !== "").map(section => [JSON.stringify([section.owner, section.id]), section]));
    for (const key of new Set([...previous.keys(), ...current.keys()])) {
      const before = previous.get(key); const after = current.get(key);
      if (before && after && JSON.stringify(before) === JSON.stringify(after)) continue;
      const section = after ?? before!;
      const action = !after ? '已移除' : before ? '已更新' : '已加载';
      const category = contextCategory(section.owner, section.id);
      const provenance = object(section.provenance);
      const title = typeof provenance.path === 'string' ? provenance.path : titleOf(section);
      output.push(base(node, {
        id: `${node.sessionId}:context-section:${node.eventSeq}:${key}`, kind: 'context', visible: true,
        summary: `${category} · ${title} · ${action}`, preview: `${category} · ${title} · ${action}`,
        inputDetail: after ? text(after.content) : '', durationMs: 0, startedAt: node.time, completedAt: node.time,
        contextPresentation: { category, title, action, placement: 'system', ...(before ? { previousText: text(before.content) } : {}) },
        messageSource: { ...(section.provenance ? { provenance: section.provenance } : {}), kind: section.owner, id: section.id, form: category === '规则' ? 'instructions' : category === '技能目录' ? 'catalog' : 'snapshot', placement: 'system', requestId: object(node.data).requestId as string ?? null, eventSeq: node.eventSeq, projection: 'request-composition' },
        sourceBlocks: after ? [{ type: 'text', content: text(after.content) }] : [],
      }));
    }
    previous = current;
  }
  return output;
}
