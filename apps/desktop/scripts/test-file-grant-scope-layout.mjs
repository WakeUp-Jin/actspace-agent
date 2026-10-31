/** Real layout regression for permission scopes; uses no application data or Provider. */
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const playwrightPath = process.env.ACTSPACE_PLAYWRIGHT_MODULE;
if (!playwrightPath) throw new Error("Set ACTSPACE_PLAYWRIGHT_MODULE to an installed playwright module.");
const { chromium } = await import(pathToFileURL(playwrightPath));
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = "/__grant-scope-layout.js";
const path = `/outside/${"long-unbroken-directory-name".repeat(8)}/read-tree/probe.txt`;
const exact = { suggestionId: "exact", access: "read", selector: { kind: "exact", canonicalPath: path } };
const subtree = { suggestionId: "subtree", access: "read", selector: { kind: "subtree", canonicalRoot: path.slice(0, path.lastIndexOf("/")) } };
const source = `
import React from "react";
import { createRoot } from "react-dom/client";
import { FileGrantScope } from "/src/renderer/components/messages/FileGrantScope.tsx";
import "/src/renderer/styles/index.css";
function Harness() {
  const [selected, choose] = React.useState(${JSON.stringify(exact)});
  return React.createElement("div", { style: { position: "absolute", right: 24, top: 80, display: "flex", gap: 8 } },
    React.createElement(FileGrantScope, { suggestions: ${JSON.stringify([exact, subtree])}, selectedId: selected.suggestionId, disabled: false, onChoose: choose }),
    React.createElement("output", { "aria-label": "选择结果", style: { position: "fixed", top: 20, left: 20 } }, selected.suggestionId));
}
createRoot(document.getElementById("root")).render(React.createElement(Harness));`;
const server = await createServer({
  root: desktop, configFile: resolve(desktop, "vite.config.mts"),
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  plugins: [{
    name: "grant-scope-layout-fixture",
    resolveId(id) { if (id === entry) return entry; },
    load(id) { if (id === entry) return source; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== "/__grant-scope-layout") return next();
        try {
          const html = await vite.transformIndexHtml(req.url, `<div id="root"></div><script type="module" src="${entry}"></script>`);
          res.setHeader("Content-Type", "text/html"); res.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const width of [480, 1280]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__grant-scope-layout`);
    await page.locator("html").evaluate((html, theme) => { html.dataset.theme = theme; }, theme);
    await page.getByRole("button", { name: "授权范围", exact: true }).click();
    const trigger = page.getByRole("combobox", { name: "本会话文件授权范围" });
    await trigger.click();
    const list = page.getByRole("listbox");
    await list.waitFor();
    const layout = await list.evaluate(list => {
      const rect = list.getBoundingClientRect();
      const options = [...list.querySelectorAll('[role="option"]')].map(option => {
        const range = document.createRange(); range.selectNodeContents(option);
        return { text: option.textContent, rects: [...range.getClientRects()].filter(r => r.width > 0).map(r => ({ left: r.left, right: r.right })) };
      });
      return { left: rect.left, right: rect.right, viewport: innerWidth, options };
    });
    assert.equal(layout.options.length, 2);
    assert.ok(layout.options.every(option => option.text.includes("本会话") && option.text.includes("read-tree")));
    assert.ok(layout.left >= 0 && layout.right <= layout.viewport, `${width}/${theme}: popup outside viewport: ${JSON.stringify(layout)}`);
    for (const option of layout.options) for (const rect of option.rects) {
      assert.ok(rect.left >= layout.left && rect.right <= layout.right, `${width}/${theme}: clipped scope label: ${JSON.stringify(layout)}`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "combobox");
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
    await page.keyboard.press("ArrowDown");
    await page.getByRole("option").nth(1).evaluate(el => new Promise(resolve => {
      const check = () => el === document.activeElement ? resolve() : requestAnimationFrame(check); check();
    }));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[aria-label="选择结果"]')?.textContent === "subtree");
    assert.equal(await page.getByLabel("选择结果").textContent(), "subtree");
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "combobox");
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    console.log(`PASS ${width}/${theme}: full scope labels fit; keyboard selection and focus return`);
    await page.close();
  }
} finally {
  await browser?.close(); await server.close();
}
