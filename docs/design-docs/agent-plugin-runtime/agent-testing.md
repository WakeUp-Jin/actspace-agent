# Agent v2 测试策略

> 状态：当前 v2 测试分层和最低覆盖契约。自动化通过不替代真实 Provider、Electron、Browser 或签名制品验收。

## 目标

测试应证明四件不同的事：

1. workspace package 是合法、可发布和可装载的边界；
2. Plugin Entry 在 Cordis 生命周期中能激活、提供声明服务并释放 effect；
3. Agent / Session / LLM / Tool 的领域语义在无真实外部依赖时可确定复现；
4. Desktop、CLI 和真实宿主能力没有被单元测试的 mock 假象替代。

## 分层

### 1. Package contract

仓库级 verifier 检查：

- `package.json`、`type: module`、exports 与 workspace identity；
- `src/manifest.ts`、`src/plugin.ts`；
- 产生持久事件的 package 是否提供 codec entry；
- manifest identity、Entry ID、Service / Event 声明；
- package 不通过 sibling `src/` deep import 绕过 exports；
- retired monolith、通用 `plugins/` 和 v1 生产路径不可达。

命令：

```sh
pnpm check:packages
pnpm check:package-cutover -- --strict
pnpm check:v2-legacy-removal -- --strict
```

### 2. Plugin lifecycle

每个可装载领域 package 至少有一个 lifecycle test，验证：

- manifest 与 behavior entry 可以被加载；
- 声明的 Service / Contribution 实际存在；
- 缺少 required Host capability 时 admission 失败；
- dispose 释放该插件创建的 effect；
- 重复激活或冲突 identity 按契约失败。

常见位置：

```text
packages/<domain>/<package>/src/test/lifecycle.test.ts
```

Lifecycle test 只证明该 Entry 的边界，不证明完整 Runtime shutdown。

### 3. 领域行为

重点覆盖：

- Session：Header、codec、invariant、Surface、writer lease、write-behind、repair、fork、compaction 和 golden cases；
- LLM：route、prepared request、usage、failure classification、retry、abort、credential redaction 和 adapter dispose；
- Tool Runtime：argument validation、policy、approval、dispatch checkpoint、lease、ordered commit、artifact、redaction 和 outcome-unknown；
- Agent Loop：request snapshot、tool loop、Inbox steering、Todo、abort、Compaction 与 terminal reason；
- Subagent：Preset、工具限制、child Session lineage、publication 和级联取消；
- Prompt / Context：contributor 排序、required / optional、Skill discovery、JSON-safe snapshot 和 secret rejection。

领域测试使用 fake provider、fake Host port 和 deterministic clock。除专门集成测试外，不访问真实网络、用户目录或 Chrome。

### 4. Runtime integration

`packages/runtime` 必须直接覆盖：

- Boot partial failure 的逆序清理；
- 单进程唯一 ready `BootedProfile`；
- create / resume / fork / run / abort Session；
- stop accepting work；
- graceful timeout、blocker diagnostics 和 final shutdown；
- Session flush / close 与 Cordis dispose 顺序；
- `dispose()` 幂等和并发调用；
- restart-required 状态。

当前仓库的 `packages/runtime` 已有 Profile composition、Host service 和 Agent runtime lifecycle tests；真实宿主 quit/shutdown 仍需由 Electron/CLI process smoke 补足。不得把“无测试文件但退出码为 0”计为完整 Runtime 覆盖。

### 5. Host integration

Desktop 和 CLI 分别验证：

- managed ESM loader 能定位 packaged Runtime；
- Host capability ceiling 与实际 ports 一致；
- Desktop / CLI 使用相同 Session 与 Agent 语义；
- CLI `run` 默认 ephemeral，`--persist` / `--resume` 写 Journal；
- SIGINT、quit、reload 会触发 abort 和 drain；
- renderer 只收到 Projection DTO，不收到 secret、任意文件路径或插件前端代码。

### 6. 外部人工门禁

下面的证据不能由 fake 或静态测试替代：

- 真实 DeepSeek / Kimi / OpenRouter request 和 resume；
- Electron 主窗口、preload、IPC、reload、quit 和 isolated `userData`；
- Chrome Extension、Native Messaging、Bridge socket 与只读 Browser action；
- macOS DMG、签名、公证、安装和首次启动；
- 固定 renderer 的浅色 / 深色、长会话、滚动和关键交互。

未完成时必须在 execution summary 中逐项记录，不能只写“测试通过”。

## Fixture 规则

- golden fixture 固定协议事实，不依赖随机时间或真实 provider；
- 临时 Session 和 artifact 使用测试临时目录，不写用户 `userData`；
- secret canary 必须覆盖 Session、日志、diagnostics、stdout、error 和 Projection；
- Browser、network、filesystem 和 shell 使用明确 fake port，测试名称要说明不是实机；
- 负向 fixture 与正向 package 同等重要，用于证明 verifier 能真正拒绝错误结构。

## 目录约定

优先把测试放在拥有行为的 package 内：

```text
src/test/lifecycle.test.ts
src/test/<behavior>.test.ts
src/test/golden/
```

跨 Host 的 process smoke 放在 `scripts/test/` 或对应 app 的 `src/test/`。不要建立一个能直接访问所有 package 私有实现的中央测试大包。

## 默认验证顺序

```sh
pnpm check:docs
pnpm check:repo
pnpm check:packages
pnpm check:package-cutover -- --strict
pnpm check:v2-legacy-removal -- --strict
pnpm typecheck
pnpm test
pnpm build
```

涉及发布时再追加：

```sh
pnpm package:agent-cli
pnpm test:agent-cli:package
pnpm package:desktop
pnpm check:browser
```

## 完成判定

一项 Agent 后端改动只有同时满足以下条件才可写“自动化完成”：

- 对应 package contract 与 lifecycle test 通过；
- 领域行为有正向和关键失败用例；
- Host integration 没有绕过 Profile Bootstrap 或 App Bundle Service；
- 文档与 package exports / manifest 一致；
- 未验证的真实外部边界被明确列出。
