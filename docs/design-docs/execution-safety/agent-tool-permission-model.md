# Agent 工具权限模型设计规范

> 状态：v2 权限事实源；基础 Runtime、once 与 Desktop 文件 Session Grant 已实施。
>
> 实施方式：直接切换，不保留旧 `trusted` / `yolo` 模式、旧 approval decision、旧 permission preset 或旧权限事件的兼容层。
>
> 执行计划：[`permission-runtime-foundation`](../../exec-plans/completed/permission-runtime-foundation.md)、[`session-scope-grants`](../../exec-plans/completed/session-scope-grants.md)。

## 1. 目标

权限模块统一回答四个问题：

1. 当前 Session 的基础文件范围是什么；
2. 一次具体工具调用应当自动执行、询问还是拒绝；
3. 用户的一次性批准或 Session 授权如何被精确使用；
4. 即使 UI、模型或策略出错，Host 是否仍在执行点强制真实边界。

本设计只保留两个产品模式：

```ts
type PermissionMode = "default" | "auto-review" | "full-access";
type FileScope = "workspace" | "all";
```

`default` 映射为 workspace 文件范围，`full-access` 映射为 Host ceiling 内的全部文件范围。通过硬规则检查的 Bash 在 `full-access` 下自动执行，并且不进沙箱（见[沙箱设计](agent-沙箱设计.md)第 9 节）；文件删除、敏感资源仍按各自策略审批，Host ceiling 不变。

## 2. 非目标

第一轮不实现：

- project、跨 Session 或用户级持久 Grant；
- 任意 Bash pattern、动态 allowlist 或跨会话永久授权；
- Browser 与 Network Grant；
- 跨平台 sandbox 收敛；
- 不可信第三方插件沙箱；
- 任意 shell pipeline、redirection、expansion 的安全 AST 分类；
- 旧模式、旧审批协议和旧权限事件的数据或 API 兼容。

现有 macOS Bash sandbox 可以继续作为 executor enforcement，但本设计不把它写成跨平台能力已经完成。

## 3. 不变量

权限系统必须满足：

- `deny > ask > allow`，后层只能收窄前层；
- Host ceiling、敏感资源 hard deny 和工具 hard deny 不能被审批或 Grant 覆盖；
- `GlobalBoundaryDecision.pass` 是中性结果，不是最终 `allow`；
- Grant 只能满足已被规则判定为可复用的 `ask`；
- 参数验证和资源提取先于审批，审批先于 durability checkpoint 和副作用；
- 审批后必须重新检查 mode、参数、资源、Grant、lease、Host ceiling 和 abort；
- Renderer 只展示请求并提交受限 decision，不创建、不恢复、不持久化 Grant；
- Permission 负责 admission，Host guard 或 sandbox 负责 enforcement；
- 未知、损坏、过期或无法验证的权限状态一律 fail-closed。

## 4. 模块所有权

权限引擎保持唯一；具体工具合同由各独立工具插件拥有。

| 模块 | 所有权 |
| --- | --- |
| `packages/shared` | `PermissionMode`、Grant 与跨进程权限 DTO |
| `packages/tools/approval` | `ApprovalBroker` 请求/响应端口，不保存状态 |
| `packages/tools/runtime` | `PermissionEngine`、边界评估、决策合并、Grant 匹配、审批和重检 |
| `packages/tools/filesystem-read`、`filesystem-search`、`filesystem-write` | 各自的文件资源提取和独立 permission audience、Grant 建议 |
| `packages/tools/shell-tools` | Bash 资源提取和命令风险评估；不复用文件 Grant audience |
| `packages/session/journal` | 权限事件 strict codec |
| `packages/session/projection` | 当前 mode 与有效 Session Grant 投影 |
| `packages/runtime` | Session、Agent、Projection 与 Tool Environment 组装 |
| Desktop main | 审批、模式变更和撤销 IPC |
| Renderer | 请求展示与受限用户 decision |
| CLI | `default/full-access` 与 `once/deny`；首版不启用 Session Grant |

```text
Tool Plugin PermissionContract
            |
            v
Tool Runtime PermissionEngine <--- Session Permission Projection
            |
      ApprovalBroker
       /          \
Desktop main     CLI adapter
            |
     Session Journal
```

## 5. 工具权限合同

工具注册时提供结构化权限合同，替代只返回字符串路径的 `resolveResourcePaths()`：

```ts
type ToolPermissionContract = {
  readonly grantAudience?: GrantAudience;
  extractResources(
    args: Readonly<Record<string, RuntimeV2JsonValue>>,
    context: ResourceExtractionContext,
  ): readonly ToolResource[];
  evaluate(
    args: Readonly<Record<string, RuntimeV2JsonValue>>,
    resources: readonly ToolResource[],
    context: ToolPermissionContext,
  ): ToolPermissionDecision | Promise<ToolPermissionDecision>;
  suggestGrants?(
    args: Readonly<Record<string, RuntimeV2JsonValue>>,
    resources: readonly ToolResource[],
    context: ToolPermissionContext,
  ): readonly ToolGrantSuggestion[];
};
```

当前已实现 `extractResources + evaluate + grantAudience + suggestGrants`。只有 Desktop Host 打开 Session Grant capability 时，Runtime 才会读取或签发建议；CLI 不消费这些扩展点。

第一版只实现真实可强制的资源：

```ts
type ToolResource =
  | {
      readonly kind: "file";
      readonly access: "read" | "write" | "delete";
      readonly canonicalPath: string;
      readonly targetKind: "file" | "directory" | "missing";
    }
  | {
      readonly kind: "process";
      readonly access: "execute";
      readonly commandDigest: string;
      readonly cwd: string;
      readonly dynamic: boolean;
    };
```

不提前加入没有实现语义的 Browser 或 Network 占位资源。

## 6. 决策模型

```ts
type GlobalBoundaryDecision =
  | { readonly kind: "pass" }
  | { readonly kind: "ask"; readonly reasons: readonly ApprovalReason[] }
  | { readonly kind: "deny"; readonly code: string; readonly reason: string };

type ToolPermissionDecision =
  | { readonly kind: "allow" }
  | {
      readonly kind: "ask";
      readonly reason: string;
      readonly risk: "low" | "medium" | "high";
      readonly supportedLifetimes: readonly GrantLifetime[];
    }
  | { readonly kind: "deny"; readonly code: string; readonly reason: string };

type GrantLifetime = "once" | "session";
```

Runtime 合同已暴露 `GrantLifetime`。Desktop 接受 `once | session | deny`，CLI 仍只接受 `once | deny`。

合并矩阵：

| 全局边界 | 工具判断 | 匹配 Session Grant | 结果 |
| --- | --- | --- | --- |
| `deny` | 任意 | 任意 | `deny` |
| `pass` | `deny` | 任意 | `deny` |
| `ask` | `deny` | 任意 | `deny` |
| `ask` | `allow` | 否 | `ask` |
| `ask` | `ask` | 否 | 合并为一次 `ask` |
| `pass` | `ask` | 否 | `ask` |
| `ask` | `allow` | 是 | `allow` |
| `pass` | `ask` | 是 | `allow` |
| `pass` | `allow` | 不需要 | `allow` |

当多个原因同时要求审批时，Runtime 生成一个请求。只有所有原因都支持 Session lifetime，UI 才能显示“本次会话允许”。

## 7. 工具默认策略

| 工具动作 | workspace 内 | workspace 外且为 `default` | `full-access` | Session Grant |
| --- | --- | --- | --- | --- |
| 文件读取 | `allow` | scope `ask` | 非敏感资源 `allow` | 支持 |
| 文件写入/编辑 | `allow` | scope `ask` | 非敏感资源 `allow` | 支持 |
| 文件删除 | `ask once` | scope + delete `ask once` | `ask once` | 不支持 |
| Bash | 工具风险 `ask`；可消费符合条件的前缀授权 | 不提供外部目录 Grant | 通过 hard guard 后 `allow` | Desktop 支持限定前缀 |

敏感分类和 hard deny 始终优先于该表。

## 8. 文件 canonicalization

现有目标按以下顺序解析：

```text
用户路径
-> 相对 workspace 解析
-> 绝对路径规范化
-> realpath
-> 目标类型检查
-> 敏感分类与 scope 判断
```

尚不存在的写入目标：

```text
用户路径
-> 相对 workspace 解析
-> 找到最近的已存在祖先
-> realpath(祖先)
-> 拼接剩余的规范化路径段
-> 敏感分类与 scope 判断
```

约束：

- 写入和删除拒绝最终目标为符号链接；
- 读取可以跟随符号链接，但权限匹配使用最终 canonical path；
- subtree 使用路径段关系判断，不使用字符串前缀；
- 原子写入临时文件必须位于已经验证的目标父目录；
- 审批后、真实 syscall 前重新解析父目录与目标；
- 审批后出现符号链接替换或 scope 变化时返回稳定 `scope-changed` 拒绝；
- socket、FIFO、设备文件和其他非普通文件不进入普通文件授权模型。

第一版不宣称完全消除所有文件系统 TOCTOU。Host guard 必须尽量靠近 syscall；需要更强保证时再独立设计目录句柄和 no-follow 执行器。

## 9. 敏感资源

```ts
type ResourceSensitivity =
  | { readonly kind: "normal" }
  | { readonly kind: "once-only"; readonly code: string; readonly reason: string }
  | { readonly kind: "protected"; readonly code: string; readonly reason: string };
```

### protected / hard deny

- ActSpace credential、权限状态和其他 Host-only 存储；
- SSH 私钥；
- 浏览器 Cookie、Login Data 和 Profile 凭据数据库；
- macOS Keychain 等系统凭据存储；
- 文件工具写入或删除 `.git/**`；
- 非普通文件；
- 无法安全规范化、复验或强制范围的资源；
- Host 或插件没有声明对应 capability 的资源。

### once-only

- `.env` 和本地环境配置，但不包括 `.env.example`；
- `.npmrc`、`.pypirc`、`.netrc` 等可能包含 Token 的配置；
- `.aws/credentials`、`.kube/config`、`.docker/config.json`；
- `.git/config`、Git credential 配置；
- 其他被路径或受控内容规则识别为可能包含凭据的项目文件。

`once-only` 必须审批且不生成 Session Grant。hard deny 不显示“仍然运行”，第一版也不提供关闭 hard deny 的用户配置。

## 10. OnceApproval

`once` 是 prepared invocation 的 admission token，不进入可复用 Grant Registry：

```ts
type OnceApproval = {
  readonly kind: "once";
  readonly requestId: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly pluginId: string;
  readonly toolName: string;
  readonly definitionDigest: string;
  readonly normalizedArgsDigest: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
};
```

它只能消费一次。参数、资源、definition、lease、mode、Host ceiling 或 abort 状态变化后必须失效。Journal 记录用户决定，但不得保存可重放的 OnceApproval。

## 11. SessionGrant

Session Grant 只支持核心文件权限：

```ts
type FileGrantSelector =
  | { readonly kind: "exact"; readonly canonicalPath: string }
  | { readonly kind: "subtree"; readonly canonicalRoot: string };

type GrantAudience = {
  readonly pluginId: string;
  readonly permissionDomain: string;
  readonly policyVersion: number;
};

type SessionGrant = {
  readonly schemaVersion: 1;
  readonly grantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly audience: GrantAudience;
  readonly action: "file.read" | "file.write";
  readonly access: "read" | "write";
  readonly selector: FileGrantSelector;
  readonly sourceRequestId: string;
  readonly sourceCallId: string;
  readonly sourceToolName: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
};
```

规则：

- action 与 access 必须一致；
- 单文件请求默认只建议 `exact`；
- 只有用户明确选择目录时才能签发 `subtree`；
- 不得自动扩大到父目录、Home、Documents 或共同祖先；
- 多资源调用必须全部被覆盖；
- 相同 `pluginId + permissionDomain + policyVersion` 的受信核心文件工具可以共享；
- `read_file`、`grep`、`glob` 可以共享 `file.read` subtree；
- `write_file`、`edit_file` 可以共享 `file.write` selector；
- 第三方插件、delete 和 Subagent 不能消费主 Agent 的 Grant；Bash 只能消费自己 audience 下受限 command_prefix Grant；
- Session Grant 不绑定 `definitionDigest`，权限兼容性由显式 `policyVersion` 控制；
- Session Grant 可以随同一个 Session 恢复，但不跨 Session、Agent 或 Host 明确禁用的能力。

Desktop 会签发、恢复、展示、匹配和撤销 Session Grant；CLI Host capability 关闭该能力，不能签发或消费 Desktop Grant。

## 12. PermissionMode 生命周期

模式属于 Session，并通过 `permission/mode-set` 持久化：

- 新 Session 默认 `default`；
- 只有 Host 接受的用户操作可以改变模式；
- Agent、工具和 Renderer 不能直接写 mode event；
- Session 恢复时重建最后一个有效 mode；
- `default -> full-access` 使通过 hard guard 的 Bash 自动执行；等待中的请求撤销后由 Runtime 重新评估，不伪造用户 once 批准；
- `full-access -> default` 使待审批请求重新评估、未消费 OnceApproval 失效，并撤销 workspace 外文件 Session Grant；
- checkpoint 后及执行体调用前再次检查模式；已开始执行的命令不因模式切换被追溯取消；
- 模式通知由 Session projection 接入 Tool Runtime，订阅仅存活于审批等待；旧请求按 requestId 取消并记录 `deny/aborted`（reason 为 `permission-mode-changed`）。已返回的拒绝/过期优先，不得因切换放行；
- CLI resume 只有在用户显式传入 `--permission-mode` 时才覆盖已恢复模式。

## 13. 审批协议

当前 Desktop Session Grant 审批请求：

```ts
type ApprovalRequest = {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly agentId: string;
  readonly pluginId: string;
  readonly toolName: string;
  readonly definitionDigest: string;
  readonly normalizedArgsDigest: string;
  readonly reasons: readonly ApprovalReason[];
  readonly resources: readonly ApprovalResourceSummary[];
  readonly grantSuggestions: readonly GrantSuggestion[];
  readonly supportedLifetimes: readonly GrantLifetime[];
  readonly requestedAt: string;
  readonly expiresAt: string;
};
```

请求固定十分钟过期。无法安全保存的请求使用空 suggestion，并把 lifetime 固定为 `once`。

```ts
type ApprovalDecision =
  | { readonly requestId: string; readonly kind: "once"; readonly decidedAt: string }
  | {
      readonly requestId: string;
      readonly kind: "session";
      readonly suggestionId: string;
      readonly decidedAt: string;
    }
  | {
      readonly requestId: string;
      readonly kind: "deny";
      readonly code:
        | "user-denied"
        | "timeout"
        | "aborted"
        | "broker-unavailable"
        | "invalid-decision";
      readonly decidedAt: string;
    };
```

其中 `session` 在 Desktop 核心文件范围及符合既有前缀规则的 Bash 审批中可达。Renderer 只返回 Runtime 生成的 `suggestionId`；CLI、delete、敏感文件和不完整覆盖请求仍只有 `once | deny`。

Renderer 只能返回 Runtime 生成的 `suggestionId`，不能提交任意 action、路径或 pattern。迟到、重复、过期或不匹配的 decision 必须拒绝。

审批 UI 只接收有界、脱敏的资源摘要。Bash 可以显示脱敏后的规范化命令摘要，但 Journal 不记录命令全文、Cookie、Authorization、凭据或不受控长参数。

## 14. 完整执行顺序

```text
1. capture registration / activation lease
2. materialize and validate args
3. run tools/pre-execute and revalidate patched args
4. extract and canonicalize resources
5. check Host ceiling, sensitivity and global scope
6. evaluate tool permission policy
7. combine decisions; deny ends immediately
8. resolve matching Session Grants
9. ask through ApprovalBroker when unresolved ask remains
10. issue OnceApproval or validated SessionGrant
11. re-check mode, digests, resources, grants, lease, Host ceiling and abort
12. record dispatch and pass durability checkpoint
13. enforce Host guard / executor sandbox and run body
14. normalize result and commit ordered tool/result
15. commit permission and terminal audit facts
```

## 15. Journal 事件

required 权限事件为：

```text
permission/mode-set
permission/asked
permission/decided
permission/scope-denied
```

```text
permission/grant-added
permission/grant-revoked
```

约束：

- 一个 `requestId` 最多只有一个终态决定；
- `permission/decided` 必须引用已存在的 `permission/asked`；
- `permission/grant-added` 必须对应同一请求的 `session` 决定；
- `once` 和 `deny` 后不得新增 Grant；
- `grantId` 永不复用；
- 撤销只能作用于当前有效 Grant；
- `scope-denied` 可以不经过 asked，因为 hard deny 不询问用户；
- 不兼容、损坏、过期或 agent/audience 不匹配的 Grant 不恢复；
- 恢复失败只会收窄为重新询问或拒绝，不能扩大权限。

Session Journal 是 Session Grant 的唯一持久事实源，不增加独立 Host Session GrantStore。Projection 从 `grant-added` 和 `grant-revoked` 重建有效状态。

## 16. Bash 边界

第一版 Bash 继续使用当前保守 hard reject：

- 空命令、控制字符、不可安全解释的 pipe/redirection/expansion 直接拒绝；
- `eval`、不可信 `source`、动态执行和危险删除直接拒绝；
- 其余命令在 `default` 下请求审批（Desktop 可建议严格 command_prefix 会话授权），`full-access` 下允许；
- `full-access` 下 Bash 不进沙箱，硬拒绝仍生效；其他模式下出沙箱须带 `justification` 并每次批准（[沙箱设计](agent-沙箱设计.md)第 9 节）；
- 批准 Bash 不隐式批准外部目录；
- 不生成自由命令 pattern；符合既有前缀分析规则的命令可生成限定 workspace 的 Session Grant；
- sandbox 或 executor 无法表达请求边界时 fail-closed。

未来 Bash AST、命令 pattern 与跨平台 sandbox 必须另立设计和计划，不能扩展本轮类型后直接开放。

## 17. Host 行为

### Desktop

- 支持 `default/full-access`；
- 支持 `once/session/deny`，main 校验 typed IPC，Renderer 不接触 Journal writer；
- exact 默认可见，subtree 只有在用户展开目录范围选择后可选；
- 当前 Session Grant 可查看并按 `grantId` 撤销。

### CLI

- 只接受 `default/full-access`；
- 交互审批只支持 `once/deny`；
- 非交互模式遇到 ask 返回稳定 `APPROVAL_REQUIRED`；
- 不签发、不恢复、不消费 Session Grant；
- resume 未显式指定 mode 时使用 Session 已记录 mode。

## 18. 直接切换规则

本设计不包含兼容层：

- 删除 `trusted`、`yolo` 及其自动批准分支；
- 删除旧 `allow | deny` approval decision；
- 删除 Desktop `allow_similar` 到普通 allow 的归一化；
- 删除旧 `approval/asked`、`approval/decided`、`approval/policy`、`permission/preset` 的当前 codec 和生产写入；
- 不双写新旧事件；
- 不为旧权限记录提供迁移脚本或 alias；
- 含旧 required 权限事件的历史 Session 可以降级为 browse-only，不允许按旧语义恢复执行。

这是一条有意的一次性切换边界。执行计划必须在发布说明和人工验收中明确历史 Session 的影响。

## 19. 验收标准

自动化至少覆盖：

- 完整决策矩阵；
- default/full-access scope；
- existing/missing/symlink/非普通文件 canonicalization；
- protected、once-only、normal 分类；
- once 防重放、超时、迟到 decision、abort 和 lease 失效；
- 审批后路径、mode、Host ceiling 变化；
- Journal strict codec、mode 恢复和损坏 fail-closed；
- Main Agent 与 Subagent 隔离；
- Desktop 的 once/session/deny 与 CLI 的 once/deny Host 行为；
- `trusted/yolo` 和旧 approval 类型从源码、构建产物和 CLI 帮助中消失。

Session Grant 自动化另外覆盖 exact/subtree 路径段匹配、多资源全覆盖、Session/Agent/audience/policyVersion 隔离、过期、撤销 tombstone、suggestionId 校验以及 Desktop/CLI Host capability 差异。

人工验收至少覆盖：

- Desktop 三种 mode 的真实文件访问；
- once、mode 恢复和敏感资源；
- hard deny 不出现强制执行入口；
- CLI 只显示 once/deny；
- Electron reload、Session 切换和 mode 降级时无陈旧审批继续执行；
- Session exact/subtree、撤销、重启恢复和三态主题。

自动化通过不代表跨平台 sandbox、真实 Browser、签名安装包或 Windows/Linux enforcement 已验收。

## 20. 排除方案

- 用 Permission Preset 组合 mode 与 approval policy；
- `full-access` 自动批准所有工具；
- 工具权限函数覆盖全局边界；
- Renderer 直接创建或持久化 Grant；
- 任意 glob 字符串作为文件 Grant；
- approval 改变整个 Session 的 standing mode；
- Subagent 默认继承主 Agent Grant；
- 首 token Bash 前缀授权；
- Permission 替代 OS sandbox；
- 为旧 permission API、事件或模式保留兼容 alias。


## 2026-10 自动审批与查询会话授权

`auto-review` 沿用 default 的文件范围，先检查硬规则与已有 Grant；剩余 ask 交给 `packages/auto-review` 的 `approval.auto-review` 服务。插件只有一次无工具 LLM 判断，输出 `{approved:boolean, reason?:string|null}`。Runtime 在 30 秒内接受 true 后仍执行资源/模式/取消复验；false、缺失插件、坏格式、错误、超时回原人工卡片。插件不发 Grant、不执行工具。切回 default 即停止自动判断。未配置自动审批 route 的 Host 会回人工，CLI 入口仍只显式提供 default/full-access。

Desktop「模型与生成 → 自动审批模型」默认为跟随会话模型，可指定已有连接模型。不可用时不改用别的模型。固定 prompt 位于插件 `src/prompt.ts`；上下文取原始 user/message 与 assistant/message 的文本（保留人类答复的提议上下文）、近期 24 条调用/状态、完整当前参数与资源、实际工作区及沙箱不保证隔离的事实。普通工具结果与 reasoning 不发送；原始用户上下文超过 64k 字符或总输入超过 96k 字符回人工，不静默截断授权。判断期间 journal 改变则丢弃判断。当前无独立人工问答工具，未来如增加必须明确其可信用户答复来源后接入。

现有 `tool/result` 仅增加两个可选字段：`approvalMode: auto | manual | session` 与 `approvalReason?: string | null`。它们表示实际审批路径；自动不允许/失败后人工允许记 manual，并附简短回退说明。工具执行失败仍记录。缺字段的旧事件继续读取；这些字段不产生恢复授权，也不增加事件类型。自动判断未完成就崩溃时沿用现有工具恢复语义。

查询名单与限制以 [shell-tools README](../../../packages/tools/shell-tools/README.md) 为准。git -C 与明确查询目标做 realpath 工作区校验；未知选项、外部目标、敏感文件、跟随链接参数、复合命令不提供新会话建议。目录型查询的深层内容与项目脚本不构成文件系统隔离，本次不增强 sandbox。

参考：Codex guardian 的 action/context 分离、Claude Code 2.1.302 本地制品对原始用户消息与普通工具输出的区别处理，以及 tmp/deepseek-harness 的 experimental/auto-review 接入位置；只借鉴职责与上下文取舍，不复制外部执行权限设置。
