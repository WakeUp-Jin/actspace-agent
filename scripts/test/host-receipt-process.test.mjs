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
async function connect(port, code) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`); await once(socket, 'open');
  const client = new HostClient(socket); await client.authenticate({ code, name: 'lifecycle fixture' }); return client;
}
test('lost submission receipt plus Host crash retains one accepted task without automatic rerun', { timeout: 60000 }, async () => {
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
  try {
    let host = await start();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`); await once(socket, 'open');
    const wrappers = new Map();
    const transport = {
      get readyState() { return socket.readyState; },
      send: data => socket.send(data), close: () => socket.close(),
      addEventListener(type, listener) {
        const wrapped = type === 'message' ? event => {
          const reply = JSON.parse(String(event.data));
          if (reply.result?.task?.submissionId === 'uncertain') { socket.terminate(); return; }
          listener(event);
        } : listener;
        wrappers.set(listener, wrapped); socket.addEventListener(type, wrapped);
      },
      removeEventListener(type, listener) { socket.removeEventListener(type, wrappers.get(listener) ?? listener); },
    };
    const first = new HostClient(transport); clients.push(first);
    await first.authenticate({ code: (await management('pair')).code, name: 'lost receipt fixture' });
    const sessionId = (await first.call('sessions.create', { workspaceId: 'main' })).sessionId;
    await assert.rejects(first.call('tasks.submit', { sessionId, submissionId: 'uncertain', content: 'only one accepted task' }), /connection lost/i);
    const exited = once(host, 'exit'); host.kill('SIGKILL'); await exited;
    // Honor the production stale lease; never rewrite or delete the ownership lock.
    await pause(31000);
    host = await start();
    const second = await connect(port, (await management('pair')).code); clients.push(second);
    const before = (await second.call('tasks.command', { sessionId, op: 'snapshot' })).snapshot;
    assert.equal(before.tasks.length, 1); assert.equal(before.paused, true);
    const receipt = await second.call('tasks.submit', { sessionId, submissionId: 'uncertain', content: 'only one accepted task' });
    assert.equal(receipt.task.taskId, before.tasks[0].taskId);
    await assert.rejects(second.call('tasks.submit', { sessionId, submissionId: 'uncertain', content: 'different' }), /different|conflict/i);
    const after = (await second.call('tasks.command', { sessionId, op: 'snapshot' })).snapshot;
    assert.equal(after.tasks.length, 1); assert.equal(after.runs.length, before.runs.length); assert.ok(requests <= 1);
  } finally {
    clients.forEach(client => client.close()); waiting.forEach(response => response.destroy());
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await rm(root, { recursive: true, force: true });
  }
});
