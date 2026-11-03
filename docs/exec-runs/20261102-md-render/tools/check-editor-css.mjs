// 「文档」编辑器的计算样式检查：确认 styles/markdown-editor.css（layer(components)）没有被
// CodeMirror 自带主题（不在 cascade layer 里）盖掉。见 core/layer-bridge.ts。
//
// 用法：PLAYWRIGHT_CORE=… node docs/exec-runs/20261102-md-render/tools/check-editor-css.mjs [http://127.0.0.1:5188] [light|dark]
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const base = process.argv[2] ?? "http://127.0.0.1:5188";
const theme = process.argv[3] ?? "light";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: theme });
await page.goto(`${base}/?mock=markdown`);
await page.waitForTimeout(800);
await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
await page.getByRole("button", { name: "打开面板" }).click();
await page.getByText("文档", { exact: true }).click();
await page.getByText(/^docs$/).click();
await page.getByText("markdown-showcase.md", { exact: true }).first().click();
await page.locator(".cm-content").waitFor({ timeout: 60_000 });
await page.getByRole("button", { name: "展开面板" }).click();
await page.waitForTimeout(1000);

/** CodeMirror 只渲染视口里的行：从头往下滚，记下每个选择器第一次出现时的计算样式。 */
async function collect(specs) {
  return page.evaluate(async (specs) => {
    const scroller = document.querySelector(".cm-scroller");
    const found = {};
    scroller.scrollTop = 0;
    for (let i = 0; i < 80; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const [key, sel, prop] of specs) {
        if (found[key] !== undefined) continue;
        const el = document.querySelector(sel);
        if (el) found[key] = getComputedStyle(el).getPropertyValue(prop);
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
      scroller.scrollTop += scroller.clientHeight * 0.8;
    }
    scroller.scrollTop = 0;
    for (const [key] of specs) found[key] ??= "(missing)";
    return found;
  }, specs);
}

const preview = await collect([
  ["editorOutline", ".cm-editor", "outline-style"],
  ["scrollerFont", ".cm-scroller", "font-family"],
  ["contentPadding", ".cm-content", "padding"],
  ["contentMarginLeft", ".cm-content", "margin-left"],
  ["linePadding", ".cm-line:not([class*=' md-']):not([class^='md-'])", "padding"],
  ["quotePaddingLeft", ".cm-line.md-quote:not(.md-quote-d2):not(.md-quote-d3)", "padding-left"],
  ["hangPaddingLeft", ".cm-line.md-li-hang", "padding-left"],
  ["codeLinePadding", ".cm-line.md-code-line:not(.md-code-first):not(.md-code-last)", "padding"],
  ["tableRowDisplay", ".cm-line.md-tr", "display"],
  ["proseBufferDisplay", ".cm-line:not(.md-code-line):not(.md-tr) > .cm-widgetBuffer", "display"],
  ["inlineLineHeight", ".cm-line:has(.tok-em):not(.md-h)", "height"],
]);
preview.scrollerFont = preview.scrollerFont.split(",")[0];
await page.getByRole("tab", { name: "源码" }).click();
await page.waitForTimeout(600);
const source = await collect([
  ["scrollerFont", ".cm-scroller", "font-family"],
  ["linePadding", ".cm-line", "padding"],
  ["guttersBg", ".cm-gutters", "background-color"],
  ["guttersBorderRight", ".cm-gutters", "border-right"],
  ["gutterElementPadding", ".cm-lineNumbers .cm-gutterElement + .cm-gutterElement", "padding"],
]);
source.scrollerFont = source.scrollerFont.split(",")[0];
await browser.close();

const fails = [];
const expect = (label, ok) => { if (!ok) fails.push(label); };
expect("preview outline none", preview.editorOutline === "none");
expect("preview font sans", !/mono/i.test(preview.scrollerFont));
expect("preview content padding 12px 0 64px", preview.contentPadding === "12px 0px 64px");
expect("preview content centered", preview.contentMarginLeft !== "0px");
expect("preview line padding 2px 16px", preview.linePadding === "2px 16px");
expect("quote padding-left 12px", preview.quotePaddingLeft === "12px");
expect("list hang padding-left > 16px", parseFloat(preview.hangPaddingLeft) > 16);
expect("code line padding 0 12px", preview.codeLinePadding === "0px 12px");
expect("table row flex", preview.tableRowDisplay === "flex");
expect("prose widget buffer stays inline", preview.proseBufferDisplay === "inline");
expect("line with emphasis is not exploded (< 3 lines)", parseFloat(preview.inlineLineHeight) < 3 * 14 * 1.4 + 4);
expect("source font mono", /mono|menlo|sf ?mono|consolas/i.test(source.scrollerFont));
expect("source line padding 0 16px 0 12px", source.linePadding === "0px 16px 0px 12px");
expect("gutter padding 0 10px 0 14px", source.gutterElementPadding === "0px 10px 0px 14px");
expect("gutter border-right 1px", /^1px solid/.test(source.guttersBorderRight));
expect("gutter bg is not CM default", !["rgb(245, 245, 245)", "rgb(51, 51, 56)"].includes(source.guttersBg));
console.log(JSON.stringify({ theme, preview, source, fails }, null, 2));
process.exit(fails.length ? 1 : 0);
