# 工具沙箱的出沙箱与回退 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261025-sandbox-escape-fallback.md`
- **执行模式**：交互
- **开始时间**：2026-10-25
- **结束时间**：进行中

## 执行时间线

### 步骤 1：T0 实测拦截特征

- **操作**：`tmp/sandbox-escape-spike/denials.mjs` 用第一期的 `sandboxTemplate("tool")` 与真实后端（nono 0.80.0、Seatbelt）执行，请求形状与 shell-tools 的 `sandboxedRequest` 相同（`/bin/zsh -lc`，可写：工作区、scratch、`$TMPDIR`）。工作区放在 `~` 下并 `git init`，与真实仓库的位置一致。输出见 `tmp/sandbox-escape-spike/denials-darwin*.txt`。
- **结论**（macOS，两个后端结果相同，除钥匙串外）：

  | 场景 | 退出码 | 输出里的特征 |
  |---|---|---|
  | `touch ~/x`、`mkdir ~/x` | 1 | `Operation not permitted` |
  | Node 写 `~` | 1 | `EPERM` / `operation not permitted` |
  | `touch .git/hooks/x` | 1 | `Operation not permitted` |
  | `git config`（写 `.git/config`） | 4 | `could not write config file .git/config: Operation not permitted` |
  | `npm cache add --cache ~/…` | 1 | `npm error code EPERM`；最后几行却是误导性的 “root-owned files … sudo chown” |
  | `pnpm add --store-dir ~/…` | 255（`--reporter silent` 时没有任何输出） | `EPERM: operation not permitted, mkdir …` |
  | `security find-generic-password` | 44 | nono：`One or more parameters passed to a function were not valid`；Seatbelt：与沙箱外相同的“找不到” |
  | `git credential-osxkeychain get` | nono 1（`failed to get: -50`）；Seatbelt 0 | — |
  | `gh auth status` | 1 | 两个后端都报 `The token in default is invalid`（沙箱外正常），没有任何权限字样 |
  | 对照：读 `chmod 000` 的工作区文件 | 1 | `Permission denied` |
  | 对照：找不到命令 | 127 | `command not found` |
  | 对照：`ls --bad-option` | 1（BSD ls） | `unrecognized option` |

  1. **macOS 上沙箱拦截写入时，报的都是 `Operation not permitted`（EPERM）。** 命令自己的权限错误是 `Permission denied`（EACCES），两者可以区分，所以匹配不加 `permission denied`。Linux 的 Landlock 拦截时报 EACCES，但 Linux 工具沙箱目前不可用，等它可用时再加。
  2. **特征串定为 `operation not permitted` 与 `eperm`**，忽略大小写，在输出末尾里查找。npm 的最后几行是误导性文字，`EPERM` 在前面，所以要查找足够长的末尾，不能只看最后几行（T3 用输出文件末尾 8KB）。
  3. **钥匙串没有稳定的特征。**
     - `gh` 只报“token 无效”，Seatbelt 下也一样；
     - nono 下 `security`、`git credential-osxkeychain` 报的是 `-50` 参数错误。
     - 按计划，钥匙串不做专门匹配，只在工具描述与参数描述里点名“`git push`（HTTPS）和 `gh` 需要钥匙串，沙箱里会失败，`gh` 会误报 token 无效”。
  4. **退出码**：被拦截的命令退出码有 1、4、255，所以只排除 2、126、127。
- **影响文件**：只有 `tmp/sandbox-escape-spike/`。实验在 `~` 下建的临时工作区已删除。

### 步骤 2：T1 tools-runtime 与管理器

- **操作**：
  - `ResourceExtractionContext` 加 `mode`。`prepared-execution.ts` 的首次提取传入当前模式；执行前复查（`#recheck`）传入准入时的模式。
  - 管理器 `execution.ts`：继承模式下，`isolation` 一律报 `inherited`，请求为 `none` 时也一样。
- **结果**：
  - 新增测试：tools-runtime 断言提取资源拿到的模式（`full-access` 与 `default` 各一次调用，首次提取加复查共四次）；管理器断言继承模式加 `isolation: "none"` 报 `inherited`。
  - shell-tools 的 lifecycle 测试补上 `mode`（T2 会重写这些用例）。
  - `pnpm --filter @actspace/tools-runtime test` 48 通过，`@actspace/sandbox` 30 通过，`@actspace/tools-shell-tools` 109 通过，`pnpm typecheck` 通过。
- **影响文件**：`packages/tools/runtime/src/{permission/types.ts,prepared-execution.ts,test/runtime.test.ts}`、`packages/sandbox/manager/src/{execution.ts,test/execution.test.ts}`、`packages/tools/shell-tools/src/test/lifecycle.test.ts`。

### 步骤 3：T2 shell-tools 参数与进沙箱判断

- **操作**：
  - bash schema 删除 `requiredPermissions`，加入 `sandbox_permissions`（enum `["require_escalated"]`）与 `justification`（1–200 字），参数描述与工具描述按设计第 9 节写（英文）。
  - `extractResources`：`noSandbox = mode === "full-access" || 申请了出沙箱 || 沙箱不可用`。
  - `evaluate`：硬拒绝之后检查参数是否成对，不成对（含 `justification` 只有空白）返回 `deny`、`BASH_ESCALATION_INVALID`；然后 `full-access` 放行；申请出沙箱时 ask 的原因是 `justification`，`reusable: false`。
  - `admittedNoSandbox` 的参数回落改读 `sandbox_permissions`；`SANDBOX_PREPARE_FAILED` 提示改为新参数名。
  - 用到旧参数的测试与夹具一并改：shell-tools 两个测试文件、Desktop `runtime-v2-output-reference-flow.test.ts`、`scripts/test/host-tools-process.test.mjs`、`scripts/test/fixtures/agent-provider.mjs`。
- **决定**：参数不成对在所有模式下都拒绝，`full-access` 也一样。设计说的“`full-access` 下带了也照常执行”指成对的参数；不成对是调用写错了，各模式行为一致更好懂。
- **结果**：
  - shell-tools 111 通过（新增：出沙箱成对与不成对、`full-access` 下 `noSandbox: true`、审批原因是 `justification`、没有前缀授权建议；schema 拒绝旧参数、非法取值与超长理由）。
  - `@actspace/agent-cli` 16 通过（含继承模式加 `full-access` 标 `sandbox=inherited`）；Desktop 大输出流程测试通过（要先重新构建 shell-tools）；`pnpm test:agent-host:process` 7 通过（要先重新构建 CLI）。
  - `pnpm test:agent-cli:process` 中 SIGINT、SIGTERM 两条 “drains background descendants” 失败（恢复后请求数为 2，期望 1）；在 HEAD 上（暂存改动、重新构建）同样失败，与本次改动无关。
- **影响文件**：`packages/tools/shell-tools/src/{plugin.ts,node-ports.ts,test/lifecycle.test.ts,test/node-ports.test.ts}`、`apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts`、`scripts/test/{host-tools-process.test.mjs,fixtures/agent-provider.mjs}`。

## 遇到的问题

- T1 新测试起初只期望三次提取，实际每次准入都会在执行前复查一次（`full-access` 也一样），改为四次。
- 第二轮实测没有设置代理，`git ls-remote` 连不上 github.com，与沙箱无关。第一轮设置了代理，沙箱内外都成功（公开仓库，不需要凭据），说明工具沙箱不限网络。

## 跳过或推迟的事项

- Linux 拦截特征（EACCES）：Linux 工具沙箱可用时再补。
- `pnpm test:agent-cli:process` 的两条后台任务恢复测试在 HEAD 上就失败，不在本计划范围，没有处理。
