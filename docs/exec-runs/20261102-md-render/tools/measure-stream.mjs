// 聊天区流式逐帧稳定性测量（执行计划 T27，聊天区规范 §7.2、§15）。
//
// 用法（先在 worktree 里启动 renderer：pnpm --filter @actspace/desktop dev:renderer）：
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   node docs/exec-runs/20261102-md-render/tools/measure-stream.mjs [http://127.0.0.1:5173] [light|dark]
//
// 打开 `?mock=markdown`，点开「Markdown 流式回放」，每一帧记录最后一条回复正文的高度和每个代码块外壳的高度，
// 直到流式结束并稳定 1.5s。输出：总帧数、正文高度回缩次数（及每次的像素）、代码块回缩次数。
// 代码块回缩必须是 0（规范 §7.2 的硬约束）。
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.argv[2] ?? "http://127.0.0.1:5173";
const theme = process.argv[3] ?? "light";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
await page.goto(`${base}/?mock=markdown`);
await page.getByText("Markdown 流式回放", { exact: true }).first().click();

const result = await page.evaluate(() => new Promise((resolve) => {
  const frames = [];
  let stableSince = 0;
  let sawStreaming = false;
  const started = performance.now();
  // 每个代码块外壳按元素身份编号：Mermaid 在这一轮结束后换成图，是另一个元素，不算回缩。
  const ids = new WeakMap();
  let nextId = 0;
  const shellId = (el) => {
    if (!ids.has(el)) ids.set(el, nextId++);
    return ids.get(el);
  };
  const codeShells = (root) => [...root.querySelectorAll("pre")].map((pre) => {
    const el = pre.closest("[data-code-block], .md-code, .markdown-code-shell, figure") ?? pre;
    return { id: shellId(el), h: el.getBoundingClientRect().height, tail: pre.textContent.slice(-24) };
  });
  const tick = () => {
    const replies = document.querySelectorAll(".markdown-prose");
    const prose = replies[replies.length - 1];
    if (prose) {
      const streaming = Boolean(prose.closest("[data-streaming]") || prose.querySelector("[data-streaming]") || prose.hasAttribute("data-streaming"));
      sawStreaming ||= streaming;
      frames.push({
        t: Math.round(performance.now() - started),
        streaming,
        height: prose.getBoundingClientRect().height,
        tail: prose.textContent.slice(-40),
        code: codeShells(prose),
      });
      if (sawStreaming && !streaming) {
        stableSince ||= performance.now();
        if (performance.now() - stableSince > 1500) return resolve({ frames, sawStreaming });
      } else stableSince = 0;
    }
    if (performance.now() - started > 120_000) return resolve({ frames, sawStreaming, timeout: true });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

await browser.close();

const shrinks = [];
const codeShrinks = [];
for (let i = 1; i < result.frames.length; i += 1) {
  const prev = result.frames[i - 1];
  const cur = result.frames[i];
  if (cur.height < prev.height - 0.5) shrinks.push({ frame: i, t: cur.t, px: Math.round(prev.height - cur.height), streaming: prev.streaming, tailBefore: prev.tail, tailAfter: cur.tail });
  for (const shell of cur.code) {
    const before = prev.code.find((item) => item.id === shell.id);
    if (before && shell.h < before.h - 0.5) codeShrinks.push({ frame: i, t: cur.t, block: shell.id, px: Math.round(before.h - shell.h), tailBefore: before.tail, tailAfter: shell.tail });
  }
}

console.log(JSON.stringify({
  theme,
  timeout: Boolean(result.timeout),
  sawStreaming: result.sawStreaming,
  frames: result.frames.length,
  streamingFrames: result.frames.filter((f) => f.streaming).length,
  finalHeight: Math.round(result.frames.at(-1)?.height ?? 0),
  codeBlocks: result.frames.at(-1)?.code.length ?? 0,
  shrinkCount: shrinks.length,
  shrinks,
  codeShrinkCount: codeShrinks.length,
  codeShrinks,
}, null, 2));
process.exit(codeShrinks.length === 0 && !result.timeout && result.sawStreaming ? 0 : 1);
