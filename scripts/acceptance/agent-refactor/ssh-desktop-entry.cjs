// Test assembly only. Packaged Electron ignores NODE_OPTIONS=--require.
if (process.type !== 'browser' || !process.env.ACTSPACE_ACCEPTANCE_SSH_CONFIG) throw new Error('Expected isolated acceptance SSH configuration');
require('./ssh-preload.cjs');
console.log('[acceptance] isolated SSH configuration installed');
require('../../../apps/desktop/dist-electron/main/index.js');
