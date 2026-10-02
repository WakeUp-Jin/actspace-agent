# PA2 真实 Electron Computer Use 验收

日期：2026-10-01。状态：主要流程通过，边界项部分未覆盖，尚未完整签收。

本轮未观察到新的阻塞缺陷；真实窗口缩窄后白屏未复现。「部分通过」表示已列出的子项通过，同一验收点仍有未覆盖子项，不表示失败。自动化与实机结果分别记录，不互相替代。

## 环境与边界

- 使用 `pnpm dev:log` 启动的原生应用 `Actspace Dev actspace-agent-2067`，Electron 39.8.10；通过 Computer Use 原生应用接口操作窗口、键盘、鼠标及滚动。
- 本轮用户明确要求真实 Electron，浏览器 fixture 的结果不计入实机通过项。
- 使用专用 Agent/Chat 验收会话和公开合成 Markdown 样例；界面模型为 DeepSeek Flash，Agent 未调用工具。本轮不构成 OpenRouter 修复验收。
- 基线包含 main `6a1fd8b`、未提交的 Composer 窄窗测量修复和其他并行改动；结果属于实际运行工作区，不是纯提交快照。
- 依据：[PA2 计划](../../../exec-plans/active/20260928-composer-mentions-annotations/pa2-annotation-interaction-redesign.md)、[步骤 7](../execution-process.md)、[设计文档](../../../design-docs/frontend/front-composer-file-mentions-and-response-annotations.md)、[demo](../assets/pa2-annotation-demo.html)。原 `pa2-screenshots/` 的 13 张 fixture 图仅作视觉对照。

## 验收点与逐项结果

验收点定义覆盖范围；下方分组仅用于复用操作路线。

| 编号 | 范围与预期 | 实机结果 | 证据及未覆盖部分 |
|---|---|---|---|
| A1 | 松手/键盘扩选后菜单出现，锚在末尾；拖选中隐藏；Escape/滚动/清空选区关闭；边界翻转 | **部分通过**：段落松手后出现「添加到对话」，Shift+Left 扩选后可用，Escape、滚动、清空选区后关闭 | 中间状态现场观察。未保留鼠标按住期间观察，未实测垂直边界翻转；终态不能证明这两项 |
| A2 | 段落、标题、列表、引用、表格、行内格式、同回复跨段可引用；代码块/工具/跨回复/临时流式/超长选区拒绝 | **部分通过**：Agent 段落、Chat 标题到跨段/列表/引用组合选区、表格单元格可添加；卡片文本正确；代码块和跨两条回复选区无菜单 | [样例](12-electron-chat-sample.jpg)、[表格](13-electron-chat-renumber.jpg)。工具、临时流式和选区长度上限未实测 |
| A3 | 添加后清原生选区，蓝高亮、编号、评论框、Composer 数量同步 | **通过**：四处同步，评论获得焦点；发送/清空后草稿标记消失 | [初次添加](02-electron-comment.png)、[深色草稿](07-electron-dark-draft.jpg)、[表格草稿](13-electron-chat-renumber.jpg) |
| A4 | Enter/✓/外部点击保存；Shift+Enter 换行；IME 不提交；Escape 不改；2000 码点上限不截断；Enter/✓ 后回 Composer | **部分通过**：换行、三种保存、Escape 和重开值正确，Enter/✓ 后焦点回 Composer。2001 汉字禁用；1999 汉字 + 一个 emoji（2000 码点）启用，再加一个 emoji 禁用并提示，输入未截断 | [两行评论](02-electron-comment.png)、[Unicode 超限 AX](22-comment-unicode-ax.txt)。真实 IME 候选/组合态未验，粘贴 Unicode 不等同于 IME |
| A5 | 编号匹配卡片；标记/铅笔重开；重叠错开；滚动/resize 跟随；离屏隐藏回屏恢复 | **部分通过**：删除后连续编号，标记/编辑可重开，同末尾标记向右错开；resize 时评论框跟随不越界；原文离屏后标记不可见，回屏恢复 | [离屏](17-electron-marker-offscreen.jpg)、[回屏](18-electron-marker-return.jpg)、[重叠](19-electron-overlap.jpg)、[窄窗评论](09-electron-compact-comment.jpg)。评论框本身滚动隐藏/恢复未独立留证 |
| A6 | 胶囊悬停/聚焦出卡片；原文/可选评论；编辑/删除；条目加深；Tab 入卡片、Escape 回胶囊 | **部分通过**：原文/评论正确，无评论时省略该行；编辑/删除正常；Tab 到编辑按钮、Escape 关闭后回胶囊在 AX 中确认 | [草稿卡片](13-electron-chat-renumber.jpg)。条目悬停加深/离开恢复颜色未独立对照；公共组件只验代表位置 |
| A7 | 同范围去重；删除重排；× 清空；最多 20 条，拒绝 21 并提示 | **通过**：重复同范围仍 1 条；删第一条后余项变 1；清空移除胶囊/标记；20 条可用，21 不增数量并显示「最多引用 20 段回复」 | [重排](13-electron-chat-renumber.jpg)、[20 条](20-electron-limit-20.jpg)、[拒绝 21](21-electron-limit-rejected.jpg)、[清理后](23-electron-clean-final.jpg) |
| A8 | 仅批注、正文 + 批注均可发送；提交成功清草稿 | **通过**：Agent 仅批注发送得到针对引用的回复；Chat 长正文 + 表格引用，模型答「表格批注」；两次提交均清胶囊/持久高亮/编号 | [Agent 发送](04-electron-sent.jpg)、[Chat 提交](15-electron-chat-sent.jpg)、[模型结果](16-electron-chat-result.jpg)；Journal 见下 |
| A9 | 已发送胶囊在普通/sticky 用户消息上方，只读；悬停临时高亮；点击/Enter/Space 定位并约 1.6 秒加深 | **部分通过**：卡片原文/评论/定位入口正确，无编辑删除；鼠标定位出现临时加深，无持久编号；键盘可聚焦定位条目 | [定位](05-electron-locate.jpg)、[只读卡片](16-electron-chat-result.jpg)。Enter/Space 激活、精确时长、悬停离开恢复、运行中 sticky 布局未独立验证 |
| A10 | 未加载/不匹配显示不可用并禁用；唯一上下文回退，歧义拒绝 | **未覆盖**：正常可定位历史已验，未真实制造不可用/唯一回退/歧义 | 当前合成会话无这些状态；未改写真实 Journal 或配置伪造验收。自动化另计 |
| A11 | 会话草稿隔离；拒绝/异常发送恢复正文、评论、引用；重启后已发送可用 | **部分通过**：其他新会话无草稿，切回数量/标记/评论恢复；退出后重启 `pnpm dev:log`，专用会话已发送卡片原文/评论正确，定位入口可用 | [重启后](11-electron-restarted.jpg)。真实 main 拒绝/提交异常恢复未验，提交后模型失败不等同于提交前拒绝 |
| A12 | 真实 Agent/Chat 模型收到引用；Journal 为 response-excerpt + 偏移/前后文，不复制整条回复 | **通过（界面 + 运行时）**：两种模式实际模型针对引用作答，只读检查专用 Journal 的内容块/范围信息正确 | [模型结果](16-electron-chat-result.jpg)，下方具体事件。Journal 检查不是 Computer Use |
| A13 | 浅/深/系统主题，信息蓝独立强调色，主要状态符合 demo | **部分通过**：系统设置下实际浅色、显式深色已看；深色 + 橙强调色时发送按钮橙色，批注仍蓝色；主要结构/中文文案一致；结束恢复系统/默认强调色 | [深色历史](06-electron-dark-history.jpg)、[蓝批注/橙按钮](07-electron-dark-draft.jpg)、[系统浅色](14-electron-chat-narrow.jpg)。OS 自动主题翻转、全部主题 × 状态/Tooltip 未穷举 |
| A14 | 真实宽/窄窗跨 600px；有/无批注、长/短/空正文、Agent/Chat Context；无白屏、内容/焦点/浮层稳定 | **通过（所列代表场景）**：原生拖动到约 591pt、最小约 480pt，再恢复宽窗；上述 Agent/Chat 与草稿状态均操作，内容不消失，评论/焦点保留，Chat Context 无溢出，白屏未复现 | [Agent 窄窗](08-electron-narrow-draft.jpg)、[最小宽度评论](09-electron-compact-comment.jpg)、[Chat 窄窗](14-electron-chat-narrow.jpg)、[恢复宽窗](23-electron-clean-final.jpg)。逻辑宽度按 2× Retina 图估算，不代表所有模式尺寸逐一验证 |

## 实际操作分组

| 分组 | 场景与连续操作 | 覆盖点 | 证据 |
|---|---|---|---|
| G1 Agent 草稿编辑 | 专用 Markdown → 拖选/键盘扩选 → 添加 → 两行评论/取消/重开/保存 → 卡片键盘焦点 | A1–A6 | 02；中间 AX |
| G2 Agent 发送、主题与尺寸 | 仅批注发送 → 只读/定位 → 深色/橙强调色 → 新草稿长短空正文 → 窄窗/恢复 → 会话隔离 → 重启查历史 | A3–A6、A8–A9、A11–A14 | 04–09、11；Journal |
| G3 Chat 富文本与发送 | 新 Chat Markdown → 标题/跨段/列表/引用 → 表格 → 去重/删除 → 代码/跨回复拒绝 → 窄窗长正文 + 引用发送 → 模型/只读卡片 | A1–A3、A6–A9、A12–A14 | 12–16；Journal |
| G4 定位与上限 | 复用 Chat → 离屏/回屏 → 重叠 → 清空 → 20/21 条 → Unicode 评论边界 | A4–A7 | 17–22 |
| G5 清理与记录 | 清验收草稿、恢复宽窗/系统主题/默认强调色 → 空 Composer → 定向测试/归档 | A7、A13–A14；自动化独立列出 | 23、测试输出 |

## 运行时证据（只读）

Journal 位于本地 `~/Library/Application Support/ActSpace/sessions-v2/<sessionId>/journal.jsonl`。只检查本轮公开合成样例，不输出凭据或其他会话内容。

- Agent 会话 `50268287-ef4a-4473-95d0-9aa5c8c1186b`：seq 208 入队、209 claim，用户内容仅一个 `response-excerpt`。`assistantMessageId: v2-205`，`selectedText: 第一段：窗口缩窄时，回复批注应保持稳定。`，偏移 5–25，带有限 prefix/suffix 和要求一句话复述的 comment。模型回复「这段引用说的是：窗口变窄时，回复批注的显示仍会保持稳定。」
- Chat 会话 `47eedeeb-9903-4fad-b515-f45b2bddd243`：seq 117 claim，用户内容为正文 `text` + 一个 `response-excerpt`。`assistantMessageId: v2-113`，`selectedText: 表格批注`，偏移 102–106，带有限 prefix/suffix 与 `comment: 表格评论。`。模型回复「表格批注」。
- 这证明选段按契约持久化并被真实链路理解，不能推定所有供应商已验。

## 自动化补充（不能代替实机）

2026-10-01 20:15 执行，**6 个文件、104 项全部通过**：

```sh
pnpm --filter @actspace/desktop exec vitest run \
  src/renderer/test/response-annotation-markers.test.tsx \
  src/renderer/test/response-annotation-state.test.tsx \
  src/renderer/test/response-selection-menu.test.tsx \
  src/renderer/test/app-response-annotations.test.tsx \
  src/renderer/test/composer.test.tsx \
  src/renderer/test/user-message.test.tsx
```

包含 IME 不提交、拖选中隐藏、边界翻转、不可用原文、main 拒绝/抛错恢复、会话隔离等用例；不把这些未实测项改成实机通过。菜单测试有 React `act(...)` warning，无失败；文件桥不可用用例有预期提示。本轮未重复全仓测试，既往步骤 7 的结果按原记录保留。

## 待补验路线

1. **原生输入法与选区边界**：中文候选态 Enter 只确认候选、下一次才保存；补鼠标按住时隐藏、视口底部翻转、超长/工具/流式拒绝。原生接口本轮没有单独捕获按住鼠标的中间帧。
2. **定位和降级**：受控真实历史样例覆盖未加载、不匹配、唯一回退和歧义；补 Enter/Space、悬停离开、1.6 秒消退、sticky 用户消息。当前专用会话没有不可用状态。
3. **提交前失败恢复**：独立可控环境通过 main 拒绝/提交异常确认正文、评论、引用原样恢复且不串会话。当前成功链路无此状态，不修改现有供应商配置强行制造失败。
4. **视觉补齐**：评论框滚出/回屏、条目加深/离开恢复、跟随 OS 主题翻转；复用当前会话，不重复完整发送路线。

## 干扰、证据有效性与结束状态

- 01 是误开的浏览器 fixture，03 是其他会话干扰，均不计入通过证据；10 文件名有 `empty`，实际仍有短正文，也不作为空正文证明，随后空正文由现场 AX 确认。
- 早期并行后端修改触发 Vite reload，另有窗口切换/剪贴板超时，受干扰步骤未签收。用户说明是 bugfix agent 后，重新确认应用/会话/焦点并重跑相关路线。
- 恢复后未再观察到窄窗白屏；早期超时/CPU 空闲不足以认定 renderer 死循环。
- 最后保留专用 Chat 已发送历史，草稿清空、Composer 为空，系统主题/默认强调色及宽窗恢复，真实 dev 应用继续运行。见 [最终状态](23-electron-clean-final.jpg)。
