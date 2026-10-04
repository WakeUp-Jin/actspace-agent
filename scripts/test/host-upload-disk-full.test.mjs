import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
// Run on an isolated 16 MiB tmpfs; never fill a developer's normal filesystem.
test('upload disk exhaustion preserves acknowledged offset and resumes after recovery', { skip: !process.env.ACTSPACE_UPLOAD_FAULT_DIR }, async () => {
  const require = createRequire(realpathSync(process.env.ACTSPACE_HOST_TEST_PACKAGE));
  const { HostUploads } = await import(require.resolve('@actspace/agent-host'));
  const root = await mkdtemp(join(process.env.ACTSPACE_UPLOAD_FAULT_DIR, 'fault-'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  try {
    const filler = join(root, 'filler'); await writeFile(filler, Buffer.alloc(14 * 1024 * 1024));
    const bytes = Buffer.alloc(4 * 1024 * 1024, 42), store = new HostUploads(join(root, 'uploads'));
    const item = await store.begin({ deviceId: 'd', sessionId: 's', name: 'file.bin', size: bytes.length, sha256: hash(bytes) });
    let failure;
    for (let offset = 0; offset < bytes.length; offset += 262144) {
      const chunk = bytes.subarray(offset, offset + 262144);
      try { await store.write('d', 's', item.id, offset, chunk.toString('base64'), hash(chunk)); }
      catch (error) { failure = error; break; }
    }
    assert.equal(failure?.code, 'ENOSPC');
    await rm(filler);
    const recovered = new HostUploads(join(root, 'uploads')), status = await recovered.status('d', 's', item.id);
    assert.ok(status.offset > 0 && status.offset < bytes.length); assert.equal(status.complete, false);
    await assert.rejects(recovered.pin('d', 's', [item.id], 'submission'), /incomplete/);
    for (let offset = status.offset; offset < bytes.length; offset += 262144) {
      const chunk = bytes.subarray(offset, offset + 262144);
      await recovered.write('d', 's', item.id, offset, chunk.toString('base64'), hash(chunk));
    }
    await recovered.finish('d', 's', item.id); await recovered.pin('d', 's', [item.id], 'submission');
    assert.equal(hash((await recovered.readForSession('s', item.id)).bytes), hash(bytes));
  } finally { await rm(root, { recursive: true, force: true }); }
});
