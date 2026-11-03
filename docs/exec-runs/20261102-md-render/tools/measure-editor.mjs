// 「文档」面板编辑器的性能测量（执行计划 T15，编辑器规范 §11）。
//
// 用法（先起 renderer：pnpm --filter @actspace/desktop dev:renderer）：
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   node docs/exec-runs/20261102-md-render/tools/measure-editor.mjs [http://127.0.0.1:5188] [rounds]
//
// 在 dev 页面里直接 import 编辑器内核（`core/config.ts`），把 mock 的示例文档（覆盖规范 §5 全部元素）
// 去掉 frontmatter 后重复拼到 1MB，挂到 760×900 的容器上（和展开面板时正文宽度相当），测：
// - 打开：`createEditorView` 的同步耗时 + 紧接着那一帧里 CodeMirror 首次测量的主线程耗时；
//   不含懒加载 chunk 的下载（模块已预先 import）。预览、源码各测 rounds 次。
// - 按键：每次 `dispatch` 一个字符（userEvent: input.type）的同步耗时 + 这一帧里 CodeMirror 测量的耗时；
//   分别在文档开头、中间、结尾的可见位置连续输入 40 次，其中每 10 次换一次行。
// 帧内测量用前后两个 rAF 夹住 CodeMirror 的测量回调：dispatch 之前登记 A、之后登记 B，
// 同一帧里按登记顺序执行 A → CodeMirror 测量 → B，`B - A` 就是测量本身的主线程耗时（含它触发的同步布局）。
// 不能用 `performance.now() - rAF 的帧时间戳`：帧开始到回调执行之间的空等也会算进去（无头 Chrome 里有好几毫秒）。
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.argv[2] ?? "http://127.0.0.1:5188";
const rounds = Number(process.argv[3] ?? 5);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(`${base}/?mock=empty`);
await page.waitForTimeout(1500);

const result = await page.evaluate(async ({ rounds }) => {
  const core = await import("/src/renderer/components/markdown-editor/core/config.ts");
  const fixture = await import("/src/renderer/mock/docs-fixture.ts");
  const showcase = fixture.mockReadMarkdown("docs/markdown-showcase.md").content;
  const body = showcase.replace(/^---\n[\s\S]*?\n---\n/, "");
  const bytes = (text) => new TextEncoder().encode(text).length;
  let doc = showcase;
  while (bytes(doc) < 1024 * 1024) doc += `\n\n${body}`;

  /** 在 `run` 前后各登记一个 rAF，返回 run 的同步耗时和这一帧里夹在两者之间的耗时。 */
  const timed = (run) => new Promise((resolve) => {
    let before = 0;
    requestAnimationFrame(() => { before = performance.now(); });
    const t0 = performance.now();
    const value = run();
    const sync = performance.now() - t0;
    requestAnimationFrame(() => resolve({ value, sync, measure: performance.now() - before }));
  });
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const idle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return { n: values.length, median: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
  };

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:760px;height:900px;z-index:9999;background:var(--color-bg-main,#fff);display:flex;flex-direction:column";
  document.body.append(host);

  const mount = async (mode) => {
    host.replaceChildren();
    await idle(300);
    const { value: view, sync, measure } = await timed(() => {
      const created = core.createEditorView(host, { doc, mode });
      created.dom.style.height = "100%";
      return created;
    });
    const lines = view.contentDOM.querySelectorAll(".cm-line").length;
    return { view, sync, measure, total: sync + measure, lines };
  };

  const open = {};
  for (const mode of ["preview", "source"]) {
    const runs = [];
    for (let i = 0; i < rounds; i += 1) {
      const { view, sync, measure, total, lines } = await mount(mode);
      runs.push({ sync, measure, total, lines });
      view.destroy();
    }
    open[mode] = {
      total: stats(runs.map((r) => r.total)),
      sync: stats(runs.map((r) => r.sync)),
      measure: stats(runs.map((r) => r.measure)),
      renderedLines: runs[0].lines,
    };
  }

  const typing = {};
  for (const mode of ["preview", "source"]) {
    const { view } = await mount(mode);
    await idle(2000); // 后台解析在空闲时补齐
    const spots = { start: 0.002, middle: 0.5, end: 0.995 };
    typing[mode] = {};
    for (const [name, ratio] of Object.entries(spots)) {
      // 选一个普通段落行的行尾，滚到可见处
      let line = view.state.doc.lineAt(Math.floor(view.state.doc.length * ratio));
      while (line.number < view.state.doc.lines && !/^[一-龥A-Za-z]/.test(line.text)) line = view.state.doc.line(line.number + 1);
      let pos = line.to;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
      await frame();
      await idle(300);
      const samples = [];
      const syncs = [];
      for (let i = 0; i < 40; i += 1) {
        const insert = i % 10 === 9 ? "\n" : "字";
        const at = pos;
        const { sync, measure } = await timed(() => view.dispatch({
          changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: "input.type", scrollIntoView: true,
        }));
        samples.push(sync + measure);
        syncs.push(sync);
        pos += insert.length;
        await idle(30);
      }
      typing[mode][name] = { total: stats(samples), sync: stats(syncs), first: +samples[0].toFixed(2), restMax: +Math.max(...samples.slice(1)).toFixed(2) };
    }
    view.destroy();
  }
  host.remove();
  return { docBytes: bytes(doc), docLines: doc.split("\n").length, open, typing };
}, { rounds });

console.log(JSON.stringify(result, null, 2));
await browser.close();
