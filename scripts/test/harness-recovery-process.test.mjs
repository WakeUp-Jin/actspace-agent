import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const fixture = new URL('./fixtures/harness-recovery-child.mjs', import.meta.url);
function run(root, phase) {
  const child = fork(fixture, [root, phase], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = ''; child.stderr.on('data', b => { output += b; });
  const message = new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('exit', code => reject(new Error(`Child exited ${code}: ${output}`)));
    child.once('error', reject);
  });
  return { child, message };
}
test('recovers the durable side of SIGKILL before persistence, after persistence and after acknowledgement', { timeout: 60000 }, async () => {
  const roots = []; const children = [];
  try {
    const cases = await Promise.all(['before-persist', 'after-persist', 'after-ack'].map(async phase => {
      const root = await mkdtemp(join(tmpdir(), 'harness-process-')); roots.push(root);
      const first = run(root, phase); children.push(first.child);
      assert.deepEqual(await first.message, { phase });
      const competing = run(root, 'lock-check'); children.push(competing.child);
      const competitorExited = once(competing.child, 'exit');
      assert.deepEqual(await competing.message, { locked: true });
      assert.equal((await competitorExited)[0], 0);
      const exited = once(first.child, 'exit'); first.child.kill('SIGKILL'); await exited;
      return { root, revision: phase === 'before-persist' ? 1 : 2, value: phase === 'before-persist' ? 'old' : 'new' };
    }));
    // Exercise the production stale-lease rule; never delete or rewrite a live lock.
    await delay(31000);
    await Promise.all(cases.map(async row => {
      const second = run(row.root, 'inspect'); children.push(second.child);
      const exited = once(second.child, 'exit');
      assert.deepEqual(await second.message, { revision: row.revision, value: row.value, blocked: '' });
      const [code] = await exited; assert.equal(code, 0);
    }));
  } finally { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))); }
});
