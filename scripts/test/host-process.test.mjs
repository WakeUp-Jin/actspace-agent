import { realpathSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require = createRequire(realpathSync(resolve(process.env.ACTSPACE_HOST_TEST_PACKAGE ?? 'packages/agent-host/package.json')));
const { WebSocket } = require('ws');
const exec = promisify(execFile);
const cli = resolve(process.env.ACTSPACE_HOST_TEST_CLI ?? 'apps/cli/dist/cli.js');
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/rpc`); let next = 1;
  const pending = new Map();
  ws.on('message', bytes => { const value = JSON.parse(String(bytes)); const entry = pending.get(value.id); if (!entry) return; pending.delete(value.id); value.error ? entry.reject(new Error(JSON.stringify(value.error))) : entry.resolve(value.result); });
  return { ws, async call(method, params = {}) { if (ws.readyState === 0) await once(ws, 'open'); const id = next++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); }); } };
}
test('independent Host completes after client disconnect; new device reads durable result', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'actspace-host-process-'));
  const config = join(root, 'host.json'); const env = { ...process.env, HOST_FIXTURE_KEY: 'fixture-only' };
  // Ephemeral listener selected by the test parent; production config requires a fixed port.
  const net = await import('node:net'); const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening'); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  await writeFile(config, JSON.stringify({ schemaVersion: 1, dataRoot: join(root, 'data'), listen: { address: '127.0.0.1', port }, allowedOrigins: [], workspaces: [{ id: 'main', name: 'Fixture', path: root }], providers: [{ id: 'fixture', type: 'openai-completions', baseUrl: 'http://127.0.0.1:1', keyEnv: 'HOST_FIXTURE_KEY', models: ['test'] }], defaultModel: 'fixture/test' }));
  const host = spawn(process.execPath, [cli, 'host', 'serve', '--config', config, '--mock'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = ''; host.stderr.on('data', bytes => { error += bytes; });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Host start timed out ${error}`)), 10000); host.stdout.on('data', bytes => { output += bytes; if (output.includes('hostId')) { clearTimeout(timer); resolve(); } }); host.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${error}`)); }); });
    const management = async command => JSON.parse((await exec(process.execPath, [cli, 'host', command, '--config', config], { env })).stdout);
    const first = client(port); const code = await management('pair'); await first.call('host.hello', { protocol: 'actspace-host/1' }); await first.call('auth.pair', { code: code.code, name: 'First' });
    const session = await first.call('sessions.create', { workspaceId: 'main' });
    const receipt = await first.call('tasks.submit', { sessionId: session.sessionId, submissionId: 'one', content: 'hello' });
    assert.notEqual(receipt.durableSeq, null); first.ws.close(); await once(first.ws, 'close');
    const second = client(port); const nextCode = await management('pair'); await second.call('host.hello', { protocol: 'actspace-host/1' }); await second.call('auth.pair', { code: nextCode.code, name: 'Second' });
    let snapshot;
    for (let i = 0; i < 100; i++) { snapshot = (await second.call('tasks.command', { sessionId: session.sessionId, op: 'snapshot' })).snapshot; if (snapshot.runs[0]?.state === 'completed') break; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.equal(snapshot.runs[0]?.state, 'completed'); assert.equal(snapshot.runs[0].result.finalText, 'Mock ActSpace Agent response.');
    const observed = await second.call('sessions.observe', { sessionId: session.sessionId });
    assert.equal(observed.snapshot.output, null, 'completed output must be released after journal persistence');
    assert.ok(JSON.stringify(observed.snapshot.observation).includes('Mock ActSpace Agent response.'), 'completed reply remains available from durable history');
    const duplicate = await second.call('tasks.submit', { sessionId: session.sessionId, submissionId: 'one', content: 'hello' }); assert.equal(duplicate.task.taskId, receipt.task.taskId);
    second.ws.close(); await once(second.ws, 'close');
    const exited = once(host, 'exit'); await management('stop'); const [exitCode] = await exited; assert.equal(exitCode, 0, error);
  } finally { if (host.exitCode === null) { const exited = once(host, 'exit'); host.kill('SIGKILL'); await exited; } await rm(root, { recursive: true, force: true }); }
});
