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
test('real Host drains active provider work, pauses queued content across restart, and bounds force stop', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'host-lifecycle-'));
  const waiting = []; let requests = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume request */ }
    requests++; waiting.push(response);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(': waiting\n\n');
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
  const finish = response => {
    for (const chunk of [
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'fixture completed' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    ]) response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', ...chunk })}\n\n`);
    response.end('data: [DONE]\n\n');
  };
  try {
    let host = await start();
    let client = await connect(port, (await management('pair')).code); clients.push(client);
    const sessionId = (await client.call('sessions.create', { workspaceId: 'main' })).sessionId;
    await client.call('tasks.submit', { sessionId, submissionId: 'first', content: 'first' });
    await until(async () => requests, value => value === 1, 'provider entry');
    await client.call('tasks.submit', { sessionId, submissionId: 'second', content: 'second' });
    await management('stop'); await until(() => management('status'), value => value.state === 'draining', 'drain');
    assert.equal(host.exitCode, null, 'normal drain must not terminate active provider call');
    await assert.rejects(client.call('tasks.submit', { sessionId, submissionId: 'third', content: 'third' }), /accepting/);
    const exited = once(host, 'exit'); finish(waiting.shift()); assert.equal((await exited)[0], 0);
    assert.equal(requests, 1, 'drain must not claim queued task');
    host = await start(); client = await connect(port, (await management('pair')).code); clients.push(client);
    const snapshot = (await client.call('tasks.command', { sessionId, op: 'snapshot' })).snapshot;
    assert.equal(snapshot.paused, true); assert.equal(snapshot.tasks[1].state, 'pending'); assert.equal(snapshot.runs[0].state, 'completed');
    await client.call('tasks.command', { sessionId, op: 'resume', revision: snapshot.revision });
    await until(async () => requests, value => value === 2, 'resumed provider entry');
    const forced = once(host, 'exit'), started = Date.now(); await management('stop', '--force'); await forced;
    assert.ok(Date.now() - started < 15000, 'force stop must be bounded');
  } finally {
    clients.forEach(client => client.close()); waiting.forEach(response => response.destroy());
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await rm(root, { recursive: true, force: true });
  }
});
