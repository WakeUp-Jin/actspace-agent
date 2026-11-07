# 架构优化（功能减法 + 插件结构） — 执行摘要

## 基本信息

- **关联计划**：[功能减法](../../exec-plans/completed/20261101-feature-subtraction/README.md)（P1–P5，P6 并入 S3）、[插件结构](../../exec-plans/completed/20261101-plugin-structure/README.md)（S1–S4）
- **设计**：[架构优化](../../design-docs/架构优化/README.md)：[01 功能减法设计](../../design-docs/架构优化/01-功能减法设计.md)、[02 插件结构设计](../../design-docs/架构优化/02-插件结构设计.md)
- **执行过程**：`execution-process.md`（原始记录已清理，见 git 历史）
- **执行模式**：交互，连续执行。子智能体按子计划实施，主智能体逐个读 diff、复跑测试、补修后在本地提交
- **执行结果**：完成。分支 `架构优化`，共 10 个本地提交（`18155df5` 文档，`281aa868`…`15ceb558` 九个子计划，另加本收尾提交），未推送、未合入 main

## 核心变更清单

| 子计划 | 提交 | 说明 |
|------|----------|------|
| P1 删除「转成可视化 HTML」 | `281aa868` | 删按钮、Reply 视图、生成逻辑和 IPC |
| P2 删除内置终端 | `e5a0f071` | 删 node-pty、xterm、终端标签和 IPC；`capabilities.terminal` 改名为 `workspacePanels` |
| P3 文件打开收敛 | `6306ccf5` | 只在应用内渲染 Markdown 和图片；HTML 用默认浏览器，其他用默认应用；打不开时显示兜底对话框 |
| P4 文档面板 | `bf38b69f` | 只列 `.md` / `.markdown` 的文档树取代工作区文件树；预览 / 源码切换，⌘S 保存；切换工作区不丢未保存草稿；标签改名「文档」「改动」 |
| P5 Git Review 只留查看 | `37457c0c` | 删暂存 / 还原、已查看、apply / PR / 初始化、提交对话框、「上一轮」、实时监听；+N/−M 在每轮结束、打开面板、手动刷新、顶部菜单提交后强制刷新 |
| S1 包搬家与改名 | `e9e41914` | 62 个包归入 23 个能力目录 `packages/<能力>/<包>`，改了 16 个包名；新建 `tool-subagent`、`skill` |
| S2 插件清单与展示信息 | `5c2fd300` | manifest 增加 `display`；`plugin-catalog.ts` 成为唯一登记处，`cordis.yml` 改为生成；五处重复登记改为从清单派生 |
| S3 插件开关与插件页 | `e3636cc8` | 新增 `tools.plugins` 设置；操控浏览器、英语学习默认关闭，关闭时不创建服务、不轮询；扩展页「能力」改为「插件」页（demo 方案 B） |
| S4 README 与文档 | `15ceb558` | `packages/README.md` 总地图、23 份能力目录 README、`check-package-readmes` 检查 |

运行时标识（Entry、plugin、service id，事件类型，Codec 名）全部没改，旧会话、Harness 代际记录和设置都不需要迁移。

## 人工验证指引

### 必须验证（Electron 实机）

1. **启动与旧数据**
   - 验证方式：用现有数据目录启动开发版，打开一个旧会话，新建会话发一条消息，让 Agent 运行一条 Bash。
   - 预期结果：都正常；Agent 工具列表里没有 `browser_*`。
2. **插件页与默认关闭**
   - 验证方式：打开 扩展 › 插件。
   - 预期结果：两组「全局插件」「会话插件」；英语学习、操控浏览器的开关都是关；「内置插件 N 个，不能关闭」默认收起，输入搜索词后展开。工具设置里没有浏览器组，常规设置里没有语音设置。
3. **打开操控浏览器**
   - 验证方式：打开开关，看提示，重启。
   - 预期结果：开关旁出现「重启后开启」；重启后行下出现连接面板，工具设置出现浏览器组，`browser_*` 工具回来，Chrome 扩展可以连接。
4. **打开、关闭英语学习**
   - 验证方式：打开开关并重启，选目标会话，提问、朗读；再关闭并重启。
   - 预期结果：选目标会话、双语回答、朗读和原来一致；关闭后语音设置消失，旧会话照常打开。
5. **常驻开销**
   - 验证方式：默认设置启动，等 60 秒，看 main 日志、`ps aux | grep abb`、数据目录下的 Native Host 清单。
   - 预期结果：没有浏览器状态轮询，没有 `abb` 进程，没有新写的清单。
6. **文档面板**
   - 验证方式：在本仓库会话里打开「文档」标签。
   - 预期结果：
     - 树只列 Markdown，绿点标出本会话改过的文档；
     - 预览 / 源码可以切换，⌘S 保存；
     - 未保存时关闭标签会询问；切到别的工作区再切回，草稿和未保存圆点都还在；
     - 窗口重新聚焦后，外部改过的文档出现「重新加载」；
     - 定位到文件、用默认应用打开都能用。
7. **文件打开**
   - 验证方式：从交付卡、聊天链接和读文件工具行分别点 `.md`、`.png`、`.html`、`.pdf`、`.ts`，再点一个没有关联应用的文件。
   - 预期结果：Markdown、图片在应用内打开；HTML 用默认浏览器；其他用默认应用；打不开时出现兜底对话框。
8. **「改动」面板**
   - 验证方式：让 Agent 改两个文件；打开「改动」面板；用顶部菜单提交；在外部改一个文件后点刷新；打开一个非 Git 目录。
   - 预期结果：
     - 本轮结束后输入框 +N/−M 更新，提交后归零；
     - 外部改动在点刷新后才出现；
     - diff 区没有暂存 / 还原 / 已查看，工具栏没有 git 菜单，范围菜单没有「上一轮」；
     - 非 Git 目录显示「当前目录不是 Git 仓库」。
9. **终端已移除**
   - 验证方式：右侧面板的「+」菜单、对象菜单。
   - 预期结果：没有「终端」和「可视化回复」。

### 建议验证

1. **完整打包**：跑 `scripts/release-package.sh`。本轮只验证了 `pnpm deploy`，没有出完整安装包。node-pty 移除和包目录调整都影响打包。
2. **合并前清本地链接**：合入 main 后，在主检出里先 `rm -rf node_modules/.pnpm/node_modules node_modules/.modules.yaml`，再 `pnpm install`。搬家后 pnpm 的隐式提升链接仍指向旧路径，Host 进程测试会失败。
3. **站点截图**：站点的 `file-preview.png` 还是旧文件树画面，需要在 Electron 里重拍。

## Agent 已完成的验证

收尾时在 `15ceb558` 上跑了一遍完整验证（`tmp/final-verify.sh`）：

- `pnpm install --offline`、`build:deps:dev`、CLI 构建：通过。
- 根 `pnpm test` 命令链里的 19 步逐个单独跑，除 `test:current-docs` 外全部通过。其中包括 `test:package-boundaries`、`test:plugin-catalog`、`test:package-readmes`、`test:contract-matrix`、`test:agent-host:process`、`test:harness-recovery`、`test:ipc-channels`。
- `pnpm -r --no-bail --if-present test`：所有包通过，desktop 2104 通过 / 7 跳过。
- `pnpm typecheck`、`check:packages`、`generate:plugin-loader --check`、`check:desktop-build-graph`、`check:frontend-tokens`、`check:frontend-theme`、`pnpm --filter @actspace/desktop build`：通过。
- `check:docs` / `check:current-docs` / `test:current-docs`：仍是开工前基线的 363 条失败，全部在 `docs/exec-runs/` 下，是没进 git 的截图和 `tmp/` 链接，没有新增。
- 浏览器 mock 截图：文档面板（浅色、深色、源码未保存），插件页（浅色、深色，与 demo 方案 B 对照）。

## 已知风险和遗留事项

- **Electron 真机验收**（2026-11-01，Codex 原生 Computer Use，gpt-6.1-sol high，隔离数据目录）：
  - 第一轮 26 项中 22 项通过。
  - 4 项失败中 3 项是真问题，已在 `9d17d84a` 修复：
    - 已打开的文档从聊天链接再打开时一直转圈；
    - 宽表格被挤成逐字竖排；
    - 非 Git 目录的「改动」面板显示「暂无变更」。
  - 另 1 项（开启浏览器插件后没有 `browser_*` 工具）是验收标准写错：工具要等 Chrome 扩展连上才注册，main 上一直如此。
  - 复验时 F1、R5 及两项回归检查都通过。
  - 复验中又发现，文件树展开时窄表格出现横向滚动，原因是表格原有的 `min-width: 420px`；已一并修复，用 headless Chromium 实测过。
  - 未覆盖：Chrome 扩展连接、英语朗读（没有 MiniMax 密钥）、从读文件工具行打开 HTML / TS。
- **根 `pnpm test` 在 `test:current-docs` 处停下**：363 条基线一失败，后面各包的测试就不跑。开发时要单独跑 `pnpm -r --no-bail --if-present test`。建议另立一项清理 `docs/exec-runs/` 的断链。
- **README 检查依赖构建产物**：类别核对读 runtime 的构建产物，CI 文档步骤不构建时会跳过这一项。能力目录 README 里“包之间怎么连”靠人工同步，脚本不核对依赖方向。
- **文档面板**：
  - 保存时不做冲突检测，这是规范要求；
  - 未保存草稿只存在内存里，重启应用后丢失；
  - 筛选状态下自动展开的文件夹不能手动收起。
- **其他**：
  - P5 的资源复测脚本已无法运行，没有重测；
  - 磁盘上旧的 `view-state.json`、`visualizations.json` 不读不删；
  - `docs/roadmap.md` 没改，已完成行格式受站点测试约束；
  - 站点「设置与数据」等页面里零散提到「能力」页的地方没改。

## 后续建议

- 用户做完上面的 Electron 检查后，决定是否推送 `架构优化` 并提 PR。
- 清理 `docs/exec-runs/` 的 363 条断链，让根 `pnpm test` 能完整跑完。
- [Chrome 扩展连接体验](../../exec-plans/completed/20260928-chrome-connect-experience.md)计划已暂停，是否删除由用户决定。
