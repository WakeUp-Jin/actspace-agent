// 聊天区流式渲染性能（执行计划 T28，聊天区规范 §15）：同一份入口分别测改造前后两版。
//
// 用法：两个 renderer dev server，一个跑本分支，一个跑改造前的代码（例如 `git archive main` 解到临时目录、借用本 worktree 的
// node_modules、单独的 Vite cacheDir），然后：
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   node docs/exec-runs/20261102-md-render/tools/measure-chat.mjs \
//     新版=http://127.0.0.1:5188@/path/to/worktree/apps/desktop 原版=http://127.0.0.1:5190@/tmp/main-src/apps/desktop
//
// 每个版本：把 chat-bench-entry.tsx 临时拷到 `<desktop>/bench-chat.tmp.tsx`，页面里 import 它跑三种场景，跑完删掉。
// 场景（内容取自 mock/markdown-fixture.ts 的示例回复，覆盖规范 §5 全部元素）：
//   - 3KB：示例回复去掉脚注，截到 3KB 以内的块边界；
//   - 30KB：去掉脚注的示例回复重复到 30KB；
//   - 30KB 含脚注：示例回复重复到 30KB，每份的脚注标签不同（每份一个引用、一个定义）。
// 网络流：每 50ms 送 120 个字符。指标是 React Profiler 每次提交的 actualDuration（渲染 MarkdownProse 子树的耗时）。
// 线性检查：比较流式前 20% 和后 20% 的提交耗时中位数。
import { copyFileSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureFile = path.resolve(here, "../../../../apps/desktop/src/renderer/mock/markdown-fixture.ts");
const literal = readFileSync(fixtureFile, "utf8").match(/export const MARKDOWN_SHOWCASE_REPLY = ("(?:[^"\\]|\\.)*");/)[1];
const reply = JSON.parse(literal);

const bytes = (text) => Buffer.byteLength(text, "utf8");
const plain = reply.replace(/\[\^frame\]/g, "").replace(/^\[\^frame\]:.*\n?/m, "");
const repeat = (make) => {
  let out = "";
  for (let i = 0; bytes(out) < 30 * 1024; i += 1) out += (out ? "\n\n" : "") + make(i);
  return out;
};
let small = "";
for (const block of plain.split("\n\n")) {
  if (bytes(small) + bytes(block) + 2 > 3 * 1024) break;
  small += (small ? "\n\n" : "") + block;
}
const cases = {
  "3KB": small,
  "30KB": repeat(() => plain),
  "30KB 含脚注": repeat((i) => reply.replace(/\[\^frame\]/g, `[^frame${i}]`)),
};

const targets = process.argv.slice(2).map((arg) => {
  const [label, rest] = arg.split("=");
  const [url, desktop] = rest.split("@");
  return { label, url, desktop };
});

const stats = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const sum = values.reduce((a, b) => a + b, 0);
  return { n: values.length, median: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted.at(-1).toFixed(2), total: +sum.toFixed(1) };
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const report = {};
for (const target of targets) {
  const entry = path.join(target.desktop, "bench-chat.tmp.tsx");
  copyFileSync(path.join(here, "chat-bench-entry.tsx"), entry);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${target.url}/?mock=empty`);
    await page.waitForTimeout(1500);
    report[target.label] = {};
    for (const [name, content] of Object.entries(cases)) {
      // 先空跑一次预热（懒加载 chunk、JIT），再正式测
      const run = () => page.evaluate(async ({ content }) => {
        const bench = await import("/bench-chat.tmp.tsx");
        return bench.runStream(content, { batch: 120, interval: 50 });
      }, { content });
      await run();
      const result = await run();
      const ms = result.commits.map((c) => c.ms);
      const head = result.commits.filter((c) => c.fed <= content.length * 0.2).map((c) => c.ms);
      const tail = result.commits.filter((c) => c.fed >= content.length * 0.8).map((c) => c.ms);
      report[target.label][name] = {
        bytes: bytes(content),
        commits: stats(ms),
        first20: stats(head),
        last20: stats(tail),
        wallMs: Math.round(result.wall),
        height: Math.round(result.height),
      };
      console.error("done", target.label, name);
    }
    await page.close();
  } finally {
    rmSync(entry, { force: true });
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
