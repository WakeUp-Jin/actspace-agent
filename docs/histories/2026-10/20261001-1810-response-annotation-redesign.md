## [2026-10-01 18:10] | Task: 重做回复批注交互（PA2）

### Execution Context

- Agent ID: Claude Code
- Base Model: Claude Opus 5.5 / Sonnet 5.5
- Runtime: Claude Code CLI

### 用户诉求

用户拿 Codex 的截图对照，认为回复批注的交互和样式有问题（选区工具条、Composer 托盘、回复内 marker），要求照截图改，但不做 Ask in side chat。先看 demo，确认后先写修复计划再执行。

### 改动

- renderer 重做，数据契约（`response-excerpt`、偏移 + 前后文、main 校验）不变。
- 选区末尾「添加到对话」菜单；添加后在选区旁弹评论框（Enter 保存、Esc 取消、点外部保存、超 2000 字禁用保存）。
- 草稿在回复里是淡蓝高亮 + 右上角蓝色编号圆点（CSS Custom Highlight API），点圆点重开评论框。
- Composer 里的托盘换成「N 条批注」胶囊，悬停出卡片（编辑 / 删除 / × 清空）；已发送批注是用户消息上方的只读胶囊，条目可定位原文，定位不上显示「原回复不可用」；发送后回复上不留高亮；去掉「复制到草稿」。
- 删除 `ResponseAnnotationTray`、`ResponseAnnotationCommentEditor`、`ResponseAnnotationPopover`；新增 `ResponseAnnotationPill`、`ResponseAnnotationCommentPopover`、`ResponseAnnotationHighlights`。
- 新增 `annotation-mark` / `annotation-highlight(-active)` 主题 token（浅色、深色、跟随系统深色）。

### 验证

- desktop 全量 967 通过，唯一失败是 `workspace-git-context-service` non-repository 用例（环境问题，main 上同样失败）。
- `pnpm typecheck`、`check:frontend-tokens`、`check:frontend-theme`、`check:docs`、desktop build 通过。
- fixture 截图 13 张（浅色 / 深色 / 600px），第一次截图发现草稿高亮没出现：高亮组件放在消息区之前，首帧拿不到 `scrollContainerRef`；已移到消息区之后并监听 DOM 变化，补了回归测试。
- 未做 Electron 真实检查，等用户确认。

### 文档

- 计划 [PA2](../../exec-plans/active/20260928-composer-mentions-annotations/pa2-annotation-interaction-redesign.md)；执行记录步骤 7；设计文档新增一行修订。
