import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeV2JsonValue, RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import { buildTrajectorySnapshot } from '../trajectory';
import { TrajectoryView } from '../components/TrajectoryView';
import { loadTrajectoryFixture } from '../trajectory/fixtures';

const events: [string, RuntimeV2JsonValue][] = [
  ['turn/start', { turnId: 't' }],
  ['user/message', { content: '**Inspect** files', source: { kind: 'user' } }],
  ['step/start', { stepId: 's' }],
  ['request/header', { requestId: 'r', prompt: { tools: [{ name: 'bash', description: 'Execute a shell command.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'The command to execute.' } }, required: ['command'] } }] } }],
  ['assistant/message', { requestId: 'r', messageId: 'a', content: [
    { type: 'thinking', text: 'Check first.' }, { type: 'text', text: 'Inspect **both** files.' },
    { type: 'tool-call', callId: 'c1', name: 'bash', arguments: { command: 'first' } },
    { type: 'text', text: 'Then continue.' },
    { type: 'tool-call', callId: 'c2', name: 'bash', arguments: { command: 'second' } },
    { type: 'tool-call', callId: 'missing', name: 'bash', arguments: { command: 'unavailable' } },
  ] }],
  // Another message in the same step must not steal the calls by proximity.
  ['assistant/message', { requestId: 'r', messageId: 'b', content: 'An unrelated update.' }],
  ['tool/call', { requestId: 'r', callId: 'c1', name: 'bash', arguments: { command: 'first' } }],
  ['tool/result', { callId: 'c1', result: 'first output', status: 'failed' }],
  ['tool/call', { requestId: 'r', callId: 'c2', name: 'bash', arguments: { command: 'second' } }],
  ['tool/call', { callId: 'child', parentCallId: 'c2', name: 'bash', arguments: { command: 'nested' } }],
  ['tool/call', { callId: 'orphan', name: 'bash', arguments: {} }],
  ['request/header', { requestId: 'later', prompt: { tools: [{ name: 'bash', description: 'New definition.', parameters: {} }] } }],
];
const snapshot: RuntimeV2TrajectorySnapshot = {
  kind: 'trajectory', schemaVersion: 1, sessionId: 'relations', throughJournalSeq: events.length - 1,
  nodes: events.map(([eventType, value], eventSeq) => {
    const data = value as Record<string, RuntimeV2JsonValue>;
    return { key: `relations:${eventSeq}`, sessionId: 'relations', eventSeq, eventType, time: new Date(1_700_000_000_000 + eventSeq * 1000).toISOString(), kind: 'other', state: 'observed', callId: typeof data.callId === 'string' ? data.callId : null, data: { turnId: 't', stepId: 's', ...data } };
  }),
};

describe('trajectory content and call relations', () => {
  it('preserves block order and resolves owners and historical schemas by identity', () => {
    const runtime = buildTrajectorySnapshot(snapshot);
    const assistant = runtime.records.find(record => record.messageId === 'a')!;
    const tool = runtime.records.find(record => record.callId === 'c1')!;
    expect(tool).toMatchObject({ assistantRecordId: assistant.id, result: 'first output', schemaDetail: { description: 'Execute a shell command.' } });
    expect(runtime.records.find(record => record.callId === 'child')).toMatchObject({ assistantRecordId: assistant.id, parentCallId: 'c2', schemaDetail: { description: 'Execute a shell command.' } });
    expect(runtime.records.find(record => record.callId === 'orphan')?.assistantRecordId).toBeNull();
    expect(runtime.records.find(record => record.callId === 'orphan')?.schemaDetail).toBeNull();
    expect(assistant.sourceBlocks?.map(block => block.type)).toEqual(['thinking', 'text', 'tool-call', 'text', 'tool-call', 'tool-call']);
    expect(assistant.sourceBlocks?.[2]?.content).toBe('{"command":"first"}');
    expect(assistant.summary).toBe('Inspect **both** files.\n\nThen continue.');
  });

  it('navigates from Preview and Raw to the exact tool and back through collapsed/search state', async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={snapshot} />);
    await user.click(screen.getByRole('button', { name: /ASSISTANT assistant\/message, Inspect/ }));
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const details = screen.getByRole('tabpanel');
    expect(within(details).getByRole('button', { name: 'Open tool call missing' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Collapse turns' }));
    await user.type(screen.getByRole('searchbox'), 'unrelated');
    await user.click(within(details).getByRole('button', { name: 'Open tool call c1' }));
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('first output');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: /TOOL tool\/call, bash.*first/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Assistant Message' }));
    await user.click(screen.getByRole('tab', { name: 'Raw' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Block #1');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Inspect **both** files.');
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent('requestId');
    const track = screen.getByTestId('trajectory-overview-track');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
    // jsdom has no PointerEvent constructor; MouseEvent retains pointer coordinates.
    fireEvent(track, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 }));
    fireEvent(track, new MouseEvent('pointermove', { bubbles: true, clientX: 5 }));
    fireEvent(track, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 5 }));
    expect(screen.getByTestId('trajectory-selection')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open tool call c2' }));
    expect(screen.queryByTestId('trajectory-selection')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('second');
    await user.click(screen.getByRole('tab', { name: 'Schema' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Execute a shell command.');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('The command to execute.');
    expect(screen.queryByRole('button', { name: /Inspect Request/ })).not.toBeInTheDocument();
  });

  it('keeps User Raw separate from provenance and navigates nested tool ancestry', async () => {
    const user = userEvent.setup();
    render(<TrajectoryView snapshot={snapshot} />);
    await user.click(within(screen.getByRole('table', { name: 'Trajectory events' })).getByRole('button', { name: /USER user\/message, / }));
    await user.click(screen.getByRole('tab', { name: 'Raw' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('**Inspect** files');
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent('turnId');
    await user.click(screen.getByRole('tab', { name: 'Source' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('"kind": "user"');
    await user.click(screen.getByRole('button', { name: /TOOL tool\/call, bash.*nested/ }));
    await user.click(screen.getByRole('button', { name: 'Parent Tool' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('second');
    await user.click(screen.getByRole('button', { name: 'Assistant Message' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Then continue.');
  });

  it('reveals a related call outside the loaded history window', async () => {
    const user = userEvent.setup();
    const long = loadTrajectoryFixture('long');
    const changed = { ...long, nodes: long.nodes.map(node => {
      const data = node.data as Record<string, RuntimeV2JsonValue>;
      return data.messageId === 'batch-24:assistant-5-1' ? { ...node, data: { ...data, content: [{ type: 'tool-call', callId: 'batch-1:call-1-1-1', name: 'read_file', arguments: {} }] } } : node;
    }) };
    render(<TrajectoryView snapshot={changed} />);
    const runtime = buildTrajectorySnapshot(changed);
    const target = runtime.records.find(record => record.callId === 'batch-1:call-1-1-1')!;
    expect(document.querySelector(`[data-record-id="${target.id}"]`)).toBeNull();
    const assistant = runtime.records.find(record => record.messageId === 'batch-24:assistant-5-1')!;
    const row = document.querySelector(`[data-record-id="${assistant.id}"]`)! as HTMLElement;
    await user.click(within(row).getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'Open tool call batch-1:call-1-1-1' }));
    expect(document.querySelector(`[data-record-id="${target.id}"]`)).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('80 lines read');
  });
});
