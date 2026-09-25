## [2026-09-26 00:10] | Task: 修复使用统计页 Usage index revision mismatch

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 使用统计页报错 `Error invoking remote method 'runtime-v2:fixed-renderer:get-usage-activity': Error: Usage index revision mismatch`，原因是什么，怎么修复。

### 🛠 Changes Overview

**Scope:** `@actspace/runtime`、`@actspace/session-projection-cache`、`apps/desktop` main 进程

**Key Actions:**

- **修正 `closeAll()` 丢失 end-seed 的索引更新**：`closeAll()` 先清空 `#open` 再追加 `session/end-seed`，导致 `onFlush` 找不到会话、Global Index 永远停在 end-seed 之前一个 seq。现在 flush 后直接用 live model 刷新索引条目，并在全部会话 settle 后统一 `save()`（`Promise.allSettled`，单个会话关闭失败不影响索引落盘，错误仍然抛出）。
- **冷读自愈过期索引**：`readModel()` 冷读得到的 snapshot 若比已加载的索引条目新，就回写该条目。已有用户磁盘上旧版本留下的落后条目会在第一次冷读时修好，不需要删除索引文件。
- **`GlobalSessionIndex.get()`**：按 sessionId 取单条摘要，供上面的比较使用。
- **UsageSourceCache 以 Journal 重放为准**：投影 revision 取 snapshot 的 `throughJournalSeq`，不再要求等于索引里的 seq；只有 Journal 与 snapshot 本身不一致时才跳过该会话并 `console.warn`，不再让整页失败。
- **回归测试**：runtime 覆盖「resume → closeAll 后索引 seq 等于 Journal 尾部」与「篡改为落后一位的索引在冷读后被修复」；desktop 覆盖「索引落后时按 Journal revision 投影、Journal 不足的会话被单独跳过」。

### 🧠 Design Intent (Why)

Global Index 是可丢弃的派生缓存，Journal 才是事实来源。旧逻辑把索引当成权威并在不一致时直接抛错，而关闭路径恰好系统性地制造了「落后一位」的索引，于是每次退出应用后，只要打开过会话，统计页就会永久报错。修复关闭路径解决根因；冷读自愈与统计页按 Journal 校验保证历史脏数据和未来的类似偏差不会再让整页不可用。

### 📁 Files Modified

- `packages/runtime/src/runtime/session-controller.ts`
- `packages/runtime/src/runtime/session-projection.test.ts`
- `packages/session/projection-cache/src/global-index.ts`
- `apps/desktop/src/main/runtime-v2/usage-source-cache.ts`
- `apps/desktop/src/main/test/usage-source-cache.test.ts`
