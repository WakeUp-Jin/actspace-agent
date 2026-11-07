// 分析 monitor.mjs 录下的数据。用法见 docs/tools/heap-monitor/README.md：
//   node scripts/diagnostics/heap-monitor/analyze.mjs summary <runDir...>
//   node scripts/diagnostics/heap-monitor/analyze.mjs top <runDir> <main|renderer> [--filter=正则] [--top=N]
//   node scripts/diagnostics/heap-monitor/analyze.mjs callers <runDir> <main|renderer> <函数名正则> [--depth=N] [--top=N]
//   node scripts/diagnostics/heap-monitor/analyze.mjs compare <旧runDir> <新runDir> <main|renderer> [--filter=正则] [--top=N]
//
// 分配采样（.heapprofile）里每个节点是一个调用帧，samples 记录这个帧自己分配了多少字节（含已被 GC 回收的对象）。
// - 自身分配：分配发生在这个函数体内；
// - 包含分配：这个函数和它调用的所有函数一共分配了多少；同一条调用链上同一个函数只算一次（递归不重复算）。
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MB = (bytes) => (bytes / 1048576).toFixed(1).padStart(8);

/** 帧的名字：函数名 + 文件名（不带行号，不同版本的代码可以对比）。 */
export function frameName(callFrame) {
  const file = callFrame.url.split("/").at(-1)?.split("?")[0] || "(native)";
  return `${callFrame.functionName || "(anon)"} ${file}`;
}

function selfSizes(profile) {
  const sizes = new Map();
  for (const sample of profile.samples ?? []) sizes.set(sample.nodeId, (sizes.get(sample.nodeId) ?? 0) + sample.size);
  return sizes;
}

/** 一份或多份采样 → { total, self: Map<名字, 字节>, inclusive: Map<名字, 字节> }。filter 只限制哪些帧计入包含分配。 */
export function aggregate(profiles, filter) {
  const self = new Map();
  const inclusive = new Map();
  let total = 0;
  for (const profile of profiles) {
    const sizes = selfSizes(profile);
    const stack = [{ node: profile.head, active: new Set() }];
    while (stack.length > 0) {
      const { node, active } = stack.pop();
      const name = frameName(node.callFrame);
      const size = sizes.get(node.id) ?? 0;
      total += size;
      if (size) self.set(name, (self.get(name) ?? 0) + size);
      const counts = !active.has(name) && (!filter || filter.test(`${node.callFrame.url} ${node.callFrame.functionName}`));
      const next = counts ? new Set(active).add(name) : active;
      if (size) for (const key of next) inclusive.set(key, (inclusive.get(key) ?? 0) + size);
      for (const child of node.children ?? []) stack.push({ node: child, active: next });
    }
  }
  return { total, self, inclusive };
}

/** 匹配 fnPattern 的帧（最外层那次）按「往上 depth 层调用方」汇总包含分配。 */
export function callers(profiles, fnPattern, depth = 4) {
  const totals = new Map();
  for (const profile of profiles) {
    const sizes = selfSizes(profile);
    const subtotal = (node) => { let sum = sizes.get(node.id) ?? 0; for (const child of node.children ?? []) sum += subtotal(child); return sum; };
    const walk = (node, chain) => {
      if (fnPattern.test(node.callFrame.functionName)) {
        const key = [frameName(node.callFrame), ...chain.slice(-depth).reverse()].join(" ← ");
        totals.set(key, (totals.get(key) ?? 0) + subtotal(node));
        return;
      }
      for (const child of node.children ?? []) walk(child, [...chain, frameName(node.callFrame)]);
    };
    walk(profile.head, []);
  }
  return totals;
}

/** monitor.mjs 的 samples.jsonl → 每 30 秒一行：堆、RSS、主线程延迟、CPU、渲染进程内存。 */
export function summarizeSamples(rows) {
  const valid = rows.filter((row) => row.main);
  if (valid.length === 0) return { seconds: 0, buckets: [] };
  const start = valid[0].t;
  const buckets = new Map();
  for (const row of valid) {
    const index = Math.floor((row.t - start) / 30_000);
    const bucket = buckets.get(index) ?? { at: index * 30, heapMax: 0, rssMax: 0, lagMax: 0, mainCpu: 0, rendererCpu: 0, rendererWorkingSetMax: 0, count: 0 };
    const browser = row.processes?.find((process) => process.type === "Browser");
    const tabs = row.processes?.filter((process) => process.type === "Tab") ?? [];
    bucket.heapMax = Math.max(bucket.heapMax, row.main.heapUsed);
    bucket.rssMax = Math.max(bucket.rssMax, row.main.rss);
    bucket.lagMax = Math.max(bucket.lagMax, row.mainLagMs ?? 0);
    bucket.mainCpu += browser?.cpu ?? 0;
    bucket.rendererCpu += tabs.reduce((sum, process) => sum + process.cpu, 0);
    bucket.rendererWorkingSetMax = Math.max(bucket.rendererWorkingSetMax, tabs.reduce((sum, process) => sum + process.workingSetKB * 1024, 0));
    bucket.count += 1;
    buckets.set(index, bucket);
  }
  return { seconds: (valid.at(-1).t - start) / 1000, buckets: [...buckets.values()].map((bucket) => ({ ...bucket, mainCpu: bucket.mainCpu / bucket.count, rendererCpu: bucket.rendererCpu / bucket.count })) };
}

function loadProfiles(dir, prefix) {
  const files = readdirSync(dir).filter((file) => file.startsWith(`${prefix}-`) && file.endsWith(".heapprofile")).sort();
  if (files.length === 0) throw new Error(`${dir} 里没有 ${prefix}-*.heapprofile`);
  return files.map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")));
}

function option(args, name, fallback) {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** 应用代码：去掉 V8 内部帧、node: 内置模块和打包后的依赖入口，只看自己的函数。 */
const APP_FRAME = (name) => !/^\(|node:| index\.js$| \(native\)$/.test(name);

function sorted(map, top) {
  return [...map].sort((a, b) => b[1] - a[1]).slice(0, top);
}

function main(argv) {
  const [command, ...rest] = argv;
  const positional = rest.filter((arg) => !arg.startsWith("--"));
  const top = Number(option(rest, "top", "25"));
  const filterSource = option(rest, "filter", "");
  const filter = filterSource ? new RegExp(filterSource) : undefined;
  if (command === "summary") {
    for (const dir of positional) {
      const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
      const { seconds, buckets } = summarizeSamples(rows);
      console.log(`== ${dir}  ${rows.length} 个采样点，${seconds.toFixed(0)} 秒`);
      for (const bucket of buckets) {
        console.log(`${String(bucket.at).padStart(5)}s  主进程堆 ${(bucket.heapMax / 1e6).toFixed(0).padStart(4)}MB  RSS ${(bucket.rssMax / 1e6).toFixed(0).padStart(4)}MB  主线程延迟 ${String(bucket.lagMax).padStart(5)}ms  主进程CPU ${bucket.mainCpu.toFixed(0).padStart(3)}%  渲染CPU ${bucket.rendererCpu.toFixed(0).padStart(3)}%  渲染内存 ${(bucket.rendererWorkingSetMax / 1048576).toFixed(0)}MB`);
      }
    }
    return;
  }
  if (command === "top") {
    const [dir, prefix] = positional;
    const result = aggregate(loadProfiles(dir, prefix), filter);
    console.log(`合计分配 ${MB(result.total)} MB`);
    console.log("--- 自身分配");
    for (const [name, bytes] of sorted(result.self, top)) console.log(MB(bytes), name);
    console.log("--- 包含分配（应用代码）");
    for (const [name, bytes] of sorted(new Map([...result.inclusive].filter(([name]) => APP_FRAME(name))), top)) console.log(MB(bytes), name);
    return;
  }
  if (command === "callers") {
    const [dir, prefix, pattern] = positional;
    const totals = callers(loadProfiles(dir, prefix), new RegExp(pattern), Number(option(rest, "depth", "4")));
    for (const [chain, bytes] of sorted(totals, top)) console.log(MB(bytes), chain);
    return;
  }
  if (command === "compare") {
    const [before, after, prefix] = positional;
    const left = aggregate(loadProfiles(before, prefix), filter);
    const right = aggregate(loadProfiles(after, prefix), filter);
    console.log(`合计分配 ${MB(left.total)} MB → ${MB(right.total)} MB`);
    const names = new Set([...sorted(left.inclusive, top * 2), ...sorted(right.inclusive, top * 2)].map(([name]) => name).filter(APP_FRAME));
    const rows = [...names].map((name) => [name, left.inclusive.get(name) ?? 0, right.inclusive.get(name) ?? 0]);
    rows.sort((a, b) => Math.max(b[1], b[2]) - Math.max(a[1], a[2]));
    console.log("     之前 MB     之后 MB  函数（包含分配）");
    for (const [name, a, b] of rows.slice(0, top)) console.log(MB(a), MB(b), name);
    return;
  }
  console.error("用法：analyze.mjs summary|top|callers|compare …（见 docs/tools/heap-monitor/README.md）");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
