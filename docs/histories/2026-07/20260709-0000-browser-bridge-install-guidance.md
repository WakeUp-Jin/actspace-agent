## [2026-07-09 00:00] | Task: clarify Browser Bridge install guidance

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户反馈 browser-bridge 已经准备好，但「安装 Native Host」和「检查连接」没有明显效果，希望浏览器插件安装以提示方式出现，并让用户在编译后直接检查连接。

### 🛠 Changes Overview

**Scope:** desktop settings UI / browser-bridge IPC flow

**Key Actions:**

- **自动注册本机桥接**: `plugins:browser-bridge:install-from-repo` 在成功构建安装 `abb` 后自动运行 native host 注册。
- **文案降级**: 将「安装 Native Host」从主路径改为「重新注册本机桥接」，减少工程术语暴露。
- **安装提示**: 在 browser-bridge 卡片中增加 Chrome 扩展手动加载提示，显示扩展目录，并提供复制目录与打开扩展页按钮。
- **检查反馈**: 「检查连接」点击后显示检查中、连接成功、扩展未连接、本机桥接未注册等明确反馈。
- **高级诊断**: 默认隐藏 raw `abb doctor` checks，只在「高级诊断」中展开。

### 🧠 Design Intent (Why)

Browser Bridge 的用户路径应是「编译并安装 -> 按提示加载 Chrome 扩展 -> 检查连接」，而不是要求用户理解 Native Messaging host。Native host 是 Chrome 扩展启动本机 `abb` 的登记机制，适合做自动步骤和高级诊断，不适合作为主要按钮语义。

### 📁 Files Modified

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/settings/PluginsSettings.tsx`
- `packages/desktop/src/renderer/components/settings/fs-watch-shared.ts`
- `docs/histories/2026-07/20260709-0000-browser-bridge-install-guidance.md`
