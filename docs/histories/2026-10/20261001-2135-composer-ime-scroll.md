## [2026-10-01 21:35] | Task: 修复 Composer 输入法提交后滚动跳动

### 用户诉求

长文本末尾输入时，豆包候选词按空格上屏会让输入区向上滚动。用户确认独立测量方案后授权实施。

### 原因与改动

- 真实 Electron 事件记录显示：IME 提交期间，尺寸测量将 textarea 临时变窄、变矮；恢复尺寸后 scrollTop 从 134.5 变为 114.5，下一帧仍未恢复，光标与焦点保持在末尾。
- 改为复制当前 Composer 网格，在隐藏、inert、脱离文档布局的副本上测量 inline 折行和实际内容高度，finally 移除副本。复用网格 CSS、控件和断点，保留此前防止布局反馈循环的条件。
- 真实 textarea 不再临时设置 height:auto，也不再临时切换父网格；仅在目标高度变化时写入最终高度。没有强制滚到底部。
- 测试新增 IME 更新时真实网格和高度不发生临时 mutation 的断言，保留焦点、末尾选区、滚动位置与唯一输入框检查；原有布局测试改用原型尺寸模拟，覆盖测量副本。
- 更新布局测量学习文档，纠正“同步恢复真实 DOM 就没有副作用”的旧结论。

### 验证

- 新回归用例在旧实现实际失败，修改后通过；Composer 62 项测试全部通过。
- Desktop typecheck、renderer production build 通过；构建保留已有 highlight CSS 和 chunk size 警告。
- A1 Computer Use：开发版 Electron 输入 19 行文本，按普通空格后焦点及末行可见性保持，通过。
- A2 豆包真实候选词提交：用户在热更新开发版窗口亲自输入并按空格，确认“已测试，不再跳动”，通过。此项为用户实机验收，自动化普通空格不作为 IME 验收替代。
- A3 Computer Use：开发窗口从宽屏缩到约 711px，长文本与末行正常、未白屏；短句往返与 Agent/Plan/Chat 稳定切换由组件测试覆盖，尚未逐项真实界面覆盖。
- 同形扫描：ResponseAnnotationCommentPopover 也通过 height:auto 自动增高，但没有切换网格宽度；该评论弹窗未复现，作为潜在独立风险记录，本轮未修改。
- 提交前将本次补丁单独应用到 HEAD 的隔离工作树，Composer 61 项测试通过（不包含工作区中无关的百分比测试）。
- 本次仅修改 renderer；没有替换安装版。用户随后授权创建本地 commit，未授权推送。

### 文件

- apps/desktop/src/renderer/components/Composer.tsx
- apps/desktop/src/renderer/test/composer.test.tsx
- docs/learnings/2026-10/20261001-layout-measurement-feedback.md
