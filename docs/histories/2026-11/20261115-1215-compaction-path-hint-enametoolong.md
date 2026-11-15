## [2026-11-15 12:15] | Task: 上下文压缩因思考签名被当成路径而失败（ENAMETOOLONG）

### 🤖 Execution Context

- **Agent ID**: `Claude Code 主会话`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI，git worktree fix/composer-narrow-layout`

### 📥 User Query

> 会话 11a4a2ba… 里显示「上下文压缩失败 ENAMETOOLONG: name too long, realpath '/Users/…'」，看看是什么原因。

### 🛠 Changes Overview

**Scope:** `packages/context/context-disclosure`、`packages/core/runtime`

**Key Actions:**

- **根因**：压缩时渐进披露插件 `prepare()` 用 `collectPathHints` 遍历整段对话的所有字符串找路径。assistant 消息里的思考签名（`content[].signature` 和 `replay.payload.thinkingSignature`，约 2200 字符的 base64，带「/」）被正则当成相对路径，拼上工作区后交给 `realpath`。`realpath` 抛出 `ENAMETOOLONG`，而 `context-host` 只忽略 `ENOENT/ENOTDIR/EACCES`，于是异常往上抛，整次压缩失败。压缩用的 LLM 调用本身是成功的。
- `collectPathHints` 不再进入不透明字段（`signature`、`thinkingSignature`、`replay`、`redactedData`、`encryptedContent`），并丢掉任何一段超过 255 字符的候选路径。
- `context-host` 的 `normalizeFile` 把 `ENAMETOOLONG`、`ELOOP`、`EINVAL` 也当作「不是文件」。
- 测试：`disclosure.test.ts` 新增签名/回放/超长段用例；`context-host.test.ts` 新增超长候选路径返回 undefined。去掉修复后两条用例都会失败。

### 🧠 Design Intent (Why)

- 路径候选只是猜测，Host 负责校验；任何「这个字符串不是可用文件」的系统错误都不应升级成压缩失败。两处都修：源头少产生垃圾候选，Host 对剩下的仍然稳妥。

### ✅ Verification

- `context-disclosure` 全部单测、`context-host.test.ts` 通过；`pnpm typecheck` 通过。真实会话未重跑压缩。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：出错的会话 11a4a2ba 没有重跑压缩。
- **遗留**：无。

### 📁 Files Modified

- `packages/context/context-disclosure/src/paths.ts`、`src/test/disclosure.test.ts`
- `packages/core/runtime/src/harness/context-host.ts`、`context-host.test.ts`
