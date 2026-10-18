# 官网 V4：运行空间叙事与纸本插件舞台 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261017-site-v4-redesign.md`
- **执行模式**：交互
- **开始时间**：2026-10-17 10:20
- **结束时间**：2026-10-17 11:35

## 执行时间线

### 步骤 1：T1 Token 与字体、T2 页头页脚

- **操作**：重写 `tokens.css`（画布、纸面、状态色、舞台色场、`--site-page` 1360px、系统衬线标题栈）；`global.css` 删除旧首页 `.hero*`、`.section-intro`、`.cta*` 等，页头 64px、按钮悬停转紫；页脚加博客链接和新文案。
- **影响文件**：`tokens.css`、`global.css`、`SiteFooter.astro`。
- **决定**：标题不加载 Web 字体，用 Charter + Songti SC，避免国内加载阻塞。

### 步骤 2：T6 全站统一（子 Agent 并行）

- **操作**：子 Agent 只改文档、博客、更新日志、开发计划、404 的视觉，不碰首页、token、页头页脚。
- **影响文件**：`DocsLayout.astro`、`prose.css`、`blog.css`、`editorial.css`、`roadmap.astro`、`404.astro`、`global.css` 中 `.release-*` 两条规则。
- **验证**：博客勾选分类 11 → 1 张、排序首篇变化、列表视图切换正常；390 宽文档目录展开正常；五类页面 390 宽无横向滚动。

### 步骤 3：T3–T5 首页

- **操作**：数据 `home-features.ts`；组件 `Hero`、`TodaySection`、`DirectionStrip`、`ContextBlock`、`HarnessBlock`、`SpaceBlock`、`ClosingSection`；脚本 `home-stage.ts`（插件舞台、时钟、可见时播放）、`home-context.ts`、`home-loop.ts`；样式 `home.css`；重写 `index.astro`；删除 showcase 旧件。
- **决定**：Harness / Space 用 `data-loop` 声明步骤、CSS 按 `data-p` 定义状态，比每块写一份脚本更省；Space 的 Actor 用汉字圆点，不用精灵。
- **验证**：`check` 0 错误、`test` 23 通过、`build` 45 页；`grep FeatureShowcase|showcase apps/site/src` 为空。

### 步骤 4：截图验收与修正

- **操作**：1440×900、1100×800、390×844 整页与分时截图；插件开关与 reduced-motion 检查。
- **修正**：终端叠层在 1440 宽遮住用户消息、在 1100 宽遮住「子 Agent」插件，分别下移到舞台右下；上下文面板空白过多，内容区高度 290 → 266px；手机上 Harness「接受 v2」按钮折行、Space 窗口留白，补 `nowrap`、取消最小高度并隐藏输入框提示。
- **验证**：关掉「编辑」后计数 7 → 5、diff 不出现、收尾文案变为「编辑已关闭」；reduced-motion 0.5 秒内显示终态；三个宽度 `scrollWidth == innerWidth`。

### 步骤 5：T7 文档同步

- **操作**：`what-is-actspace.md` 新增「产品理念」（锚点 `#产品理念` 已核对）；`DESIGN.md` 重写为 V4；`SCREENSHOTS.md` 去首页段；登记计划、写 history。

## 验收后追加（T8）

- 用户认可阶段 A，要求补回真实截图、统一文档 / 博客 / 更新日志的图片风格、修复页头 Logo 白框，并删除 V3 计划。本轮由主会话直接执行，没有派子 Agent。
- 挑图：从 12 张首页素材和 19 张文档素材里选 Review 全景、上下文弹层、审批卡片；`context-and-approval`、`subagent-running`、`trajectory-inspector` 露出本机路径或私人会话名，不上首页。
- `docs/context-popup.png` 顶部露出上一条消息的残字，用第一行像素覆盖抹平。
- 验证：check 0 错误；test 23/23；build 45 页；1440 / 1100 / 390 截图无横向滚动；点击放大打开原图 PNG；页头 Logo 在 DPR 3 下背景透明。

## 遇到的问题

- **问题**：并行开三个无头标签页截分时帧时，上下文面板一直停在第一步。
  - **原因**：后台标签页 `document.hidden` 为真，演示按设计停表。
  - **应对**：改为逐个标签页截图，演示正常推进。这也说明「切到后台停表」逻辑生效。

- **问题**：test 有 3 项失败，`what-is-actspace.md` 链到 `/roadmap/` 被判为未知文档。
  - **原因**：文档链接测试只把 `/docs/*` 当作合法路由。
  - **应对**：测试补上 `/roadmap/`、`/updates/`、`/blog/` 等站内页面。
- **问题**：页头 Logo 出现白框。
  - **原因**：源文件早已是透明 PNG，但开发服务器 `_image` 地址按文件路径生成，并带一年缓存，浏览器一直用旧图。
  - **应对**：Logo 改名为 `actspace-mark.png`，让地址变化；正式构建本来就用内容哈希文件名，不受影响。

## 跳过或推迟的事项

- 文档正文重写、截图裁切与标注：属于阶段 B，A 验收后另立计划。
- 开发计划页的条目数据没有「Harness 自进化」「Actor 与 Space」，属内容更新，待用户确认措辞。

## 第二轮验收（T9）

- 用户否决「实拍」区。删除 RealShots 与旧重绘演示，新建 `FeatureShot` 聚焦块；截图用桌面端渲染进程的浏览器 mock（`?mock=turn-deliverables` / `long-session` / `approval-prefix`，Space 演示从侧栏进入），CDP 设视口与 DPR，sharp 裁切。
- **问题**：消息队列画面拍不出来。**原因**：mock 发送直接走流式回复，不进队列。**应对**：放弃该块。
- **问题**：Space 在 1060 宽下点不到。**原因**：窄视口侧栏自动隐藏。**应对**：先点「会话侧栏」按钮展开，点完再收起。
- **问题**：上下文面板统计格被挤扁、面板太窄。**原因**：视口矮、右栏默认 390。**应对**：localStorage 把右栏设为 440，视口 1440×1400，只裁面板列。
- **问题**：聚焦第三点放大到 2.25 倍，字过大，用量胶囊不在图里；标签压住上方文字。**原因**：放大上限过高；截图裁到用量胶囊之前；区域坐标按旧裁切量的。**应对**：上限降到 1.7；重裁截图包含用量胶囊并重新量区域；框和标签放进画布、反向抵消缩放。
- **问题**：审批截图全貌字太小。**原因**：1000 宽截图缩到约 0.7 倍显示。**应对**：改用 760 宽重拍，加 `natural` 按原图比例显示。
- 开发计划、文档补充与小问题按 T9 清单完成。
- 验证：check 0 错误；test 23/23；build 46 页；首页五个聚焦块在 1440 下逐点截图核对，1100 / 390 无横向滚动；开发计划、Harness 文档、上下文文档在 390 下无横向滚动。
