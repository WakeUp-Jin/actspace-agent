## [2026-10-01 21:19] | Task: 隐藏空的流式 Thinking

### 🤖 Execution Context

- **Agent ID**: Codex /root
- **Base Model**: GPT-6
- **Runtime**: Codex desktop，本地 macOS workspace

### 📥 User Query

> 自定义供应商的 Thinking 内容为空却仍显示。先用配置的 key/base URL 发起 curl 核对原始响应，确认根因后修复。

### 🛠 Changes Overview

**Scope:** Desktop renderer 的流式 Thinking 与回归测试。

- 空字符串 thinking delta 不创建段，也不清除当前等待/重试状态。
- 纯空白段继续累积原始片段，但不生成可见 Thinking；收到非空白正文后正常展示。
- 纯空白 delta 不结束等待模型提示。
- 保留 LLM 解析、Journal、供应商签名、回传与 usage 的原有语义。
- 同步消息区规范，补充思考正文、签名和用量的边界学习笔记。

### 🧠 Design Intent (Why)

两次真实 curl 请求均返回 HTTP 200：默认参数与显式 adaptive/summarized 都只返回空 thinking_delta、非空 signature_delta 与 thinking_tokens，完整响应中没有替代思考正文字段。应用会话记录与其一致。故本轮修复流式展示准入，不根据非零用量推断可见正文，也不删除后续协议回传所需的签名。真实 curl 原始证据保留在本机临时目录，凭据、签名和原始用户会话不写入仓库。

### 📁 Files Modified

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/learnings/2026-10/20261001-thinking-text-signature-usage.md`

### Verification

- Red：修改实现前，空字符串、纯空白两个测试都因出现可见 Thinking 按钮而失败。
- Green：同一测试覆盖等待提示、随后非空思考、工具/正文流和正文之后的空片段，两项通过；正向断言验证 Thinking 能出现且原始空白未丢失。
- 三个相关 renderer 测试文件共 60 项通过。
- Desktop renderer/main 双 tsconfig typecheck、renderer production build 通过。构建有既有 CSS highlight 与 chunk 大小警告。
- 提交前在基于原 HEAD 的隔离 worktree 中仅应用本次 5 个文件，离线安装依赖并重新构建 Desktop 依赖；60 项相关测试、Desktop 双 tsconfig typecheck 与文档检查再次通过，排除其他未提交改动对验证的影响。
- 同类检查：历史 Chat 投影与共享 message selector 已按 trim 过滤空正文；运行中的 subagent transcript 也经过共享 selector，不需重复修复。ThinkingBlock 是已有可见消息的展示组件，本轮在主会话独立的流式投影入口补齐准入。

### Computer Use 验收

先列 A1–A3，再按「真实请求」与「切换后恢复」两组执行。已进入真实开发 Electron，选择问题模型并提交最小验收消息；发送在模型请求前因 SESSION_WRITER_LOCKED 失败。运行中的安装版持有该会话，未中断安装版或移除 writer lock。

| 验收点 | 真实 Computer Use 结果 | 证据与其他验证 |
| --- | --- | --- |
| A1：空正文不显示 Thinking 行/按钮 | 未覆盖 | 未进入真实模型流式阶段；空字符串/纯空白回归测试通过 |
| A2：正文流式输出与发送/停止状态正常 | 未覆盖 | Electron 截图显示发送失败并保留输入；正文/工具状态由自动化测试覆盖 |
| A3：回复完成，切换并重新打开后仍隐藏空 Thinking | 未覆盖 | 无已完成验收回复；历史准入通过源码核对，不当作真实界面通过 |

本次没有新增颜色或样式，不宣称已完成多主题/多尺寸验收。截图保留于本轮 Computer Use 工具记录。

### Learning

本轮命中可迁移、有陷阱与有模式：思考正文、签名和用量是独立事实，历史投影的空内容过滤不能自动覆盖流式状态。已形成对应学习笔记。
