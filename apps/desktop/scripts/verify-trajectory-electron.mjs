/** Opt-in real Electron/preload/IPC acceptance; no Provider call or user data writes. */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createCoreCodecRegistry } from '@actspace/session-journal';
import { SessionStore } from '../../../packages/session/persistence/dist/index.js';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.ACTSPACE_PLAYWRIGHT_MODULE;
if (!playwrightPath) throw new Error('Set ACTSPACE_PLAYWRIGHT_MODULE to an installed playwright module.');
const { _electron } = await import(pathToFileURL(playwrightPath));
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = await mkdtemp(join(tmpdir(), 'actspace-trajectory-phase5-'));
const registry = createCoreCodecRegistry();
const store = new SessionStore({ dataRoot, runtimeId: 'trajectory-acceptance', registry });
const sessionId = 'trajectory-phase5-verification';
const session = await store.create({ sessionId, createdAt: new Date().toISOString(), cwd: desktop, lineage: null, createdWith: { profileId: 'base', runtimeContractVersion: 'actspace.runtime.v2', manifestDigest: 'acceptance', plugins: [{ id: '@actspace/core', version: '2.0.0' }], codecSetDigest: registry.digest } });
const append = (type, data, surface = null) => session.append({ type, eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data, surface });
await append('session/title-set', { title: 'Trajectory Phase 5 verification' });
for (let turn = 1; turn <= 25; turn++) {
  const ids = { turnId: `t${turn}`, stepId: `s${turn}`, requestId: `r${turn}` };
  await append('turn/start', { turnId: ids.turnId });
  await append('user/message', { turnId: ids.turnId, messageId: `u${turn}` }, { kind: 'append', node: { kind: 'user', messageId: `u${turn}`, content: `Question ${turn}` } });
  await append('step/start', ids);
  await append('request/header', { ...ids, model: 'acceptance-model', routeId: 'default' });
  await append('request/context', { ...ids, snapshot: { renderedSystemPrompt: 'You are the verification assistant.', tools: [{ name: 'read_file', description: 'Read a UTF-8 file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }], requestOptions: {} } });
  await append('assistant/chunk', { ...ids, messageId: `a${turn}`, chunkIndex: 0, kind: 'assistant-delta', content: 'Inspecting' });
  const content = [{ type: 'text', text: `Answer ${turn}` }, { type: 'tool-call', callId: `c${turn}`, name: 'read_file', arguments: '{"path":"example.txt"}' }];
  await append('assistant/message', { ...ids, messageId: `a${turn}`, content, finishReason: 'tool-calls', usage: { outputTokens: 10 } }, { kind: 'append', node: { kind: 'assistant', messageId: `a${turn}`, content } });
  await append('tool/call', { turnId: ids.turnId, stepId: ids.stepId, callId: `c${turn}`, name: 'read_file', pluginId: 'core', args: { path: 'example.txt' } });
  await append('tool/result', { callId: `c${turn}`, name: 'read_file', status: 'completed', summary: '1 line read', modelOutput: [{ type: 'text', text: `File output ${turn}` }], detail: [], artifacts: [] });
  await append('step/end', { ...ids, reason: 'completed' });
  await append('turn/end', { turnId: ids.turnId, reason: 'completed' });
}
await session.close();
const env = { ...process.env, ACTSPACE_DATA_DIR: dataRoot, ACTSPACE_REPO_ROOT: resolve(desktop, '../..'), ACTSPACE_DEV_APP_NAME: 'ActSpace Trajectory Verification' };
delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
const app = await _electron.launch({ executablePath: require('electron'), args: [join(desktop, 'dist-electron/main/index.js')], cwd: desktop, env, timeout: 30000 });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.actspace?.getSessionProjectionSnapshot === 'function');
  const result = await page.evaluate(async id => {
    const first = await window.actspace.getSessionProjectionSnapshot({ sessionId: id });
    const earlier = await window.actspace.getSessionProjectionSnapshot({ sessionId: id, beforeSeq: first.window.beforeSeq });
    const earliest = await window.actspace.getSessionProjectionSnapshot({ sessionId: id, beforeSeq: earlier.window.beforeSeq });
    return { revision: first.throughJournalSeq, snapshotRevision: first.snapshot.throughJournalSeq, history: first.window, earlier: earlier.window, earliest: earliest.window };
  }, sessionId);
  assert.equal(result.revision, result.snapshotRevision);
  assert.equal(result.history.turnOffset, 15); assert.equal(result.earlier.turnOffset, 5); assert.equal(result.earliest.fromSeq, 0);
  await page.getByRole('button', { name: /Trajectory Phase 5 verification/ }).first().click();
  await page.getByRole('button', { name: '查看执行轨迹', exact: true }).click();
  await page.getByRole('button', { name: 'Load earlier history', exact: true }).click();
  await page.getByRole('button', { name: 'Load earlier history', exact: true }).click();
  await page.getByRole('button', { name: 'USER user/message, Question 1', exact: true }).waitFor();
  await page.getByRole('button', { name: 'ASSISTANT assistant/message, Answer 1', exact: true }).click();
  await page.getByRole('button', { name: 'Open tool call c1', exact: true }).click();
  await page.getByRole('tab', { name: 'Result', exact: true }).click();
  assert.match(await page.getByRole('tabpanel').innerText(), /File output 1/);
  await page.getByRole('tab', { name: 'Schema', exact: true }).click();
  assert.match(await page.getByRole('tabpanel').innerText(), /Read a UTF-8 file/);
  await page.screenshot({ path: join(dataRoot, 'electron-trajectory.png') });
  // Real IPC mutation in the isolated Session exercises the commit observer.
  const committed = await page.evaluate(async id => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { off(); reject(new Error('No committed Journal notification')); }, 10000);
      const off = window.actspace.onSessionLiveEvent(({ event }) => {
        if (event.sessionId === id && event.kind === 'journal-update') { clearTimeout(timeout); off(); resolve(event.throughJournalSeq); }
      });
      window.actspace.renameSession({ sessionId: id, title: 'Trajectory Phase 5 verified' }).catch(error => { clearTimeout(timeout); off(); reject(error); });
    });
  }, sessionId);
  assert.ok(committed > result.revision);
  const composer = page.getByRole('textbox', { name: '消息输入框', exact: true });
  await composer.fill('Unsent verification draft');
  await page.getByRole('button', { name: '返回对话', exact: true }).click();
  assert.equal(await composer.inputValue(), 'Unsent verification draft');
  await page.getByRole('button', { name: '查看执行轨迹', exact: true }).click();
  assert.equal(await composer.inputValue(), 'Unsent verification draft');
  await page.reload();
  const reloaded = await page.evaluate(id => window.actspace.getSessionProjectionSnapshot({ sessionId: id }), sessionId);
  assert.equal(reloaded.snapshot.metadata.title, 'Trajectory Phase 5 verified');
  assert.equal(reloaded.throughJournalSeq, committed);
  console.log(JSON.stringify({ passed: true, checks: ['real Journal', 'preload', 'IPC revisions', 'history paging', 'UI history', 'assistant-tool link', 'tool output', 'schema', 'commit notifications', 'Composer draft toggle', 'reload'], evidence: join(dataRoot, 'electron-trajectory.png') }));
} catch (error) {
  const page = app.windows()[0];
  if (page) { await page.screenshot({ path: join(dataRoot, 'electron-failure.png') }); console.log((await page.locator('body').innerText()).slice(0,3500)); }
  throw error;
} finally { await app.close(); }
