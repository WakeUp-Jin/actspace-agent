# 工具审批卡重设计 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260925-approval-card-redesign.md`
- **执行过程**：`docs/exec-runs/20260925-approval-card-redesign/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（真实 Electron 验收待人工）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 共享审批部件 | `components/messages/ApprovalParts.tsx` | 两种形态、三层按钮、路径折叠、原因映射、统一提交 |
| 读取/搜索/匹配一行审批条 | `components/messages/ToolLogLine.tsx` | “读取 / 搜索 / 匹配” + 路径或 `pattern 于 scope` |
| 编辑/写入一行审批条 | `components/messages/FileDiffBlock.tsx` | 默认不展示 diff，点 `+N -M` 展开 |
| 删除一行审批条 | `components/messages/DeleteFileBlock.tsx` | 红色描边与红色“删除”按钮 |
| Bash 卡片 | `components/messages/BashRunBlock.tsx` | intent + 环境标签、`$ command`、底部 cwd 与按钮 |
| 浏览器卡片 | `components/messages/BrowserApprovalBlock.tsx` | “整个会话”标签，主按钮“本会话允许” |

## 人工验证指引

### 必须验证

1. **工作区外读取**
   - 验证方式：`pnpm dev:log` 启动桌面端，默认权限模式下让 Agent 读取工作区外的文件。
   - 预期结果：出现一行“读取 路径 工作区外 ······ 拒绝 本会话 允许”；悬停“本会话”显示授权说明；点“允许”后收成普通 `Read` 行。
2. **编辑 / 写入工作区外文件**
   - 验证方式：让 Agent 编辑或新建一个工作区外的文件。
   - 预期结果：一行审批条，路径后是 `+N -M`；点击统计展开 diff，再点收起；“应用 / 写入”后收成 `Edit / Write` 行。
3. **删除文件**
   - 验证方式：让 Agent 删除一个临时文件。
   - 预期结果：红色描边一行，按钮“拒绝”“删除”，没有解释句。
4. **Bash 与浏览器**
   - 验证方式：在需要审批的模式下让 Agent 运行命令；让 Agent 打开浏览器。
   - 预期结果：卡片头行为“运行 + intent + 环境标签”或“使用浏览器 Chrome 整个会话”，按钮在底部右侧；拒绝后 Bash 显示“未执行”。
5. **主题**
   - 验证方式：设置中切换浅色 / 深色 / 跟随系统，重复第 1、4 项。
   - 预期结果：描边、标签、按钮在两种主题下都清楚可读。

### 建议验证

1. **窄窗口**
   - 验证方式：窗口缩到对话区约 480px 宽，触发读取审批。
   - 预期结果：目录折叠或截断，文件名完整，按钮不换行不溢出。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop typecheck`：通过。
- 9 个审批相关测试文件：110 / 110 通过（基线 8 个失败已修正）。
- `pnpm --filter @actspace/desktop build:renderer`：通过。
- `pnpm check:frontend-theme`：通过。
- 临时 renderer 页面截图：浅色、深色、512px 宽三组，与设计稿 B 方向一致；临时文件已删除。

## 已知风险和遗留事项

- 原因映射依赖 Runtime 的英文 reason 文本；文案变化会退回 Info 图标。建议后续通过 IPC 透传 reason code。
- `src/main/test/workspace-git-context-service.test.ts` 的 non-repository 用例在本机失败，与本次改动无关，未处理。
- 设计稿中“点击统计在右侧面板看 diff”改为行内展开，因为右侧面板目前没有 pending diff 的数据通道。

## 后续建议

- Bash 命令前缀授权落地后，在 Bash 卡片底部“拒绝”和“运行”之间加入“本会话允许 `前缀`”。
- 评估设计稿 C 方向（底部审批托盘 + 键盘选择）作为第二阶段。
