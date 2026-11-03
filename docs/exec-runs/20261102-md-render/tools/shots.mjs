// 聊天区与「文档」面板的截图（执行计划 T14、T27）。
//
// 用法（先起 renderer：pnpm --filter @actspace/desktop dev:renderer，或 tools/serve-nowatch.mjs）：
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//   node docs/exec-runs/20261102-md-render/tools/shots.mjs [http://127.0.0.1:5188]
//
// 输出到 docs/exec-runs/20261102-md-render/shots/：
//   chat-light / chat-dark / chat-narrow / chat-accent-purple：「Markdown 历史回复」整条回复；
//   docs-light-* / docs-dark-* / docs-source：「文档」面板打开 docs/markdown-showcase.md，逐屏截图；
//   docs-narrow-*：编辑器 480px 宽；docs-accent-purple-*：紫色调色板。
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.argv[2] ?? "http://127.0.0.1:5188";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shots");

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

async function open({ width = 1440, height = 900, theme = "light", accent } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: 2 });
  await page.goto(`${base}/?mock=markdown`);
  await page.waitForTimeout(800);
  await page.evaluate(({ theme, accent }) => {
    document.documentElement.setAttribute("data-theme", theme);
    if (accent) document.documentElement.setAttribute("data-accent", accent);
  }, { theme, accent });
  return page;
}

/** 把整条回复截成一张：把消息滚动区的高度临时放开。 */
async function shootReply(page, file, narrowWidth) {
  await page.getByRole("button", { name: "Markdown 历史回复" }).first().click();
  await page.waitForTimeout(2500); // KaTeX、Mermaid、图片懒加载
  // 窄窗：选好会话后再缩窄（窄窗下左栏收起，选不到会话）
  if (narrowWidth) await page.setViewportSize({ width: narrowWidth, height: 900 });
  await page.waitForTimeout(500);
  const prose = page.locator(".markdown-prose").last();
  const height = await prose.evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: Math.min(height + 400, 16000) });
  await page.waitForTimeout(800);
  await prose.screenshot({ path: path.join(out, file) });
}

const chat = [
  ["chat-light.png", {}],
  ["chat-dark.png", { theme: "dark" }],
  ["chat-accent-purple.png", { accent: "purple" }],
  ["chat-narrow.png", { narrow: 560 }],
];
for (const [file, { narrow, ...opts }] of chat) {
  const page = await open(opts);
  await shootReply(page, file, narrow);
  await page.close();
  console.log("shot", file);
}

async function openShowcase(page) {
  await page.getByRole("button", { name: "打开面板" }).click();
  await page.getByText("文档", { exact: true }).click();
  await page.getByText(/^docs$/).click();
  await page.getByText("markdown-showcase.md", { exact: true }).first().click();
  await page.locator(".cm-content").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "展开面板" }).click();
  await page.waitForTimeout(2500); // KaTeX、Mermaid、图片
}

/** 「文档」面板：从头往下一屏一屏截，直到底部。 */
async function shootDocs(page, prefix) {
  const scroller = page.locator(".cm-scroller").first();
  await scroller.evaluate((el) => { el.scrollTop = 0; });
  for (let i = 1; i <= 12; i += 1) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `${prefix}-${i}.png`) });
    const done = await scroller.evaluate((el) => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) return true;
      el.scrollTop += el.clientHeight * 0.85;
      return false;
    });
    if (done) break;
  }
}

for (const theme of ["light", "dark"]) {
  const page = await open({ theme, height: 1000 });
  await openShowcase(page);
  await shootDocs(page, `docs-${theme}`);
  if (theme === "light") {
    await page.getByRole("tab", { name: "源码" }).click();
    await page.locator(".cm-scroller").first().evaluate((el) => { el.scrollTop = 0; });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, "docs-source.png") });
  }
  await page.close();
  console.log("shot docs", theme);
}

// 窄窗：展开面板后把窗口缩到编辑器约 480px 宽
{
  const page = await open({ height: 1000 });
  await openShowcase(page);
  const editor = page.locator(".cm-editor").first();
  let width = 1440;
  for (;;) {
    const w = await editor.evaluate((el) => el.getBoundingClientRect().width);
    if (w <= 482 || width <= 400) break;
    width -= Math.max(2, Math.round(w - 480));
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(200);
  }
  console.log("narrow viewport", width, "editor", await editor.evaluate((el) => el.getBoundingClientRect().width));
  await shootDocs(page, "docs-narrow");
  await page.close();
}

// 紫色调色板
{
  const page = await open({ height: 1000, accent: "purple" });
  await openShowcase(page);
  await shootDocs(page, "docs-accent-purple");
  await page.close();
  console.log("shot docs purple");
}

await browser.close();
