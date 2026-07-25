# Bash 沙盒执行层（E5 第一期）

> **状态：代码完成（2026-07-04），待手工验收。** 全部任务已实现并通过测试
> （agent-core 705 / shared 34 / desktop 370，含 darwin 真沙盒集成测试）。
> 实现中额外修复：scheduler `renderResult` 覆盖 `data` 导致 bridge 拿不到
> 结构化结果（backgrounded taskId / sandboxed 均受影响），已通过
> `ToolResult.structured` 保留原始结构化结果修复，详见 history。

消费 `docs/design-docs/execution-safety/agent-bash工具设计文档.md` 的 Phase E5（沙盒设计 + 附录 Seatbelt 模板与生成契约），并落实 `agent-bash-policy-allowlist-design.md` Phase 3 中"沙盒落地后权限层放宽"的联动。

## 目标

把 bash 工具从「直接 spawn + allowlist 审批」升级为「**沙盒优先执行**」：

1. macOS 上默认用 `/usr/bin/sandbox-exec` + 动态生成的 Seatbelt profile 执行命令，约束继承整个进程树。
2. 沙盒可用时权限层放宽：非 allowlist 命令不再 ask，直接沙盒内自动运行（hard reject 仍然生效）。
3. 失败且有沙盒拦截证据 → 模型携带 `requiredPermissions: ["no_sandbox"]` 重试 → **强制 ask 审批** → 用户批准后真实环境重跑。
4. 前端展示命令执行环境（沙盒 / 真实环境）。

## 第一期范围裁剪（与设计文档的偏差，完成后回写设计文档）

| 设计项 | 第一期决策 | 理由 |
| --- | --- | --- |
| 网络域名过滤代理 | **不做**；profile 内 `(allow network*)` 放行网络 | 代理是自研路线最大增量（代理本身 + CONNECT/SNI 过滤 + 不认代理变量的工具兜底），单独立项；第一期沙盒只收文件系统 |
| `requiredPermissions` 取值 | 只支持 `"no_sandbox"` | `"full_network"` 在网络放行的第一期没有语义，随代理阶段引入 |
| 违规标注两条腿 | 只做输出模式匹配（`Operation not permitted` 等）；`log stream` 监听不做 | log stream 是精确归因增强，不阻塞升级闭环；记 tech debt |
| Linux bwrap | 不做，探测非 darwin 即降级真实环境 | 桌面产品当前只发 macOS |
| 升级证据参数 | 不加新参数；引导模型把证据写进 `intent`（审批卡片已展示 intent） | 避免为一句展示文本扩契约 |

## 模块与任务

### T1 sandbox 模块（`packages/agent-core/src/tools/tools/bash/sandbox/`）

- [x] `profile.ts`：Seatbelt profile 生成器。
  - `(deny default)` 基线 + essential allows（抽取自 srt `macos-sandbox-utils.ts`，文件头保留 Apache-2.0 derived-from 归属）。
  - 文件读：广域 `(allow file-read*)` + 敏感路径定向 deny（`~/.ssh` `~/.aws` `~/.gnupg` `~/.kube` `~/.docker` + `~/.netrc`），Seatbelt last-match-wins，deny 置后。敏感清单可注入（测试用临时目录替身，不依赖真实 HOME）。
  - 文件写：只放行 `WORKSPACE_ROOT` / `SESSION_TMP` / `DARWIN_TMP`（`os.tmpdir()`）+ `/dev/null|stdout|stderr|tty`。
  - **路径一律 `(param "X")`，profile 源码零路径拼接**（注入面约束，硬规则）。
  - 网络：第一期 `(allow network*)`。
  - 不做 move-blocking 规则：绕过读限制需要写敏感路径，而写白名单外全拒，旁路不成立（比 srt 简化的依据）。
- [x] `index.ts`：`probeSandbox()`（darwin + `/usr/bin/sandbox-exec` 存在 + `ACTSPACE_BASH_NO_SANDBOX` 未设，模块级缓存）；`buildSandboxSpawn()`（写 profile 到会话 tmp、mkdir、返回 command/args/env——env 注入 `TMPDIR=SESSION_TMP`）。
- [x] `violation.ts`：输出模式匹配（`Operation not permitted` / `EPERM` / `Read-only file system`），命中返回标注文本。
- [x] env：`ACTSPACE_BASH_NO_SANDBOX` 开关（调试/测试逃生门）。

### T2 权限层（`permissions.ts`）

- [x] `bashCheckPermissions(args, workspaceRoot, options?)` 增加 `options.sandboxAvailable`（默认 false，既有测试不受影响）。
- [x] `requiredPermissions` 参数校验：非空数组且只认 `"no_sandbox"`；携带即 **decision: "ask"**（无视 allowlist 与沙盒放宽），reason 说明"升级到真实环境"，riskLevel high，`sanitizedArgs` 透传该字段。
- [x] 沙盒放宽：`sandboxAvailable && !requiredPermissions` 时非 allowlist 命令由 ask → allow。hard reject（控制字符 / 危险删除 / eval / 管道语法）与 `ACTSPACE_BASH_ALWAYS_ASK` 优先级不变。

### T3 executor（`executor.ts`）

- [x] `BashExecutorConfig.sandbox?: boolean`（默认 false，`createBashTool` 传探测结果，直接调 executor 的测试不受影响）。
- [x] 有效沙盒 = `config.sandbox && probeSandbox() && !requiredPermissions.includes("no_sandbox")`；命中则 spawn 换 `sandbox-exec -f <profile> -D … bash -lc <command>`。
- [x] `BashResult` / `BashBackgroundedResult` 增加 `sandboxed: boolean`；失败且 sandboxed 且输出命中违规模式 → `sandboxViolationHint` 填标注文本。
- [x] render：回填文本带执行环境行；违规标注 + 升级引导（"携带 requiredPermissions: [\"no_sandbox\"] 与证据 intent 重试，将触发用户审批"）。

### T4 工具描述（`definition.ts`）

- [x] `requiredPermissions` 参数 schema + 描述：默认沙盒执行；仅当输出出现沙盒拦截证据（清单写明）才升级重试；升级时把证据写进 intent；逐条评估不惯性携带；注意重复副作用。

### T5 shared 契约 + bridge + 前端

- [x] `BashPreview` / MessageBlock bash 增 `sandboxed?: boolean`。
- [x] bridge：从 `record.result.data.sandboxed` 回填 preview（前台 + backgrounded 两种 result）。
- [x] `BashRunBlock`：徽标——`沙盒`（灰、弱化）/ `真实环境`（醒目）；审批卡片的升级原因经由 reason + intent 已可见，第一期不加独立"沙盒→升级"标签态。
- [x] selectors 映射透传。

### T6 测试

- [x] profile 单测：deny default 存在、路径零拼接（源码不含绝对路径字面量）、写白名单只有三区 + 设备文件、敏感 deny 在广域 allow 之后。
- [x] 权限回归：sandboxAvailable 放宽、requiredPermissions 强制 ask、hard reject 优先。
- [x] 沙盒集成测试（darwin + 运行时探测可用才跑，嵌套沙盒环境自动 skip）：workspace 内写成功；workspace 外写失败且输出含违规标注；敏感目录（注入的临时替身）读被拒；`no_sandbox` 时真实环境可写外部路径。
- [x] 断言关键字不得是命令文本子串（见 `docs/learnings/2026-07/testing-assertion-poisoned-by-command-echo.md`）。

### T7 文档同步

- [x] 设计文档状态更新（E5 第一期已实现 + 偏差表）。
- [x] tech-debt：log stream 违规监听、网络代理阶段、Linux bwrap。
- [x] history + learnings（若命中标准）。

## 关键架构事实

- 权限检查在 `ToolScheduler.execute`：ask 批准后 `runHandler(tool, permission.sanitizedArgs ?? args)` —— **升级审批无需新状态机**：requiredPermissions 经 sanitizedArgs 透传，handler 拿到即知道"已获批真实环境"。
- 落盘/进程底座（`startProcessSink`）不动，只换 spawn 的 command/args/env。
- 沙盒探测必须模块级缓存且可被测试逃生门绕开；executor 层默认关（direct-call 测试大量存在）。

## 全局验证

- `pnpm typecheck` + agent-core / shared / desktop 相关测试。
- 手工验收：沙盒内 `echo` 自动运行（无审批）；`touch ~/x` 失败带标注；模型升级重试触发审批卡片；批准后真实环境成功；前端徽标正确。

## 后续轮：文本层规则分级（2026-07-04 完成）

沙盒放宽后的补课：不能因为有沙盒兜底就把 workspace 内的不可逆操作（rm、git reset --hard）也自动放行——沙盒管不住 workspace 内部，删除/丢弃改动没有回滚路径。

- [x] 新建 `command-rules.ts`：三级规则表单一事实源（hard reject / 不可逆 ask / allowlist），`permissions.ts` 只留决策编排（顺序：hard reject → requiredPermissions ask → 不可逆 ask → ALWAYS_ASK → allowlist allow → 沙盒放宽 allow → 兜底 ask）。
- [x] hard reject 新增：删除/移动 `.git` 本体（rm/rmdir/mv 目标为 `.git`）。
- [x] 不可逆 ask 清单（沙盒放宽不豁免，`allowSimilar: false`）：`rm`/`rmdir`、`find -delete`、`dd`/`shred`/`truncate`、`git reset --hard/--merge`、`git clean`（非 dry-run）、`git restore`、`git checkout` 丢弃形态、`git stash drop/clear`、`git push --force[-with-lease]`。
- [x] profile 定向禁写 workspace 根仓库 `.git/hooks/**`（subpath）+ `.git/config`（literal），置于写放行之后（last-match-wins）；只保护根仓库，避免沙盒内 `git clone` / 子目录 `git init` 全灭。
- [x] definition 描述补不可逆审批说明 + 非破坏性替代引导。
- [x] 测试：不可逆清单逐条 ask（含链式命令中的段命中）+ 安全近邻逐条 allow（`git checkout main`、`git clean -n` 等）+ `.git` 本体 deny + profile 顺序断言 + darwin 集成（`mkdir .git` 成功 / `.git/hooks`、`.git/config` 写被拦）。
- [x] 设计文档「文本层规则分级表」+ 决策管道图更新。
