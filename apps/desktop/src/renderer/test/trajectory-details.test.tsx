import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeV2JsonValue, RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import { DetailPanel, type DetailSelection } from '../components/trajectory/details/DetailPanel';
import { buildTrajectorySnapshot, deriveLayout, detailTabs, type DetailTab, type TrajectoryCell } from '../trajectory';

const tool = (description: string) => ({ name: 'bash', description, parameters: { type: 'object', properties: { command: { type: 'string', description: 'The command to execute.' } } } });
const events: [string, Record<string, RuntimeV2JsonValue>][] = [
  ['turn/start', { turnId: 't' }],
  ['user/message', { content: '**Inspect** files', source: { kind: 'user' } }],
  ['step/start', { stepId: 's' }],
  ['request/header', { requestId: 'r', routeId: 'deepseek', model: 'v4', prompt: { systemPrompt: '你是助手\n保持简短\n用中文', tools: [tool('Execute a shell command.')] } }],
  ['assistant/message', { requestId: 'r', messageId: 'a', content: [
    { type: 'thinking', text: 'Check first.' }, { type: 'text', text: 'Inspect **both** files.' },
    { type: 'tool-call', callId: 'c1', name: 'bash', arguments: { command: 'first' } },
  ] }],
  ['tool/call', { requestId: 'r', callId: 'c1', name: 'bash', arguments: { command: 'first' } }],
  ['tool/call', { callId: 'child', parentCallId: 'c1', name: 'bash', arguments: { command: 'nested' } }],
  ['tool/result', { callId: 'child', result: '{"ok":true}' }],
  ['tool/result', { callId: 'c1', result: 'first output' }],
  ['step/end', {}],
  ['step/start', { stepId: 's2' }],
  ['request/header', { requestId: 'r2a', prompt: { systemPrompt: '你是助手\n保持详细\n用中文', tools: [tool('Execute a shell command.')] } }],
  ['llm/retry', { requestId: 'r2a', attempt: 1, delayMs: 200, failure: { message: '超时' } }],
  ['request/header', { requestId: 'r2b', attempt: 2, routeId: 'deepseek', model: 'v4', prompt: { systemPrompt: '你是助手\n保持详细\n用中文', tools: [tool('Execute a shell command.')] } }],
  ['assistant/message', { requestId: 'r2b', messageId: 'm2', content: '完成' }],
];
let step = 's';
const snapshot: RuntimeV2TrajectorySnapshot = {
  kind: 'trajectory', schemaVersion: 1, sessionId: 'details', throughJournalSeq: events.length - 1,
  nodes: events.map(([eventType, data], eventSeq) => {
    if (eventType === 'step/start') step = String(data.stepId);
    return {
      key: `details:${eventSeq}`, sessionId: 'details', eventSeq, eventType, time: new Date(1_700_000_000_000 + eventSeq * 1000).toISOString(), kind: 'other', state: 'observed',
      callId: typeof data.callId === 'string' ? data.callId : null, data: { turnId: 't', stepId: step, ...data },
    };
  }) as unknown as RuntimeV2TrajectorySnapshot['nodes'],
};
const layout = deriveLayout(buildTrajectorySnapshot(snapshot));
const cellOf = (pick: (cell: TrajectoryCell) => boolean) => layout.cells.find(pick)!;

function setup(selection: DetailSelection, tab: DetailTab) {
  const handlers = { onTab: vi.fn(), onSelectRecord: vi.fn(), onSelectRequest: vi.fn(), onClose: vi.fn() };
  render(<DetailPanel layout={layout} selection={selection} tab={tab} {...handlers} />);
  return handlers;
}
const record = (cell: TrajectoryCell): DetailSelection => ({ kind: 'record', cell });

describe('DetailPanel', () => {
  it('labels the tabs in Chinese for each kind', () => {
    setup(record(cellOf(cell => cell.kind === 'tool')), 'overview');
    const names = within(screen.getByRole('tablist', { name: '事件详情' })).getAllByRole('tab').map(item => item.textContent);
    expect(names).toEqual(['概述', '参数', '结果', 'Schema', '计时']);
    expect(screen.getByRole('tab', { name: '概述' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps from the assistant preview to the tool row, and the sub-tool hierarchy to its parent tool', async () => {
    const user = userEvent.setup();
    const assistant = cellOf(cell => cell.kind === 'message' && cell.record.messageId === 'a');
    const toolCell = cellOf(cell => cell.kind === 'tool');
    const first = setup(record(assistant), 'preview');
    await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: /bash/ }));
    expect(first.onSelectRecord).toHaveBeenCalledWith(toolCell.recordId);
  });

  it('links a sub-tool back to its parent tool and assistant, and a message to its request', async () => {
    const user = userEvent.setup();
    const sub = cellOf(cell => cell.kind === 'subtool');
    const handlers = setup(record(sub), 'overview');
    await user.click(screen.getByRole('button', { name: '工具调用' }));
    expect(handlers.onSelectRecord).toHaveBeenCalledWith(cellOf(cell => cell.kind === 'tool').recordId);
    await user.click(screen.getByRole('button', { name: '助手消息' }));
    expect(handlers.onSelectRecord).toHaveBeenLastCalledWith(cellOf(cell => cell.kind === 'message').recordId);
  });

  it('offers the delegated child trajectory from a delegated call overview only', async () => {
    const user = userEvent.setup();
    const onOpenSubagent = vi.fn();
    const subagentFor = (callId: string) => callId === 'c1' ? { parentCallId: 'c1', childSessionId: 'child-1', presetId: 'explore' } : null;
    const handlers = { onTab: vi.fn(), onSelectRecord: vi.fn(), onSelectRequest: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<DetailPanel layout={layout} selection={record(cellOf(cell => cell.kind === 'tool'))} tab="overview" subagentFor={subagentFor} onOpenSubagent={onOpenSubagent} {...handlers} />);
    expect(screen.getByText('子智能体')).toBeInTheDocument();
    expect(screen.getByText('explore')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '在右侧查看子智能体轨迹' }));
    expect(onOpenSubagent).toHaveBeenCalledWith('child-1');
    rerender(<DetailPanel layout={layout} selection={record(cellOf(cell => cell.kind === 'subtool'))} tab="overview" subagentFor={subagentFor} onOpenSubagent={onOpenSubagent} {...handlers} />);
    expect(screen.queryByText('子智能体')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '在右侧查看子智能体轨迹' })).not.toBeInTheDocument();
  });

  it('opens thinking expanded and keeps the toggle on the record it was made on', async () => {
    const user = userEvent.setup();
    const thinking = cellOf(cell => cell.kind === 'message' && cell.record.messageId === 'a');
    const plain = cellOf(cell => cell.kind === 'message' && cell.record.messageId === 'm2');
    const handlers = { onTab: vi.fn(), onSelectRecord: vi.fn(), onSelectRequest: vi.fn(), onClose: vi.fn() };
    const view = render(<DetailPanel layout={layout} selection={record(thinking)} tab="preview" {...handlers} />);
    const toggle = () => screen.getByRole('button', { name: '思考' });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Check first.');
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent('Check first.');
    view.rerender(<DetailPanel layout={layout} selection={record(plain)} tab="preview" {...handlers} />);
    view.rerender(<DetailPanel layout={layout} selection={record(thinking)} tab="preview" {...handlers} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the message source as a JsonTree on the source tab', () => {
    setup(record(cellOf(cell => cell.kind === 'user')), 'source');
    expect(within(screen.getByRole('tabpanel')).getByRole('tree', { name: '消息来源 JSON' })).toBeInTheDocument();
  });

  it('shows added and removed lines on the diff tab when a previous prompt exists', () => {
    const system = layout.cells.filter(cell => cell.kind === 'system').find(cell => cell.record.previousPromptDetail)!;
    expect(system).toBeDefined();
    expect(detailTabs(system).map(item => item.label)).toEqual(['差异', '系统提示词', '工具']);
    setup(record(system), 'diff');
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('.tj-promptDiffLineremoved')).toHaveTextContent('-保持简短');
    expect(panel.querySelector('.tj-promptDiffLineadded')).toHaveTextContent('+保持详细');
  });

  it('expands a tool catalog entry to its full description and parameters', async () => {
    const user = userEvent.setup();
    setup(record(cellOf(cell => cell.kind === 'system')), 'tools');
    const item = screen.getByText('bash', { selector: '.tj-toolCatalogName' }).closest('details')!;
    expect(item.open).toBe(false);
    await user.click(within(item).getByText('bash', { selector: '.tj-toolCatalogName' }));
    expect(item.open).toBe(true);
    expect(item.querySelector('.tj-toolCatalogFullDescription')).toHaveTextContent('Execute a shell command.');
    expect(within(item).getByRole('tree')).toBeInTheDocument();
  });

  it('describes a request with provider, model and retries', () => {
    const requests = [...layout.requests.values()];
    setup({ kind: 'request', request: requests[1]! }, 'overview');
    const panel = screen.getByRole('tabpanel');
    for (const text of ['已完成', '提供方', '模型', '重试', '重试延迟', '上次尝试错误', '超时']) expect(panel).toHaveTextContent(text);
    expect(screen.getByText('请求 #2')).toBeInTheDocument();
    // This request recorded no options, so the 选项 tab is left out.
    expect(screen.getAllByRole('tab').map(item => item.textContent)).toEqual(['概述', '用量', '计时']);
  });

  it('shows provider and model for the first request', () => {
    setup({ kind: 'request', request: [...layout.requests.values()][0]! }, 'overview');
    expect(screen.getByText('deepseek')).toBeInTheDocument();
    expect(screen.getByText('v4')).toBeInTheDocument();
  });
});

it('shows the recorded context start time in overview and supports timestamp switching', async () => {
  const original = cellOf(cell => cell.kind === 'user');
  const cell: TrajectoryCell = { ...original, kind: 'context', startedAt: 1700000000000,
    record: { ...original.record, kind: 'context', startedAt: '2023-11-14T22:13:20.000Z' } };
  setup(record(cell), 'overview');
  expect(screen.getByText('开始时间')).toBeInTheDocument();
  const toggle = screen.getByTitle('显示 Unix 时间戳');
  await userEvent.setup().click(toggle);
  expect(toggle.textContent).toContain('1700000000');
});
