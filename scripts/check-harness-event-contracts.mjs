import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
/** Scan explicit dispatch literals. Dynamic wrappers are validated separately by adapter tests. */
export function inspectHarnessEvents(declarations, sources) {
  const modes = new Map([...declarations.matchAll(/\/\*\*\s*@mode\s+(emit|waterfall|parallel|serial|bail)\s*\*\/\s*"([^"]+)"/g)].map(m => [m[2], m[1]]));
  const errors = [];
  const wrappers = { emitContained: 'emit', requiredDispatch: 'emit', waterfallDispatch: 'waterfall', serialDispatch: 'serial' };
  for (const [path, source] of sources) {
    const calls = [...source.matchAll(/\.(emit|required|serial|waterfall|parallel|bail)\(\s*"([^"]+)"/g)].map(m => [m[1] === 'required' ? 'emit' : m[1], m[2]]);
    for (const [wrapper, mode] of Object.entries(wrappers)) for (const m of source.matchAll(new RegExp(`\\b${wrapper}\\([^,]+,\\s*"([^"]+)"`, 'g'))) calls.push([mode, m[1]]);
    for (const [mode, event] of calls) {
      if (!modes.has(event)) errors.push(`${path}: missing @mode for ${event}`);
      else if (modes.get(event) !== mode) errors.push(`${path}: ${event} requires ${modes.get(event)}, dispatched ${mode}`);
    }
  }
  return errors;
}
async function walk(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'test' || entry.name === 'testing.ts') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name)) result.push([path, await readFile(path, 'utf8')]);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const declarations = (await Promise.all(['packages/cordis-adapter/src/event-contract.ts', 'packages/harness-control/src/contracts.ts', 'packages/agent-service/src/service.ts', 'packages/runtime/src/runtime/session-plugin.ts'].map(path => readFile(path, 'utf8')))).join('\n');
  const sources = (await Promise.all(['packages/core/agent-loop/src', 'packages/tools/runtime/src', 'packages/runtime/src/runtime', 'packages/harness-control/src'].map(walk))).flat();
  const errors = inspectHarnessEvents(declarations, sources);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Harness event mode declarations and explicit dispatch sites match');
}
