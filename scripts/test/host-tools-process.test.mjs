import { realpathSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(realpathSync(resolve(process.env.ACTSPACE_HOST_TEST_PACKAGE ?? 'packages/agent-host/package.json')));
const { WebSocket } = require('ws');
const { HostClient } = await import(process.env.ACTSPACE_HOST_TEST_CLIENT ?? '../../packages/client/dist/host/client.js');
const exec = promisify(execFile), cli = resolve(process.env.ACTSPACE_HOST_TEST_CLI ?? 'apps/cli/dist/cli.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, accept, label) {
  for (let attempt = 0; attempt < 150; attempt++) { const result = await read(); if (accept(result)) return result; await pause(30); }
  throw new Error(`Timed out: ${label}`);
}
async function connect(port, code) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`); await once(socket, 'open');
  const client = new HostClient(socket); await client.authenticate({ code, name: 'lifecycle fixture' }); return client;
}
test('real Host shares approval decisions across devices and exposes immutable tool results', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'host-lifecycle-'));
  let requests = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume request */ }
    requests++;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const delta = requests === 1 ? { role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-bash', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'pwd', intent: 'Write isolated fixture result', requiredPermissions: ['no_sandbox'] }) } }] } : requests === 2 ? { role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-write', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'result.txt', content: 'host-tool-result' }) } }] } : { role: 'assistant', content: 'Created result.txt' };
    for (const chunk of [{ choices: [{ index: 0, delta, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: requests <= 2 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }]) response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', ...chunk })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const net = await import('node:net'), reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening'); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const config = join(root, 'host.json'), env = { ...process.env, HOST_FIXTURE_KEY: 'isolated-fixture' };
  await writeFile(config, JSON.stringify({ schemaVersion: 1, dataRoot: join(root, 'data'), listen: { address: '127.0.0.1', port }, allowedOrigins: [], workspaces: [{ id: 'main', name: 'Fixture', path: root }], providers: [{ id: 'fixture', type: 'openai-completions', baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, keyEnv: 'HOST_FIXTURE_KEY', models: ['fixture'] }], defaultModel: 'fixture/fixture' }));
  const children = [], clients = [];
  const management = async (command, ...args) => JSON.parse((await exec(process.execPath, [cli, 'host', command, '--config', config, ...args], { env })).stdout);
  const start = async () => {
    const processHandle = spawn(process.execPath, [cli, 'host', 'serve', '--config', config], { env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(processHandle);
    let output = '', errors = ''; processHandle.stderr.on('data', bytes => { errors += bytes; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`start timeout: ${errors}`)), 10000);
      processHandle.stdout.on('data', bytes => { output += bytes; if (output.includes('hostId')) { clearTimeout(timer); resolve(); } });
      processHandle.once('exit', code => { clearTimeout(timer); reject(new Error(`Host exited ${code}: ${errors}`)); });
    }); return processHandle;
  };
  try {
    await start();
    const first = await connect(port, (await management('pair')).code), second = await connect(port, (await management('pair')).code); clients.push(first, second);
    const sessionId = (await first.call('sessions.create', { workspaceId: 'main' })).sessionId;
    const events = []; second.subscribe(event => events.push(event));
    await second.call('sessions.observe', { sessionId });
    await first.call('tasks.submit', { sessionId, submissionId: 'tools', content: 'Run the fixture command' });
    const pending = await until(() => second.call('approvals.list', { sessionId }), value => value.length === 1, 'approval requested').catch(async error => { console.error(JSON.stringify({ requests, state: await second.call('tasks.command', { sessionId, op: 'snapshot' }), events: (await second.call('sessions.page', { sessionId })).window.events.filter(event => event.type.startsWith('tool/')).map(event => ({ type: event.type, data: event.data })) })); throw error; });
    assert.equal(pending[0].toolName, 'bash');
    await first.call('approvals.decide', { sessionId, requestId: pending[0].requestId, kind: 'once' });
    await assert.rejects(second.call('approvals.decide', { sessionId, requestId: pending[0].requestId, kind: 'deny' }), /settled|unavailable/);
    await until(() => second.call('tasks.command', { sessionId, op: 'snapshot' }), value => value.snapshot.runs[0]?.state === 'completed', 'tool run completed');
    assert.ok(events.some(event => event.value?.settled?.decision?.kind === 'once'));
    assert.deepEqual(await second.call('approvals.list', { sessionId }), []);
    const ref = await second.call('files.reference', { sessionId, path: 'result.txt' });
    const file = await second.call('artifacts.read', { sessionId, artifactId: ref.id, offset: 0, length: 100 });
    assert.equal(Buffer.from(file.data, 'base64').toString(), 'host-tool-result');
    await writeFile(join(root, 'result.txt'), 'replaced');
    assert.equal(Buffer.from((await second.call('artifacts.read', { sessionId, artifactId: ref.id, offset: 0, length: 100 })).data, 'base64').toString(), 'host-tool-result');
    assert.equal(requests, 3);
  } finally {
    clients.forEach(client => client.close());
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await rm(root, { recursive: true, force: true });
  }
});
