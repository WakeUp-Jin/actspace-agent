/** Real Chromium layout regression; no IPC, application data, or Provider. */
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const playwrightPath = process.env.ACTSPACE_PLAYWRIGHT_MODULE;
if (!playwrightPath) throw new Error("Set ACTSPACE_PLAYWRIGHT_MODULE to an installed playwright module.");
const { chromium } = await import(pathToFileURL(playwrightPath));
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = "/__composer-palette-layout.js";
const source = `
import React from "react";
import { createRoot } from "react-dom/client";
import { ComposerPalette } from "/src/renderer/components/composer/ComposerPalette.tsx";
import { TooltipProvider } from "/src/renderer/components/ui/Tooltip.tsx";
import "/src/renderer/styles/index.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme");
const geometry = JSON.parse(params.get("geometry"));
const items = Array.from({ length: 38 }, (_, index) => {
  const name = "geometry-skill-" + String(index + 1).padStart(2, "0");
  return { name, description: "Harmless layout fixture", scope: "project", source: "project",
    location: "/fixture/" + name, directory: "/fixture/" + name,
    status: "available", removable: true, enabledForAgent: true, shadowed: false };
});
function Harness() {
  const [open, setOpen] = React.useState(false);
  const input = React.useRef(null);
  return React.createElement(ComposerPalette, {
    open, onOpenChange: setOpen, onReturnFocus: () => input.current.focus(),
    mode: "agent", sessionStarted: false, modeDisabled: false, onSelectMode: () => {},
    attachment: { label: "图片", icon: "images", onSelect: () => {} },
    skills: { items, loading: false, error: null, selected: [], onToggle: () => {}, onRetry: () => {} }
  }, React.createElement("div", { style: { position: "fixed", top: geometry.top, left: 24,
    width: Math.min(700, innerWidth - 48), height: geometry.height } },
    React.createElement("textarea", { ref: input, "aria-label": "消息输入框" }),
    React.createElement("button", { type: "button", onClick: () => setOpen(!open) }, "加号")));
}
createRoot(document.getElementById("root")).render(React.createElement(TooltipProvider, null, React.createElement(Harness)));`;
const server = await createServer({
  root: desktop, configFile: resolve(desktop, "vite.config.mts"),
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  plugins: [{
    name: "composer-palette-layout-fixture",
    resolveId(id) { if (id === entry) return entry; },
    load(id) { if (id === entry) return source; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url.split("?")[0] !== "/__composer-palette-layout") return next();
        try {
          const html = await vite.transformIndexHtml(req.url, `<div id="root"></div><script type="module" src="${entry}"></script>`);
          res.setHeader("Content-Type", "text/html"); res.end(html);
        } catch (error) { next(error); }
      });
    },
  }],
});
const cases = [
  // Actual native PG4 anchor geometry; neither side fits the natural 322px card.
  { name: "multiline-minimum", height: 760, top: 279, anchorHeight: 258, side: "top", scroll: true },
  { name: "empty-minimum", height: 760, top: 352, anchorHeight: 112, side: "top", scroll: true },
  // Component geometry with room below only; not a claim about a native route.
  { name: "room-below", height: 900, top: 100, anchorHeight: 112, side: "bottom", scroll: true },
];
async function geometry(page) {
  return page.locator(".composer-palette").evaluate(card => {
    const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
    const list = card.querySelector('[role="listbox"]');
    const search = card.querySelector('[role="combobox"]');
    const active = document.getElementById(search.getAttribute("aria-activedescendant"));
    return { card: rect(card), search: rect(search), list: rect(list), active: active && rect(active),
      side: card.dataset.side, clientHeight: list.clientHeight, scrollHeight: list.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight } };
  });
}
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const scenario of cases) for (const width of [480, 1440]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: scenario.height } });
    const params = new URLSearchParams({ theme, geometry: JSON.stringify({ top: scenario.top, height: scenario.anchorHeight }) });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__composer-palette-layout?${params}`);
    await page.getByRole("button", { name: "加号", exact: true }).click();
    await page.getByRole("option", { name: "Skills", exact: true }).click();
    const search = page.getByRole("combobox", { name: "搜索 Skills", exact: true });
    await search.waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".composer-palette")).opacity === "1");
    const before = await geometry(page);
    const label = `${scenario.name}/${width}/${theme}`;
    assert.ok(before.card.top >= 7.5 && before.card.bottom <= scenario.height - 7.5,
      `${label}: card outside collision boundary: ${JSON.stringify(before)}`);
    assert.ok(before.card.left >= 7.5 && before.card.right <= width - 7.5, `${label}: horizontal overflow`);
    assert.ok(before.search.top >= before.card.top && before.search.bottom <= before.card.bottom, `${label}: search clipped`);
    assert.equal(before.side, scenario.side, `${label}: unexpected placement`);
    assert.equal(await page.getByRole("option").count(), 38);
    assert.ok(before.scrollHeight > before.clientHeight, `${label}: list must scroll internally`);
    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(() => {
      const input = document.querySelector('[role="combobox"]');
      const active = document.getElementById(input.getAttribute("aria-activedescendant"));
      const list = document.querySelector('[role="listbox"]');
      const a = active.getBoundingClientRect(), b = list.getBoundingClientRect();
      return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && active.textContent.includes("geometry-skill-38");
    });
    await search.fill("geometry-skill-38");
    assert.equal(await page.getByRole("option").count(), 1);
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await page.getByRole("listbox", { name: "添加上下文或工具", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".composer-palette") && document.activeElement?.getAttribute("aria-label") === "消息输入框");
    console.log(`PASS ${label}: visible card/search, scroll/active row, filter/back/Esc focus; height=${before.card.height}`);
    await page.close();
  }
} finally {
  await browser?.close(); await server.close();
}
