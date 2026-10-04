import { realpathSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readdir, appendFile, mkdir } from 'node:fs/promises';
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
for (const lockedSession of [false, true]) test(`blocked recovery retains diagnostics and can stop normally (locked Session: ${lockedSession})`, { timeout: 20000 }, async () => {
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
    const client = await connect(port, (await management('pair')).code); clients.push(client);
    const session = await client.call('sessions.create', { workspaceId: 'main' });
    let exited = once(host, 'exit'); await management('stop'); await exited;
    const artifactRoot = join(root, 'data', 'harness-artifacts');
    const [artifactId] = await readdir(artifactRoot);
    await appendFile(join(artifactRoot, artifactId, 'agent-factory.js'), '\n// isolated corruption fixture\n');
    if (lockedSession) {
      const lock = join(root, 'data', 'sessions-v2', session.sessionId, '.writer-lock');
      await mkdir(lock);
      await writeFile(join(lock, 'owner.json'), JSON.stringify({ sessionId: session.sessionId, runtimeId: 'foreign-fixture', pid: process.pid, nonce: 'foreign-fixture', acquiredAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }));
    }
    host = await start();
    const status = await management('status');
    assert.equal(status.state, 'blocked');
    assert.ok(status.diagnostics.some(item => item.component === 'harness-recovery'));
    if (lockedSession) assert.ok(status.diagnostics.some(item => item.component === 'tasks'));
    exited = once(host, 'exit');
    await management('stop');
    await Promise.race([exited, pause(5000).then(() => { throw new Error('Blocked Host did not stop normally'); })]);
  } finally {
    clients.forEach(client => client.close()); waiting.forEach(response => response.destroy());
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); await rm(root, { recursive: true, force: true });
  }
});
