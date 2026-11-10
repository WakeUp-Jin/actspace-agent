## [2026-11-09 15:40] | Task: 产出官网 V6 视觉方向候选原型

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 官网的核心是表达出「Space」这个东西，所以样式很重要，代码实现不太在意。两种方案都看看：1. 把现在的官网做得更精细化，比如首页显示得更真实一点；2. 给大概 4~5 版新的样式设计方向。不用问我想要什么，做出来看。

### 🛠 Changes Overview

**Scope:** `docs/design-docs/site-v6/`（新增）、`docs/design-docs/index.md`

**Key Actions:**

- **新增六个独立 HTML 原型** `docs/design-docs/site-v6/demos/`：
  - `0-v4-refined`：保留 V4 token，首屏换成真实 macOS 窗口 + 真实 Space 截图，Actor 名册卡浮在窗口外，插件开关退成能力条。
  - `1-starchart` 星图（深色轨道图）、`2-atlas` 博物志（天文图版）、`3-console` 控制台（空间站平面图）、`4-habitat` 栖息地（色块 + 精灵）、`5-whitespace` 留白（排版 + 一张图）。
- **抠出透明 Actor 精灵** `demos/assets/sprite-01..08.png`，从博客封面角色图的纯色底抠出，供原型在任意底色上使用。
- **截图** `shots/`：每个方向 1440 首屏、1440 全页、390 移动端，外加 `overview.png` 六图拼合。
- **README** 对比六个方向：概念、空间如何被表达、字体与底色、优缺点、落地时在 `apps/site` 要改什么，以及选型建议。
- 在 `docs/design-docs/index.md` 的官网条目下链接到 `site-v6/README.md`，并标明「候选 / 未定稿」。

### 🧠 Design Intent (Why)

V4 首页用手绘窗口和十个插件开关讲「能力」，没有讲出「空间」：看不到 Actor 是谁、谁在干活、谁在等我。这一轮不改 `apps/site`，先用可直接打开的原型把「空间」的几种视觉表达摆出来让人挑；沿用 V5 时期「先 demos 后实现、实现后删 demos」的流程。所有原型都用真实截图替代手绘窗口，是方向 0 的核心，也是其余五个方向的共同约定。

### 📁 Files Modified

- `docs/design-docs/site-v6/README.md`
- `docs/design-docs/site-v6/demos/0-v4-refined.html`
- `docs/design-docs/site-v6/demos/1-starchart.html`
- `docs/design-docs/site-v6/demos/2-atlas.html`
- `docs/design-docs/site-v6/demos/3-console.html`
- `docs/design-docs/site-v6/demos/4-habitat.html`
- `docs/design-docs/site-v6/demos/5-whitespace.html`
- `docs/design-docs/site-v6/demos/assets/sprite-01..08.png`
- `docs/design-docs/site-v6/shots/*.png`
- `docs/design-docs/index.md`
