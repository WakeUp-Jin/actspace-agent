## [2026-07-09 21:25] | Task: 修正 Browser Bridge 调用与媒体分析空结果

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 分析 Browser Bridge session 中为什么 Agent 写临时 sh 调用 `abb cdp`，并排查 Kimi-backed 多模态 `analyze_media` 返回空结果的问题，然后一起修改。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, and sibling `actspace-plugins/plugins/browser-bridge`

**Key Actions:**

- **[analyze_media 本地路径修复]**: `analyze_media` 对本地媒体路径先读取并转成 data URL，再调用 Kimi；远端 URL / data URL 保持原样。
- **[空结果显式失败]**: Kimi 返回空 summary 时不再包装为成功工具结果，避免主模型误以为视觉分析已完成。
- **[Browser Bridge Agent 指引]**: runtime prompt 明确要求优先使用 `abb` 的文件 / 输出参数，避免在用户 workspace 写临时浏览器脚本。
- **[Browser Bridge CLI]**: 插件 CLI 新增 `cdp --params-file` 与 `eval --expression/--file`，让复杂 `Runtime.evaluate` 不必通过 `run-cdp.sh` 绕 shell 引号。

### 🧠 Design Intent (Why)

这次 session 里的异常不是 `abb` 缺少浏览器能力，而是 CLI 只有 `--params <json>` 导致复杂 JS/JSON 容易被 shell quoting 与 Bash 安全分类卡住。给 CLI 增加 file-based / high-level eval 入口，比让 Agent 写临时 `.sh` 更稳定、更干净。

多模态侧的失败模式是工具成功但结果为空：工具把本地 `/Users/...png` 路径原样塞给 Kimi，远端模型无法读取本机文件；同时 executor 没检查空 summary。修复后本地截图路径会被转换成 provider 可读的 data URL，空响应也会明确暴露成失败。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/analyze-media/executor.ts`
- `packages/agent-core/src/tools/test/analyze-media.test.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/test/agent-runtime-context.test.ts`
- `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins/plugins/browser-bridge/apps/cli/main.go`
- `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins/plugins/browser-bridge/apps/cli/main_test.go`
- `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-plugins/plugins/browser-bridge/skill/SKILL.md`
