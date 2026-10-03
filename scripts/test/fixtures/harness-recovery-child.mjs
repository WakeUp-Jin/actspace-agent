import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCordisRoot, publishPluginArtifact, pluginId, entryId, serviceId } from '../../../packages/cordis-adapter/dist/index.js';
import { composeRuntime } from '../../../packages/composition/dist/index.js';
import { HarnessControl } from '../../../packages/harness-control/dist/index.js';
import { SelectionStore } from '../../../packages/harness-control/dist/selection-store.js';
const [directory, phase] = process.argv.slice(2);
const root = await createCordisRoot();
const artifactRoot = join(directory, 'artifacts');
async function publish(id) {
  const sourceRoot = join(directory, id); await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(sourceRoot, 'plugin.js'), `export function apply(ctx) { ctx.provide('reader', { read: () => '${id}' }); }`);
  return publishPluginArtifact({ sourceRoot, artifactRoot, files: ['plugin.js'], plugin: {
    schemaVersion: 1, pluginId: pluginId(id), version: '1', name: id, runtimeContract: 'actspace.runtime.v2', source: { kind: 'builtin', reference: id }, codecs: [],
    behaviors: [{ entryId: entryId(id), module: './plugin.js', required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId('reader')], injects: [], contracts: { services: { provides: [{ id: 'reader', version: 1 }], requires: [] }, events: { provides: [], requires: [] } } }], contributions: { services: ['reader'], events: [], contributions: [] },
  } });
}
const old = await publish('old'); const next = await publish('new');
const composition = composeRuntime({ profile: { id: 'main', runtimeContract: 'actspace.runtime.v2', orderedBundleIds: ['base'] }, bundles: [{ id: 'base', version: '1', provenance: 'test', manifests: [old.manifest.plugin] }], hostCapabilities: [] });
const append = SelectionStore.prototype.append;
const stop = async () => {
  // Keep the process alive until the parent injects SIGKILL; the lease heartbeat is unref'd.
  setInterval(() => {}, 1000);
  process.send?.({ phase }); await new Promise(() => {});
};
SelectionStore.prototype.append = async function (record) {
  if (record.activationId === 'swap' && phase === 'before-persist') await stop();
  await append.call(this, record);
  if (record.activationId === 'swap' && phase === 'after-persist') await stop();
};
const control = new HarnessControl({ context: root.context, dataRoot: directory, artifactRoot, runtimeId: `process-${process.pid}`, sharedServices: [], compatibility: { services: [], events: [], sharedModules: [], codecArtifacts: [] }, builtin: async () => ({ composition, artifacts: new Map([['old', old]]), sharedServices: [] }), authorize: async r => ({ ...r, actor: 'fixture', decisionId: 'test', expiresAt: Date.now() + 60000 }) });
try {
  await control.initialize();
  if (phase === 'lock-check') {
    process.send?.({ locked: control.inspect().blocked.includes('owned by another Host') });
  } else if (phase === 'inspect') {
    const lease = await control.acquire('main');
    process.send?.({ revision: lease.revision, value: lease.getService('reader').read(), blocked: control.inspect().blocked });
    await lease.release();
  } else {
    const current = control.inspect().current;
    const c = await control.prepare({ harnessId: 'main', expectedRevision: current.revision, baseExecutionDigest: current.executionDigest, artifactIds: [next.artifactId], patch: { id: 'swap', provenance: 'test', operations: [{ id: 'replace', kind: 'replace', target: 'old', artifactId: next.artifactId, manifestEntryId: 'new' }] } });
    await control.activate('swap', c.candidateId);
    if (phase === 'after-ack') await stop();
  }
} catch (error) { process.send?.({ error: String(error), cause: String(error.cause) }); process.exitCode = 1; }
finally { await control.close(); await root.dispose(); process.disconnect?.(); }
