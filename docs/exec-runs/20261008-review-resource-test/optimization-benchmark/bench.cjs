// 用法: node bench.cjs <mode: before|after> <workload: ignored-churn|tracked-save|tracked-churn> <repo> <out.json>
// before = 旧语义：150ms 合并、不传路径、无过滤；after = 默认 500ms + Git 忽略过滤。
const fs = require('node:fs/promises'), path = require('node:path'), { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const dist = '/tmp/review-opt-bench/dist/main';
const { ReviewWorkspaceWatcher } = require(dist + '/review-workspace-watcher.js');
const { ReviewCoordinator } = require(dist + '/review-coordinator.js');
const { ReviewGitEngine, runReviewGitCommand } = require(dist + '/review-git-engine.js');
const { createReviewIgnoredPathFilter } = require(dist + '/review-ignore-filter.js');
const [mode, workload, repo, out] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const trackedChurn = Array.from({ length: 20 }, (_, i) => `src/group-1/file-${100 + i}.txt`);
(async () => {
  let events = 0, notices = 0, engineCommands = 0, filterCommands = 0, queries = 0, failures = 0, writes = 0;
  const counting = (bucket) => (args, opts) => { bucket === 'filter' ? filterCommands++ : engineCommands++; return runReviewGitCommand(args, opts); };
  const engine = new ReviewGitEngine({ runner: counting('engine') });
  const coord = new ReviewCoordinator({
    resolveWorkspace: async () => ({ ok: true, workspace: { workspaceId: 'fixture', workspaceRoot: repo } }),
    queryProvider: engine,
    ...(mode === 'before' ? { debounceMs: 150 } : { filterWatchPaths: createReviewIgnoredPathFilter(counting('filter')) }),
  });
  const pending = new Set();
  let lastWriteAt = 0; const latencies = [];
  coord.subscribe(() => {
    notices++; queries++;
    const noticeAt = performance.now();
    const p = coord.getSnapshot({ workspaceRoot: repo, selection: { kind: 'uncommitted' } }).then((r) => {
      if (!r.ok) failures++;
      if (workload === 'tracked-save' && lastWriteAt) latencies.push({ noticeMs: noticeAt - lastWriteAt, snapshotMs: performance.now() - lastWriteAt });
    });
    pending.add(p); p.finally(() => pending.delete(p));
  });
  const watcher = new ReviewWorkspaceWatcher();
  await watcher.ensure('fixture', repo, (changedPath) => {
    events++;
    coord.scheduleInvalidation('fixture', 'watch', mode === 'before' || changedPath === undefined ? undefined : { workspaceRoot: repo, path: changedPath });
  });
  await wait(1000);
  const cpu = process.cpuUsage(), started = performance.now();
  let n = 0;
  while (performance.now() - started < 20_000) {
    if (workload === 'ignored-churn') {
      await Promise.all(Array.from({ length: 20 }, (_, i) => fs.writeFile(path.join(repo, 'dist', `output-${i}.js`), `// ${n} ${i}\n`))); writes += 20; await wait(50);
    } else if (workload === 'tracked-churn') {
      await Promise.all(trackedChurn.map((file, i) => fs.writeFile(path.join(repo, file), `churn ${n} ${i}\n`))); writes += 20; await wait(50);
    } else {
      lastWriteAt = performance.now();
      await fs.writeFile(path.join(repo, trackedChurn[0]), `save ${n}\n`); writes += 1; await wait(1000);
    }
    n++;
  }
  const elapsed = performance.now() - started, used = process.cpuUsage(cpu);
  await wait(1500); await Promise.allSettled([...pending]);
  watcher.dispose(); coord.dispose();
  if (workload !== 'ignored-churn') execFileSync('git', ['checkout', '--', ...trackedChurn], { cwd: repo });
  const sorted = latencies.map((l) => l.snapshotMs).sort((a, b) => a - b);
  const result = { mode, workload, elapsedMs: elapsed, nodeCpuPercent: (used.user + used.system) / 1000 / elapsed * 100, writes, events, notifications: notices, queries, failures, engineGitCommands: engineCommands, filterGitCommands: filterCommands,
    ...(workload === 'tracked-save' ? { saveToSnapshotMs: { median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], samples: sorted.length } } : {}) };
  await fs.writeFile(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})().catch((e) => { console.error(e); process.exitCode = 1; });
