## [2026-11-08 21:10] | Task: IPC 入参 guard 全覆盖：注册器 fail-fast + 补齐 65 个无 guard 通道

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> `desktop-bridge/contract.ts` 定义了 130 个通道，`guards.ts` 只为 36 个提供了 guard，注册器没 guard 时直接 `input as SpecInput` 透传。核实是否属实，并把「忘了写 guard」变成启动期 / 测试期错误；先做方案 B（fail-fast + 完整性断言），再做方案 C（补齐全部 guard）。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（main IPC）、文档

**Key Actions:**

- **核实**：130 个 invoke 里 29 个是 `invoke<void, …>`；101 个有入参的通道只有 36 个有 guard，另 65 个靠 handler 自觉。其中 `quickOpen.updateShortcut` 把整个 input spread 进持久化设置，`providers.setKey` 没判 provider 枚举，`sessions.rename` / `tasks.submit` 靠 TypeError 兜底。
- **注册器 fail-fast**（`ipc/registry.ts`）：`handle()` 查不到 guard 直接抛 `Missing IPC input guard for <channel>`，不注册 handler；main 启动即失败。
- **guard DSL 扩展**（`ipc/guards.ts`）：字段标签加 `record?` / `string[]` / `array`，并允许谓词函数；新增 `oneOf` / `optional` / `integer` / `nested` / `listOf` / `nullable` 组合子，联合类型按判别字段分支校验。新增 `NO_INPUT`（只接受 `undefined`）。
- **补齐全部 130 个通道**：29 个无入参登记 `NO_INPUT`；65 个有入参的按 shared 类型写形状，枚举值引用 `PROVIDER_IDS` / `SEARCH_PROVIDER_IDS` / `PURPOSE_IDS` / `THINKING_LEVELS` / `MODEL_REASONING_EFFORTS`。`quickOpen.updateShortcut` 额外拒绝未知键。
- **测试**：`ipc-guards.test.ts` 新增「登记表 = 契约全部 invoke」断言，并为每个新 guard 补合法 / 非法用例（132 条）；`ipc-registry.test.ts` 新增「无 guard 拒绝注册」用例。
- **文档**：`front-preload-bridge与mock规范.md` §1 / §4 / §5 改为「每个 invoke 必须登记 guard」；`SECURITY.md` 补「IPC 入参 guard 全覆盖」。

### 🧠 Design Intent (Why)

- 原策略「涉及路径 / 设置 / Host 才加 guard」只靠人记，没有任何机制发现遗漏。把登记表变成契约全集 + 注册器 fail-fast，新通道忘写 guard 会在 vitest 和 main 启动两处立刻失败，而不是运行期信任 renderer。
- 不把 schema 塞进 `desktop-bridge/contract.ts`：契约被 renderer / preload / host-protocol 共用，schema 只有 main 用；现有 `shape()` 一行一条已够表达，不引入 zod 之类新依赖。
- guard 仍只管类型 / 形状 / 枚举，业务规则（路径是否注册、会话是否存在、连接是否有效）继续留在 handler 和 Service。

### 📁 Files Modified

- `apps/desktop/src/main/ipc/guards.ts`
- `apps/desktop/src/main/ipc/registry.ts`
- `apps/desktop/src/main/test/ipc-guards.test.ts`
- `apps/desktop/src/main/test/ipc-registry.test.ts`
- `docs/design-docs/frontend/front-preload-bridge与mock规范.md`
- `docs/SECURITY.md`
