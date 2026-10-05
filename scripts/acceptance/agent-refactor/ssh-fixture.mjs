import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { userInfo } from 'node:os';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), root = args[args.indexOf('--root') + 1], provider = args[args.indexOf('--provider') + 1];
if (!args.includes('--root') || !args.includes('--provider') || !isAbsolute(root)) throw new Error('Use --root <new absolute fixture directory> --provider <local synthetic provider URL>');
const url = new URL(provider);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Only the local synthetic Provider is supported');
await mkdir(root, { mode: 0o700 });
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), exec = promisify(execFile), children = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
let stopping;
function stop() { return stopping ??= (async () => { for (const child of children) if (child.exitCode === null && child.signalCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await Promise.race([done, pause(3000)]); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; } } })(); }
process.once('SIGTERM', () => void stop()); process.once('SIGINT', () => void stop());
async function start(command, args, logName) { const log = await open(join(root, logName), 'a', 0o600); const child = spawn(command, args, { cwd: repo, env: { ...process.env, ACTSPACE_FIXTURE_KEY: 'synthetic-host-credential' }, stdio: ['ignore', log.fd, log.fd] }); children.push(child); await log.close(); return child; }
try {
  const hostPort = await port(), sshPort = await port(), workspace = join(root, 'workspace'); await mkdir(workspace);
  const hostConfig = join(root, 'host.json');
  await writeFile(hostConfig, JSON.stringify({ schemaVersion: 1, dataRoot: join(root, 'host-data'), listen: { address: '127.0.0.1', port: hostPort }, allowedOrigins: [], workspaces: [{ id: 'fixture', name: 'SSH Fixture', path: workspace }], providers: [{ id: 'fixture', type: 'openai-completions', baseUrl: provider, keyEnv: 'ACTSPACE_FIXTURE_KEY', models: ['fixture-main'] }], defaultModel: 'fixture/fixture-main' }), { mode: 0o600 });
  const host = await start(process.execPath, [join(repo, 'apps/cli/dist/cli.js'), 'host', 'serve', '--config', hostConfig], 'host.log');
  let ready = false;
  for (let i = 0; i < 150; i++) { if (host.exitCode !== null) throw new Error('Host exited; inspect fixture host.log'); if ((await readFile(join(root, 'host.log'), 'utf8')).includes('"state":"ready"')) { ready = true; break; } await pause(100); }
  if (!ready) throw new Error('Host readiness timed out');
  for (const name of ['host-key', 'device-key']) await exec('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', join(root, name)]);
  await writeFile(join(root, 'authorized_keys'), await readFile(join(root, 'device-key.pub')), { mode: 0o600 });
  await writeFile(join(root, 'sshd_config'), `Port ${sshPort}\nListenAddress 127.0.0.1\nHostKey ${root}/host-key\nPidFile ${root}/sshd.pid\nAuthorizedKeysFile ${root}/authorized_keys\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\nAllowUsers ${userInfo().username}\nAllowTcpForwarding local\nPermitOpen 127.0.0.1:${hostPort}\n`, { mode: 0o600 });
  const daemon = await start('/usr/sbin/sshd', ['-D', '-e', '-f', join(root, 'sshd_config')], 'sshd.log');
  await pause(300); if (daemon.exitCode !== null) throw new Error('sshd unavailable; inspect fixture sshd.log');
  const publicKey = (await readFile(join(root, 'host-key.pub'), 'utf8')).trim().split(' ').slice(0, 2).join(' ');
  await writeFile(join(root, 'known_hosts'), `[127.0.0.1]:${sshPort} ${publicKey}\n`, { mode: 0o600 });
  const config = join(root, 'ssh_config');
  await writeFile(config, `Host closeout-fixture\n HostName 127.0.0.1\n Port ${sshPort}\n User ${userInfo().username}\n IdentityFile ${root}/device-key\n IdentitiesOnly yes\n UserKnownHostsFile ${root}/known_hosts\n GlobalKnownHostsFile /dev/null\n`, { mode: 0o600 });
  const state = { pid: process.pid, hostPid: host.pid, sshPid: daemon.pid, hostPort, sshPort, hostConfig, config, alias: 'closeout-fixture', preload: join(repo, 'scripts/acceptance/agent-refactor/ssh-preload.cjs'), workspace };
  await writeFile(join(root, 'fixture.json'), JSON.stringify(state, null, 2), { mode: 0o600 }); console.log(JSON.stringify(state));
  await Promise.race(children.map(child => once(child, 'exit'))); await stop();
} catch (error) { await stop(); throw error; }
