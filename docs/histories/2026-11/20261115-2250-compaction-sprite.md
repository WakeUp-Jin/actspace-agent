## [2026-11-15 22:50] | Task: 压缩分隔线加像素精灵（推到墙角）

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI，worktree feat/compaction-sprite`

### 📥 User Query

> 优化压缩样式，加深「精灵感」：压缩时像像素游戏那样有个小东西往里推，但要注意力度，不能花里胡哨。先做 demo。

经过三轮 demo，用户选定「乙 · 逐格」：整条分隔线是一根像素消息条，品牌紫精灵从右往左把它一格一格推进墙角，越推越短；不要连续滑动版（「跟进度条似的」）。品牌紫、320ms 节奏、失败瘫倒、历史会话只显示文字。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer）、`docs/design-docs/frontend`

**Key Actions:**

- **像素舞台**：新增 `CompactionSprite.tsx`（舞台，挂载 / 宽度变化时建一次 SVG，320ms 一拍只改变化的属性，窗口隐藏跳过绘制，减少动态效果只画一帧）和 `compaction-sprite-model.ts`（帧、消息块、挤压排布、按已用时间的闭式条长、收尾步进）。
- **CompactCommandBlock**：running / failed 改为「舞台 + 右侧文字」；同一块在屏上 running→completed 时先播约 1 秒收尾，再换成完成行；完成行图标换成像素方块；去掉转圈和两侧扫光。
- **token**：新增 `sprite` / `sprite-eye`（浅 `#a397d4` / `#20201e`，深 `#b9aef0` / `#181916`），三处主题块都定义；`base.css` 用它们给舞台上色，failed 覆盖为 `on-danger`。
- **mock**：`?mock=compaction` 增加「压缩后完成」会话（打开约 8 秒后完成），用于看收尾。
- **规范**：`front-轮尾与导航规范.md` 压缩分隔线一节重写 running / 收尾 / failed / 性能约束；`front-视觉token规范.md` 加 Sprite 职责、色板两行、§10 像素动画保持逐拍；`FRONTEND_VERIFICATION.md` 更新场景表。
- **demo**：`docs/design-docs/frontend/compaction-sprite-demo.html`（选定版与连续滑动对照）。

### 🧠 Design Intent (Why)

ActSpace 的 Actor 形象是「专业又亲近的精灵」，压缩是 Agent 自己在整理记忆，最适合让精灵露一下面。用户要的是像素游戏那种「一挤、一动、一压」的逐格手感，连续补间会退化成普通进度条，所以节奏保持逐拍。压缩没有真实进度，条长用「每两拍最多短 1 格 + e^(-t/12s) 下限」的闭式公式：前面推得快、后面推不动，完成前不会推到墙，切回会话或改窗宽都能直接算到当前位置，每拍工作量和已用时间无关。

实测（真实 Chrome，demo 单行 15 秒）：现行 A1 转圈 + 扫光约 7.3% 浏览器 CPU，逐格 JS 版约 3.7%；产品实现每拍只改几个属性，不重建 SVG、不走 React 渲染。

### Unverified & Leftovers（未验证与遗留）

- **已验证（浏览器 mock，Sonnet 子 Agent）**：浅 / 深 / 480px 下进行中、收尾、失败、历史四态通过，无控制台错误；进行中每秒主线程任务约 4.6ms（脚本 0.8ms）。验收发现挤紧段连成一整条粗线、失败态多出孤立尘点，已改为相邻块深浅交替、失败不画点线与尘点。
- **未验证**：Electron 里看手动 `/compact`、自动压缩、收尾动画和失败重试；资源监控里看压缩期间的 CPU。收尾前半段（条压成方块）只确认了终态，没有逐帧确认。
- **遗留**：无。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/messages/CompactionSprite.tsx`
- `apps/desktop/src/renderer/components/messages/compaction-sprite-model.ts`
- `apps/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`
- `apps/desktop/src/renderer/styles/tokens.css`
- `apps/desktop/src/renderer/styles/tailwind.css`
- `apps/desktop/src/renderer/styles/base.css`
- `apps/desktop/src/renderer/mock/scenarios/compaction.ts`
- `apps/desktop/src/renderer/test/compact-command-block.test.tsx`
- `apps/desktop/src/renderer/test/compaction-sprite-model.test.ts`
- `docs/design-docs/frontend/front-轮尾与导航规范.md`
- `docs/design-docs/frontend/front-视觉token规范.md`
- `docs/design-docs/frontend/compaction-sprite-demo.html`
- `docs/FRONTEND_VERIFICATION.md`
