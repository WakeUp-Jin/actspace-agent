## [2026-11-14 02:00] | Task: 存储包装服务补上漏转发的三个方法（编辑提问重发在真实运行环境里不可用）

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 如果没有完成的话，就继续执行

审查修复批次（计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`）做到 M10「服务取用接到 `ServiceDefinition`」时，要给 `session.storage` 写类型，核对它实际注册的对象时发现了这个问题。它不在审查当时列出的 24 项里，是新发现，单独一个提交放在第 6 个 PR 里。

### 🛠 Changes Overview

**Scope:** `packages/session/session-persistence-jsonl`、`packages/core/runtime`（测试）、`packages/session/README.md`、`docs/releases`

**Key Actions:**

- **补转发**：`JsonlSessionStorageService`（注册在 `session.storage` 下的包装服务）补上 `refresh`、`rewritePrefix`、`retireInto` 三个方法，原样转给 `JsonlSessionStorage`。
- **编译期约束**：包装类声明 `implements Pick<JsonlSessionStorage, 除 options 外的全部公开成员>`。以后给存储加了公开方法却没在包装类里转发，包编译不过。
- **回归测试**：
  - `session-persistence-jsonl` 的 `lifecycle.test.ts`：通过插件拿到发布出来的服务，确认存储的每个公开方法它都有；通过它调 `refresh`，先得到 `unchanged`，追加后得到 `appended`；再用它把存储契约测试整套跑一遍。
  - `runtime` 新增 `session-storage-boot.test.ts`：按真实方式启动（`bootProfileRuntime`，headless 配置），从 `session.runtime` 建会话、写三条消息、回退到第二条，确认日志只剩前缀、旧日志进了 `recovery/`。
- **文档**：`packages/session/README.md` 的「怎么扩展」加一条「给物理存储加一种能力」，写明要在包装服务里转发；发布记录 2026-11-10 那一条的「改进」和「问题修复」各加一行。

### 🧠 Design Intent (Why)

**问题是什么。** `session.storage` 这个服务 id 下注册的不是 `JsonlSessionStorage`，是一个手写转发的包装类。包装类最后一次改动是 11-01；存储的 `refresh` 是 11-05 加的（长会话增量读取），`rewritePrefix`、`retireInto` 是 11-07 加的（编辑提问重发），两次都没有同步包装类。这三个方法在 `SessionStorage` 接口里是可选的，消费方按「有没有这个方法」判断后端是否支持，所以漏转发不报错，表现为「这个后端不支持」：

| 漏掉的方法 | 消费方 | 实际后果 |
| --- | --- | --- |
| `rewritePrefix`、`retireInto` | `RuntimeSessionController.rewrite` | 抛 `REWIND_UNAVAILABLE`。用户编辑提问后发送，看到「这条提问不能再编辑。」；而且走到这一步之前，这个会话正在运行的子智能体和后台任务已经被停掉 |
| `refresh` | `SessionProjectionCache` | 读没有在本进程打开的会话（空闲后被释放的会话、翻看历史）时，每次都把整份日志重读一遍再比对；11-05 那次「没变就只看末尾、变长就只读新增部分」的优化在这条路径上没有生效 |

所有 Host（桌面端、CLI、Agent Host）用同一份 `cordis.yml`、同一个存储插件，都受影响。

**为什么之前没发现。** 相关测试（存储契约、`session-rewrite`、`edit-resend-rewind`、`refresh`）都自己 `new JsonlSessionStorage` 或用内存存储，没有一条经过包装类。存储契约测试在后端没有 `rewritePrefix` 时直接 `return`，所以即使拿包装类去跑也是绿的。编辑提问重发那次的执行摘要里写着「Electron 实机待验收」。

**为什么这样修。** 补三行转发能修好眼前的问题，但下一次给存储加方法还会再漏。让包装类 `implements` 存储实现的全部公开成员之后，漏转发是编译错误。没有改成直接注册 `JsonlSessionStorage`、去掉包装类：包装类继承 Cordis 的 `Service`，负责注册、随插件卸载而注销，去掉它是另一件事。

契约测试里的 `if (!f.storage.rewritePrefix) return;` 没动：内存存储之外的后端确实可以不支持回退。所以另加了一条「发布出来的对象一个方法都没少」的用例，不依赖契约测试会不会跳过。

### ✅ Verification

- 真实启动下复现：修之前 `session.runtime` 拿到的存储 `refresh`、`rewritePrefix`、`retireInto` 都是 `undefined`，`rewrite()` 抛 `REWIND_UNAVAILABLE`；修之后回退成功。
- 新增用例在旧包装类上失败、在新包装类上通过：`lifecycle.test.ts` 8 条里 2 条失败（少了三个方法；`storage.refresh is not a function`），`session-storage-boot.test.ts` 失败（三个方法都是 `undefined`）。
- 编译期约束验证过：临时删掉 `retireInto` 的转发，`tsc` 报 `Property 'retireInto' is missing in type 'JsonlSessionStorageService'`。
- 其它三个同样写法的包装类（`ToolRuntimeService`、`LlmRuntimeService`、`AgentRegistryService`）逐个对过，转发齐全。

没有验证的：没有在真实的桌面窗口里点过「编辑提问」。启动测试覆盖到 Runtime 这一层；界面到 Runtime 之间的那一段沿用编辑提问重发原有的测试。

### 📁 Files Modified

- `packages/session/session-persistence-jsonl/src/plugin.ts`
- `packages/session/session-persistence-jsonl/src/test/lifecycle.test.ts`
- `packages/core/runtime/src/startup/session-storage-boot.test.ts`
- `packages/session/README.md`
- `docs/releases/feature-release-notes.md`
