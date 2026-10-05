// Test assembly only: select isolated OpenSSH configuration without replacing transport.
if (process.type === 'browser' && process.env.ACTSPACE_ACCEPTANCE_SSH_CONFIG) {
  const childProcess = require('node:child_process');
  const { appendFileSync, realpathSync } = require('node:fs');
  const { isAbsolute } = require('node:path');
  const { syncBuiltinESMExports } = require('node:module');
  const config = process.env.ACTSPACE_ACCEPTANCE_SSH_CONFIG;
  if (!isAbsolute(config) || !realpathSync(config).endsWith('/ssh_config')) throw new Error('Expected isolated acceptance SSH configuration');
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function (command, args, options) {
    if (command === '/usr/bin/ssh') {
      if (!Array.isArray(args) || args.at(-1) !== 'closeout-fixture' || args.includes('-F')) throw new Error('Acceptance SSH only allows closeout-fixture');
      appendFileSync(config + '.calls', JSON.stringify({ alias: args.at(-1), at: new Date().toISOString() }) + '\n');
      return originalSpawn.call(this, command, ['-F', config, ...args], options);
    }
    return originalSpawn.call(this, command, args, options);
  };
  syncBuiltinESMExports();
}
