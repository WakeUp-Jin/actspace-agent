# 09 输入框优化 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/09-输入框优化执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-09-composer/execution-process.md`
- **验收交接**：`docs/exec-runs/20261005-desktop-fe-09-composer/acceptance-handoff.md`（按 P1–P6 分节，各节有「请验收方执行」）
- **现行规范**：
  - `docs/design-docs/frontend/front-聊天输入框规范.md`
  - `docs/design-docs/frontend/front-workspace-git-worktree-context.md`
- **执行模式**：交互，连续执行
- **执行结果**：完成。T0–T30 全部完成，另有一个计划外修复提交（`447ef01a`，主题颜色白名单随 Thinking 开关移到 ModelPicker）。
  - 输入框按已确认的 demo 改造。
  - `Composer.tsx` 从 1810 行拆到 496 行。
  - 有两项需要你判断（见下），不阻塞。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 外观与布局（P1，T1–T8） | token、`Composer`、`ComposerInput` | 细边柔和阴影；单行胶囊 / 多行 18px；进入多行后只有清空才回单行；28px `+` 和发送按钮，按模式着色；模式 chip 只有 × 可点；定稿 placeholder；输入法组字时不接任何按键 |
| 发送队列托盘（P2，T9–T11） | `MessageQueueTray`、消息区规范 | 托盘移到输入框外面、紧贴上方；去掉标题行；暂停行在底部；「插入」改名「引导」 |
| `+` 统一面板与模型选择（P3，T12–T15） | `ComposerPalette`、`ModelPicker`、`ComposerOverlay` | 搜索 + 模式 / 附件 / Skills › / 模型 ›，键盘两级导航；模型菜单本机和远端共用，删除远端模型 select；浮层同一时间只开一个 |
| 运行位置（P4，T16–T19） | `RunLocationMenu`、`RunTargetRow`、`ComposerStatusRow`、readiness | 新建页三个文字按钮 + 通用菜单，远端机器子菜单；删掉远端的三个原生 select；对话中只读状态行；发送和停止的禁用及 tooltip 读 readiness |
| 规范与收尾（P5，T20–T24） | 两份前端规范、06、README、旧 demo | 按实施结果改写；旧 `message-queue-demo.html` 标为废弃 |
| Composer 拆分（P6，T25–T30） | `components/composer/` 下新增 14 个文件 | 拆出：<br>• `ComposerInput`、`ComposerAttachments`、`SlashMenu`、`ComposerToolbar`、`ReviewStrip`、`ComposerNotices`；<br>• `use-composer-keyboard` / `-skills` / `-model` / `-send` / `-draft` / `-overlay`；<br>• `composer-run-context`、`composer-types`。<br>Composer 只留根布局和浮层编排 |

## 偏差

- **T12–T14**：模型列表没有做成 `ModelPicker variant="page"`，而是把共用的纯函数（搜索、空状态、选项内容）抽出来，ModelPicker 和面板各自使用。面板里的模型选项是一页，不是贴行的二级浮层。其余 6 条细节偏离见执行记录 T12、T14。
- **T28**：计划写的 `SkillsPage.tsx` 没有拆。Skills 页在 T14 已经是面板里按数据生成的行，剩下的加载逻辑拆成了 `use-composer-skills`。
- **T30**：计划表之外又拆了 5 个文件（send / run-context / notices / draft / overlay）。只拆计划表里的三项，Composer 剩约 610 行，到不了 500。
- 发送按钮禁用时是 50% 透明度，计划写 30%（IconButton 统一 50%）。
- 面板外框用通用浮层的 `border-line`，不是输入框的边框色。

## 需要你判断

两项都在 `acceptance-handoff.md` P4「需要你判断的事项」，优缺点写在那里。

1. **新建 Chat 会话的运行目标行**：
   - A：现状，本机 Chat 不显示这一行。
   - B：Chat 只显示「运行位置」按钮。
   - C：和 Agent 一样显示三个按钮。
   - **建议 B**：现状下本机 Chat 不能在新建页切到远端。
2. **非 Git 仓库时的「新建工作树」**：
   - A：现状，禁用并写原因。
   - B：隐藏。
   - **建议 A**。

## 人工验证指引

### 必须验证

1. **单行 / 多行与中文输入法**（P1-1、P1-2）
   - 验证方式：在会话里打一段会折行的长文字，删到一个字，再删光；用中文输入法打字，候选词出现时按 Enter、↑↓、Esc、Shift+Tab。
   - 预期结果：
     - 删的过程中保持多行，删光后回到单行，光标不跳；
     - 组字时的按键只作用于输入法。
2. **`+` 面板与模型选择**（P3-1、P3-2）
   - 验证方式：点 `+`，用中文输入法搜「模型」，选一个模型；进入某个模型的选项，切 Thinking 和 Effort 后发送。
   - 预期结果：面板关闭，光标回到输入框；请求带上新选项。
3. **真实运行中的队列**（P2-1、P2-2）
   - 验证方式：长任务运行期间连发 5 条，对其中一条点「↳ 引导」，再「撤回」，然后「继续发送」。
   - 预期结果：托盘在输入框上方，露出 4 行；输入框不被推动。
4. **远端 Host**（P3-3、P4-1、P4-2）
   - 验证方式：新建页选一台远端 Host 和工作区并发送；运行中断开 Host。
   - 预期结果：
     - 状态行写「Host · 工作区」；
     - 断开后状态行显示离线，停止按钮禁用并说明原因。
5. **拆分后回归**（P6-1）
   - 验证方式：在 Electron 里依次试：粘贴图片、拖入文件、`/` 菜单、切换会话（草稿和附件各归各的会话）、发送失败后草稿回来。
   - 预期结果：和拆分前一致。

### 建议验证

1. **480px 窄窗**（P4-3）
   - 验证方式：依次打开三个菜单和远端机器子菜单。
   - 预期结果：都在窗口内。
2. **新建工作树**（P4-4）
   - 验证方式：在 Git 仓库里用「新建工作树」新建会话。
   - 预期结果：状态行显示「⑂ 分支 · ⑂ 工作树」。
3. **深色主题**（P1-3）
   - 验证方式：在深色主题下看 Plan / Chat 的 chip 和发送按钮。
   - 预期结果：都看得清。

## Agent 已完成的验证

- 命令：
  - typecheck 通过；renderer 全量 124 个文件，1061 条通过，1 条跳过；
  - `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过；
  - 原生按钮基线 230 → 229，之后只在文件之间搬，总数不变。
- 变异：每个 T 都改坏关键判断再跑用例。搬家前就没覆盖的分支都补了用例；P6 新增 4 个测试文件。
- 浏览器：vite + 无头 Chrome（mock），在浅色、深色、480px 下对照 demo，截图在 `screenshots/p1-*` 到 `p6-*`。
- 复核：每个阶段末派 Sonnet 子智能体只读复核，结论记在执行记录里。

## 已知风险和遗留事项

- 技术债（行为和改造前相同）：
  - Review 条的「…」没有点击行为；
  - 远端「发送中」状态不按会话区分；
  - 模型运行时选项不按会话区分；
  - 切走后发送失败时附件不回原会话。
- 窗口高度不到约 400px 时，`+` 面板翻到输入框下方会超出窗口。Electron 最小高度是 760，正常用不到。
- 远端模型按钮的禁用仍按 Host 连接状态，没有改读 readiness。

## 后续建议

- 拍板两项判断后，选 B 的改动在 `Composer.tsx` 的 `renderInitialContextRow` 里，只有一行。
- 上面四条技术债可以合成一个「Composer 草稿按会话隔离」的小计划。
