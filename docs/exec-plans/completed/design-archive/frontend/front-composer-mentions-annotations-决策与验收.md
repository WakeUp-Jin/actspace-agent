# Composer 文件引用与回复批注：决策与验收归档

归档：来自原《Composer 文件引用与回复批注设计》。现行规则见 `docs/design-docs/frontend/front-composer-file-mentions-and-response-annotations.md`；本文只保留实施决策修订表、方案取舍、开放决策和验收清单。


## 实施决策修订（2026-09-28）

对照现有代码讨论后，以下决定优先于正文中与之冲突的描述；契约的唯一真源是执行计划 P0 内容块契约（`p0-content-contract.md`）。

| 主题 | 正文原描述 | 修订后 |
|---|---|---|
| 持久化（§10.2、§10.3） | `UserMessagePayload` 新增 `composerContent` / `responseAnnotations`，Runtime 注入独立 prompt segment | 用户消息实际以 surface content 块写入 journal（inbox claim 事件）。新增 `file-reference`、`response-excerpt` 两种内容块；模型文本由 `toLlmContent` 渲染，context 用量自动计入；journal 编码不改，旧 session 天然兼容。投影后 `MessageBlock.user` 多出 `fileReferences` / `responseAnnotations`。 |
| 编辑器 schema（§6.2、§6.4） | paragraph / code_block + bold / italic / code / link marks | 只有 `paragraph` / `text` / `hard_break` / `file_mention`；Markdown 按原文输入和发送。 |
| `ComposerContentPayload`（§6.3、§10.1） | 发送和保存 document + plainText + fileReferences | 不跨 IPC、不持久化 document。发送、草稿、历史只用 `{ text, fileReferences }`，需要时用 `plainTextToDoc` 重建节点。`composerContent.plainText === userInput` 的一致性校验随之取消。 |
| 文件引用身份（§7.4） | `workspaceId` + `relativePath` | 只带 `relativePath` + `displayName`；main 按 session 的 workspace 重新解析，字面 + realpath 双重校验。V1 只引用文件，不引用目录。 |
| 批注定位（§9.1、§9.2） | Markdown source ↔ DOM 的 `MessageTextLocator` 映射 | 只用「可批注可见文本」的 UTF-16 偏移 + 前后文（各 ≤ 64 码元）；前后文唯一匹配兜底，否则 unresolved。`assistantMessageId` 为回复的 `MessageBlock.id`。 |
| 编辑器依赖（§17-1） | 原生 ProseMirror 与 Tiptap 待 PoC | 原生 ProseMirror（约 64 KB gzip，6 个包）；Tiptap 约 138 KB gzip、30 个包。jsdom 下打字、查询范围、原子节点插删、undo 均可用。 |
| 文件搜索 | 未定 | main 用 `git ls-files -co --exclude-standard`，非 git 仓库退回有上限的 Node 遍历；按 workspace 缓存 30 秒；不依赖 PATH 上的 `rg`。 |
| workspace 外文件（§17-2） | 建议 V1 只含当前 workspace | 确认只含当前 session workspace。 |
| 已发送批注（§9.5、§17-3） | `删除` 为本地 overlay | 已发送批注只读：只有查看和「复制到草稿」，没有删除。 |
| 回复批注交互（§8.2–§8.5、§9.3–§9.5，2026-10-01 PA2） | 选区上方工具条、Composer 引用托盘、回复内中性编号 marker + 悬浮预览、已发送摘要 + 复制到草稿 | 按用户确认的 demo 重做，见 PA2（`pa2-annotation-interaction-redesign.md`）：选区末尾「添加到对话」菜单；添加后在选区旁弹评论框（Enter 保存、Esc 取消）；草稿在回复里是原文淡蓝高亮 + 右上角蓝色编号圆点，点圆点重开评论框；Composer 只有一个「N 条批注」胶囊，悬停出卡片（编辑、删除、× 清空）；已发送批注是用户消息上方的只读胶囊，卡片条目可定位原文，定位不上显示「原回复不可用」；发送后回复上不留高亮和圆点，「复制到草稿」取消。数据契约不变。 |
| 代码块批注（§17-4） | 建议不允许 | 确认不允许。 |
| 模型可见内容（§10.3） | 引用说明含 source message id | 只给选中原文和用户评论，不含内部 id、编号或 UI 文案。 |
| Chat 形态 | `@` 关闭 | `@` 关闭且 main 拒绝文件引用；回复批注在 Chat 中可用。 |
| 实施顺序（执行计划 M0–M7） | 一份大计划 | 拆为 P0 内容块契约 → PA 回复批注 → PB 编辑器与 `@` 文件引用。 |


## 15. 验收矩阵

### 15.1 自动化测试

#### Editor / document

- 普通文本、换行、列表、代码块、链接的输入和序列化。
- `file_mention` 节点插入、复制、Backspace、Delete、撤销 / 重做。
- 旧 `text` draft 恢复为新 document。
- `plainText` 与 document 不一致时发送被拒绝。

#### `@` mention

- 起始、空格后、中文 query、路径 query、代码块内、链接内和重复 `@` 的触发规则。
- 键盘上下选择、Enter / Tab 选择、Escape 关闭、鼠标 hover / click。
- IME 组合输入不误选 / 不误发。
- workspace 切换和旧请求竞态。
- 无结果、加载中、失败、重试和文件被删除。
- main 端 `..` 越界、符号链接逃逸、workspace mismatch、非普通文件和绝对路径拒绝。

#### Response annotation

- 普通段落、标题、列表、引用的选区识别。
- 代码块、工具行、空白选区、跨消息选区被拒绝。
- 选择工具条的出现、定位、关闭和键盘操作。
- add / edit comment / remove / clear all。
- 多条引用去重、顺序、编号和发送前恢复。
- assistant message 改变后 offset 失效时 prefix / suffix fallback；0 个和多个匹配都进入 unresolved，不错位。
- marker hover、focus、click、preview boundary、碰撞布局和 scroll / resize 重测。

#### Session / Runtime

- 新字段缺失时旧事件和旧 Session 正常读取。
- user message payload 保存并投影 composerContent、attachments、responseAnnotations。
- annotation assistantMessageId 不属于当前 session 时 fail closed。
- 文件引用由 main 重新解析，不接受 renderer 任意 path。
- 发送失败恢复完整 draft；发送成功清空 draft。

### 15.2 浏览器 Renderer 验证

- 600px 以上宽度与 600px 以下窄窗。
- initial / follow-up、inline / stacked、有无附件、有无批注。
- Light / Dark / system-light / system-dark。
- `@` 菜单与 `/` 菜单互斥、内部滚动和 viewport 边界。
- selection toolbar 在正文顶部、底部和窗口边缘的翻转定位。
- marker 与 preview 不遮挡正文、Composer 和回到底部按钮。
- loading / empty / error / unresolved reference 的视觉状态。
- 使用 mock bridge，不把假文件系统状态当作 Electron 真实证明。

### 15.3 Electron 真实验证

- preload 的文件 suggestion IPC、当前 workspace 过滤和 realpath 校验。
- 真实文件选择、文件引用、发送、session journal 和重启恢复。
- 真实 assistant message 选区、批注加入 Composer、发送和历史回放。
- 真实窗口滚动、缩放、系统字体、Retina 和深浅主题。
- 发送失败、文件删除、workspace 切换和恢复路径。
- 验收按 `docs/FRONTEND_VERIFICATION.md` 执行，使用启动日志中的 `[dev-runtime] appName / appId` 定位真实窗口。

## 16. 方案取舍

### 16.1 为什么不继续使用 textarea

textarea 可以通过 `selectionStart` / `selectionEnd` 临时实现 `@` 替换，但难以同时可靠处理：

- inline mention 的不可拆分节点。
- Markdown / code / link 的结构化渲染。
- suggestion query range 与复杂光标移动。
- 输入法、撤销历史和粘贴 HTML。
- 同一正文中多个结构化引用的稳定恢复。

短期保留 textarea 的代价是后续必然出现字符串协议、显示协议和发送协议互相耦合。这里的 editor 迁移是为了把结构复杂度放到正确边界。

### 16.2 为什么不把回复选区直接复制进正文

复制选中文字虽然实现简单，但会丢失：

- 来源 assistant message。
- 原文定位。
- 多条引用的独立删除和预览。
- 后续 marker / hover card 的可能性。
- 发送失败恢复时的引用语义。

因此必须把 selection 当作 context object，而不是普通字符串。

### 16.3 为什么保留 `userInput` 兼容字段

当前 Runtime、CLI、测试和旧 Session 都以 string 为中心。结构化字段一次性替换会扩大改动面，也会让旧 session 和调试工具无法工作。保留 plain text 兼容字段，先让新能力可增量接入，再在后续版本评估是否收紧协议，是风险更低的迁移路径。

## 17. 开放决策

以下不是实现阻塞项，但实现前要在执行计划的决策记录中确认：

1. 使用原生 ProseMirror packages 还是 Tiptap。建议先用最小 PoC 对比 bundle 体积、IME、Markdown paste 和 schema 控制力。
2. `@` 文件 suggestion 是否包含 workspace 外已被授权的文件。建议 V1 只包含当前 session workspace。
3. 已发送 annotation 是否在 V1 提供真正的历史删除事件。建议先只读 marker + 复制到新 draft。
4. 是否允许引用代码块。建议 V1 不允许，后续以独立 code selection 设计处理。
5. selectedText 最大长度。建议初始限制为 8,000 个 Unicode code points；实现后根据实际 prompt 与 journal 体积观测调整。
6. marker 最大数量。建议每条 assistant message 20 条；超出后仍可加入 Composer，但正文只显示批注汇总入口。

