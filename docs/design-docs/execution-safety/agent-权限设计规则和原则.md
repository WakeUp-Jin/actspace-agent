# Agent 权限设计规则和原则

> 文档等级：current-v2-design
>
> 当前实现入口：[`README.md`](./README.md)、[`../agent-plugin-runtime/agent-spec-tool-runtime-abi.md`](../agent-plugin-runtime/agent-spec-tool-runtime-abi.md)。旧 ToolScheduler、`checkPermissions`、`session.jsonl` allowlist 与 v1 审批状态机已经归档，不是当前 API 事实。

## 目标

Agent 可以替用户调用本地和外部能力，但每次副作用都必须受 Host ceiling、工具声明、策略判断和用户决策共同约束。权限系统既不能把模型文本当授权，也不能让 renderer 或插件自行扩大宿主能力。

## 权限层级

一次工具调用按以下顺序收窄权限：

```text
Host capability ceiling
  -> Plugin manifest / Tool definition
  -> 参数验证与规范化
  -> Policy decision: allow / ask / deny
  -> 可选用户批准
  -> Prepared execution lease
  -> Executor effect
  -> Journal outcome
```

后层只能收窄前层，不能提升前层未授予的能力。Profile、Bundle、Patch 可以决定加载哪些受信插件，但不能绕过 Host ceiling。

## 核心原则

### 1. 权限属于统一 Tool Runtime

具体工具负责声明参数、只读性、能力需求和特有硬约束；统一 Tool Runtime 负责验证、policy、approval、并发、checkpoint、执行与取消。不能让 Bash、文件、网络和 Browser 各自实现互不兼容的审批状态机。

### 2. 验证先于审批，审批先于副作用

模型产生的原始参数不能直接执行。Runtime 必须先把它规范化为 prepared invocation，再进行 policy 判断。用户批准绑定到 invocation digest、工具版本、关键参数和有效期；参数变化后旧批准失效。

### 3. `deny` 与 `ask` 必须分开

- `deny`：输入不可安全解释、命中不可放行的硬防线、缺少 Host capability，或插件无权请求该能力。
- `ask`：动作有副作用，但范围清楚、用户能够理解并做有效决策。
- `allow`：满足当前策略且不需要额外用户决策。

硬拒绝不能通过 UI 的“仍然运行”绕过。审批只处理可以被人类合理判断的风险。

### 4. 授权必须窄、可见、短寿命

批准记录至少绑定：

- plugin id 与 tool id；
- invocation digest；
- 工作目录、目标路径、域名或其他影响范围；
- 风险理由与批准时间；
- 一次性或明确的 Session scope；
- 过期、取消和重放规则。

当前 v2 不承诺动态 Bash allowlist 或全局永久授权。未来若实现，必须以新 execution plan 和 Journal event/codec 设计重新立项，不能复用 v1 `bash_allowlist_added` 事件。

### 5. Renderer 不拥有执行能力

Renderer 只展示 Projection 和提交用户 decision。文件系统、进程、网络、密钥和 Browser Bridge 都由 main/CLI Host adapter 持有；批准后也由 Runtime 恢复 prepared execution，不由 renderer 直接调用 executor。

### 6. 生命周期归 Cordis Effect / Fiber 所有

插件激活时注册的 Service、Contribution、监听器和资源必须由对应 Cordis 生命周期拥有并可 dispose。插件卸载或 Runtime shutdown 后不能残留定时器、监听器、审批等待或后台进程。

### 7. 结果必须可审计且可恢复

Journal 记录稳定身份、状态变化、风险理由、用户 decision 和结果摘要。敏感参数、Authorization、Cookie、密钥、图片 Base64 与不受控长输出不得进入 Journal 或 renderer DTO。

发生崩溃、abort 或连接丢失时，Runtime 必须区分：

- 明确未执行；
- 明确成功或失败；
- `outcome_unknown`，即副作用可能已经发生但未获得可靠结果。

`outcome_unknown` 不得自动重试，除非工具契约证明调用幂等并记录了稳定 idempotency key。

### 8. 输出治理与权限治理是两件事

“允许执行”不等于“允许把完整结果放进上下文”。工具结果仍需经过大小限制、脱敏、artifact 落盘和 Projection allowlist；大输出优先保存为受管 Artifact，并把轻量引用写入 Journal。

## Bash 特别规则

Bash 是高风险 Host capability，除通用原则外还需要：

- 空命令、控制字符、不可解析结构和危险系统级删除直接 `deny`；
- cwd、timeout、环境变量与输出上限在执行前规范化；
- 复合 shell 结构不能只按首个 token 判断风险；
- 网络、包安装、Git 写操作和工作区外写入必须进入明确策略；
- abort 后若子进程状态不确定，返回 `outcome_unknown`，不伪装成普通取消；
- stdout/stderr 流式输出受限，完整大输出进入 Artifact，而不是无限写入 Journal。

当前代码已保留 Bash 硬防线和统一 Tool Runtime 边界；“会话级 Allow 相似命令”和用户级 allowlist 尚未作为 v2 能力实现。

## Browser Bridge 特别规则

Browser Bridge 是顶层 Host capability，不是普通 workspace plugin 目录。Browser Tools 插件只能通过 Host adapter 请求受限浏览器能力，不能直接持有 Native Messaging、Chrome profile 或扩展安装权限。真实 Chrome/Extension 验收是独立外部门禁，本规范不把静态协议检查写成“浏览器已经可用”。

## 新权限能力的计划要求

任何权限相关 execution plan 必须写清：

- 需要哪一层新增能力，是否改变 Host ceiling；
- manifest、Tool ABI、Journal codec 与 Projection 的变化；
- `allow / ask / deny` 和硬拒绝的精确边界；
- decision 如何绑定 invocation、如何过期和防重放；
- abort、崩溃、恢复与 `outcome_unknown` 的处理；
- secret、长输出和 artifact 的脱敏策略；
- lifecycle、卸载、Desktop/CLI parity 与人工验收门禁。

## 被排除的做法

- 让模型在 prompt 中自行声明“已获授权”。
- 让 renderer、单个 React 组件或插件 executor 私自实现审批恢复。
- 把所有风险都做成可点击放行。
- 只靠命令前缀或黑名单判断复杂 shell。
- 把批准永久化但不提供范围、来源、撤销和过期信息。
- 在断线或崩溃后自动重试可能已经产生副作用的调用。
