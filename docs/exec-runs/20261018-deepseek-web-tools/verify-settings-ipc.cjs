const { app } = require('electron');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.ACTSPACE_DATA_DIR;
if (!root || !root.startsWith('/tmp/actspace-deepseek-ipc-')) throw Error('Isolated data root required');
mkdirSync(root, { recursive: true });
process.env.ACTSPACE_WORKSPACE_ROOT = root;
let running = false;
const timer = setTimeout(() => { console.error('IPC verification timed out'); app.exit(1); }, 45000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    if (running) return;
    running = true;
    try {
      const verifyOnly = process.env.ACTSPACE_VERIFY_ONLY === '1';
      const result = await window.webContents.executeJavaScript(`(async () => {
        const bridge = window.actspace;
        if (!bridge) throw Error('Preload missing');
        const before = await bridge.settings.getV4();
        if (${verifyOnly}) return { tools: before.settings.tools };
        if (before.settings.tools.deepseekFetchEnabled || before.settings.tools.searchProviders.deepseek?.enabled) throw Error('Paid capability default must be false');
        const response = await bridge.settings.updateV4({ namespace: 'tools', expectedRevision: before.revision, patch: { searchProviders: { deepseek: { enabled: true }, zhipu: { enabled: false }, tavily: { enabled: true } }, deepseekFetchEnabled: true } });
        if (!response.ok) throw Error('Settings write failed');
        const after = await bridge.settings.getV4();
        return { tools: after.settings.tools };
      })()`);
      assert.equal(result.tools.deepseekFetchEnabled, true);
      assert.equal(result.tools.searchProviders.deepseek.enabled, true);
      assert.equal(result.tools.searchProviders.zhipu.enabled, false);
      assert.equal(result.tools.searchProviders.tavily.enabled, true);
      const persisted = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'));
      assert.equal(persisted.tools.deepseekFetchEnabled, true);
      assert.equal(persisted.tools.searchProviders.zhipu.enabled, false);
      writeFileSync(join(root, verifyOnly ? 'restart-result.json' : 'write-result.json'), JSON.stringify({ ok: true, mode: verifyOnly ? 'restart-read' : 'preload-ipc-write', deepseekSearch: true, zhipuSearch: false, tavilySearch: true, deepseekFetch: true, realProviderCalls: false }, null, 2));
      console.log('DEEPSEEK_IPC_OK', verifyOnly ? 'restart-read' : 'write');
      clearTimeout(timer); app.quit();
    } catch (error) { console.error(String(error)); clearTimeout(timer); app.exit(1); }
  });
});
require(require('node:path').resolve(__dirname, '../../../apps/desktop/dist-electron/main/index.js'));
