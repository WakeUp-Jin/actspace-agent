/**
 * 截取「真实界面」版要用的产品画面。
 *
 *   node scripts/capture-ui.mjs
 *
 * 画面来自桌面端 renderer 的浏览器 mock 模式（`?mock=promo-draft`、`?mock=promo-demo`）：界面是产品本身，
 * 数据是一条演示任务。脚本按片子里的顺序真的去输入、点击、悬停，每到一个状态截一张图，
 * 同时量出按钮和关键区域的位置写进 meta.json，片子里的指针和镜头都按它定位。
 *
 * 输出在 .cache/ui/，不进 Git；界面改版后重跑一次即可。
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchChrome } from "./lib/chrome.mjs";
import { ensureDesktopRenderer, packageRoot } from "./lib/servers.mjs";

/** 窗口的 CSS 尺寸。窗口越窄，界面在画面里越大；片子里还要再推近两倍多，所以按 3 倍像素密度截图。 */
const VIEW = { width: 1040, height: 680 };
const SCALE = 3;
/** 和 apps/desktop/src/renderer/mock/scenarios/promo-demo.ts 里的 TASK 是同一句话。 */
const TASK = "把登录页的表单校验补完，跑一下测试。";
const TYPE_STEP = 2;
/** 截图前把鼠标挪到窗口左上角的空白处，不触发任何悬停效果。 */
const REST = { x: 4, y: 4 };

const output = resolve(packageRoot, ".cache/ui");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const HELPERS = `window.__q = {
  has: (selector, text) => [...document.querySelectorAll(selector)].find((node) => node.textContent.includes(text)),
  is: (selector, text) => [...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === text),
  union: (...nodes) => {
    if (nodes.some((node) => !node)) return null;
    const boxes = nodes.map((node) => node.getBoundingClientRect());
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    return [left, top, Math.max(...boxes.map((box) => box.right)) - left, Math.max(...boxes.map((box) => box.bottom)) - top];
  },
}`;

const renderer = await ensureDesktopRenderer();
const chrome = await launchChrome(VIEW);
const rects = {};
const stills = [];

try {
  const page = await chrome.newPage({ deviceScaleFactor: SCALE });
  page.onConsole((type, text) => console.warn(`[界面 ${type}] ${text.slice(0, 200)}`));

  /** expression 的值可以是元素，也可以是 [x, y, 宽, 高]。 */
  const measure = (expression) =>
    page.evaluate(`(() => {
      const found = ${expression};
      if (!found) return null;
      if (Array.isArray(found)) return found;
      const box = found.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? [box.x, box.y, box.width, box.height] : null;
    })()`);

  async function waitFor(name, expression) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const box = await measure(expression);
      if (box) return box.map((value) => Math.round(value * 100) / 100);
      await sleep(100);
    }
    throw new Error(`界面里没有等到「${name}」。产品界面可能改版了，对照 scripts/capture-ui.mjs 里的选择器检查。`);
  }

  async function mark(name, expression) {
    rects[name] = await waitFor(name, expression);
  }

  async function open(query) {
    await page.goto(`${renderer.url}?${query}`);
    await page.evaluate(HELPERS);
  }

  const mouse = (type, { x, y }, extra = {}) => page.call("Input.dispatchMouseEvent", { type, x, y, ...extra });
  const centerOf = ([x, y, width, height]) => ({ x: x + width / 2, y: y + height / 2 });

  async function click(name) {
    const point = centerOf(rects[name]);
    await mouse("mouseMoved", point);
    await mouse("mousePressed", point, { button: "left", clickCount: 1 });
    await mouse("mouseReleased", point, { button: "left", clickCount: 1 });
  }

  async function shot(name) {
    // 入场过渡和淡入动画走完再截。
    await sleep(700);
    await writeFile(resolve(output, `${name}.png`), await page.screenshot());
    stills.push(name);
    console.log(`  ${name}.png`);
  }

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  console.log("新建会话，输入任务");
  await open("mock=promo-draft");
  await mark("newSession", `__q.has("button", "新建会话")`);
  await click("newSession");
  await mark("composer", `document.querySelector(".composer-wrap-initial .composer-panel")`);
  await mark("input", `document.querySelector("textarea.composer-input")`);
  await click("input");
  await mouse("mouseMoved", REST);
  const typing = [];
  for (let typed = 0; ; typed = Math.min(TASK.length, typed + TYPE_STEP)) {
    const name = `draft-${String(typing.length).padStart(2, "0")}`;
    await shot(name);
    typing.push({ still: name, chars: typed });
    if (typed === TASK.length) break;
    await page.call("Input.insertText", { text: TASK.slice(typed, typed + TYPE_STEP) });
  }
  await mark("send", `document.querySelector('button[aria-label="发送消息"]')`);

  console.log("Agent 动手，停在审批");
  await open("mock=promo-demo&trajectoryFixture=complete");
  await mark("approval", `document.querySelector(".approval-card")`);
  await mark("work", `__q.union(document.querySelector(".turn-prompt-card"), document.querySelector(".approval-card"))`);
  await mark("run", `__q.is(".approval-actions button", "运行")`);
  await mouse("mouseMoved", REST);
  await shot("approval");

  console.log("点「运行」，任务收尾");
  await click("run");
  await mark("result", `document.querySelector(".assistant-reply") && document.querySelector(".turn-usage-pill") && document.querySelector(".message-turn")`);
  await mark("fileRow", `document.querySelector('button[aria-label="查看 src/pages/Login.tsx 的改动"]')`);
  await mouse("mouseMoved", REST);
  await shot("result");

  console.log("悬停文件，看改动");
  await mouse("mouseMoved", centerOf(rects.fileRow));
  await mark("diff", `document.querySelector('[class*="act-z-popover"]')`);
  await shot("diff");
  await mouse("mouseMoved", REST);
  await sleep(500);

  console.log("打开面板，看上下文");
  await mark("panelButton", `document.querySelector('button[aria-label="打开面板"]')`);
  await click("panelButton");
  await mark("contextEntry", `__q.has("button", "上下文用了多少")`);
  await mouse("mouseMoved", REST);
  await shot("panel");
  await click("contextEntry");
  await mark("context", `__q.union(__q.is("*", "当前上下文"), __q.is("*", "费用")?.parentElement, document.querySelector('button[aria-label="关闭面板"]'))`);
  await mouse("mouseMoved", REST);
  await shot("context");

  console.log("打开执行轨迹");
  await mark("trajectoryButton", `document.querySelector('button[aria-label="查看执行轨迹"]')`);
  await click("trajectoryButton");
  await mark("trajectory", `document.querySelector(".tj-table") && document.querySelector(".tjv-root")`);
  await mark("failure", `document.querySelector(".tj-error")?.closest("tr")`);
  await mouse("mouseMoved", REST);
  await shot("trajectory");

  await writeFile(
    resolve(output, "meta.json"),
    `${JSON.stringify({ size: [VIEW.width, VIEW.height], scale: SCALE, task: TASK, typing, stills, rects }, null, 2)}\n`,
  );
  console.log(`已输出 ${stills.length} 张画面和 meta.json 到 ${output}`);
} finally {
  await chrome.close();
  await renderer.close();
}
