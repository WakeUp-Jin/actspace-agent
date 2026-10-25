# 沙箱第一期：地基 + 工具沙箱 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261025-sandbox-v1-tool-sandbox.md`
- **执行模式**：交互
- **开始时间**：2026-10-25
- **结束时间**：进行中

## 执行时间线

### 步骤 1：T0 实测 nono 0.80.0 与 Cordis 可选依赖

- **操作**：在 `tmp/sandbox-spike/` 下载 `nono-v0.80.0-aarch64-apple-darwin.tar.gz` 与 `-aarch64-unknown-linux-gnu.tar.gz`，SHA256 与上游 `SHA256SUMS.txt` 一致；在 `tmp/nono-src/` 检出 v0.80.0 源码核对行为。macOS 在本机（Darwin 25.3.0，arm64）测，Linux 在 Docker Desktop（`node:22-bookworm-slim`，内核 6.12.76-linuxkit，支持 Landlock）测。
- **影响文件**：只有 `tmp/` 下的实验文件。
- **结论**：
  1. **权限清单不能授权 `/`、`/Users`、`$HOME`。** nono 把 `~/.nono` 与 `$XDG_STATE_HOME/nono`（默认 `~/.local/state/nono`）当作受保护目录，权限清单模式下授权它们的任何上级目录都会报错（`crates/nono-cli/src/sandbox_prepare.rs` 清单分支把 `allow_parent_of_protected` 写死为 `false`）。
  2. **权限清单的 `deny` 被完全忽略。** 清单分支把 `deny_paths` 写死为空（`manifest_convert.rs` 注释说 deny 由 CLI 层处理，但清单分支没有处理）。实测 `deny` 写了 `.git/config`，沙箱内仍能写入。`~/.ssh` 读不到只是因为没有授权它。
  3. **“全部可读，减去若干目录”可以用“拆分覆盖”表达，macOS 与 Linux 都成立。** 从 `/` 开始：目录不是任何排除路径的上级就整体授权；是上级就展开子项递归；排除路径本身跳过；符号链接按目标类型授权，目标不存在的跳过（nono 遇到不存在的路径直接失败）。本机生成 113 条授权，Linux 容器 25 条。实测两边都能读到工作区以外的文件、读不到 `~/.ssh` 与受保护目录，`git`、`node`、`pnpm`、`curl` 正常。
  4. **“工作区可写但 `.git/hooks`、`.git/config` 只读”：macOS 只能用 profile 模式做到，Linux 做不到。** macOS 用 profile 的 `unsafe_macos_seatbelt_rules` 写 `(deny file-write* (subpath ".git/hooks") (literal ".git/config"))`，实测写入被拒、`git status` 正常。Landlock 只能按目录层级累加授权，无法在可写目录里挖出只读子目录；把工作区拆开授权又会让工作区根目录与 `.git` 根目录无法新建文件（git 要写 `.git/index.lock`），不可用。
  5. **profile 模式总会带上 nono 的必选规则组**：凭据目录、钥匙串、浏览器数据、macOS 私有数据、shell 历史、shell 配置文件。可以用 `bypass_protection` 逐个放开（实测放开 `~/.zshrc` 后可读）。
  6. **钥匙串**：两种模式下 `security find-internet-password`、`gh auth status`、`git credential fill` 都失败；现有 Seatbelt 规则不拦。
  7. **网络**：`network.mode: "blocked"` 在 macOS 与 Linux 上都能断网，`git status`、`node` 不受影响。
  8. **`NONO_*` 环境变量会改变 nono 的行为。** `NONO_ALLOW`、`NONO_PROFILE` 等对应命令行参数：权限清单模式下与 `-c` 冲突直接报错，profile 模式下会追加授权。启动 nono 时必须去掉所有 `NONO_*` 变量。
  9. **额外耗时**（`/bin/zsh -c true`，20 次中位数）：直接执行 5.4ms，`sandbox-exec` 11.9ms，nono 权限清单模式 36.9ms，nono profile 模式 61.0ms。比调研文档的 4–5ms 高，原因是授权条目多；相对一次 bash 命令可以接受。
  10. **进程**：`wrap` 后拿到的进程就是目标命令；沙箱内 `sleep & kill %1` 正常。
  11. **Cordis 准入不支持可选依赖。** `mountIsolatedCordisTree` 对 `injects` 中未提供的服务直接报 `Undeclared Harness dependency`；默认 Harness 的 `contracts.services.requires` 由 `injects` 生成，没有 `optional`。Cordis 4 的 `ctx.get(name)` 不检查 inject，服务不存在时返回 `undefined`。
- **决定**（2026-10-25 用户确认）：
  - 新增能力 `filesystem.write-deny`（在可写目录中禁止写入指定路径），`tool` 模板列为必需。Linux 上 nono 报告 `unsupported`，第一期 Linux 的 bash 走审批，直到以后有能表达它的后端。
  - 接受 nono 拦截钥匙串：沙箱内 `git push`、`gh` 失败时由 Agent 申请沙箱外执行。
  - nono 后端：macOS 用 profile 模式（拆分覆盖授权 + `unsafe_macos_seatbelt_rules` 禁止写入 + 放开登录 shell 读取的配置文件）；Linux 用权限清单模式（拆分覆盖授权）。两边都去掉 `NONO_*` 环境变量。
  - `tool` 模板的禁止读取列表改为显式列出 nono 必选规则组中的凭据、钥匙串、浏览器数据、macOS 私有数据、shell 历史路径，Seatbelt 后端同样执行，策略不依赖后端自带规则。
  - 可选依赖作为 T5 的子任务补进准入：组合里有提供者时照常注入（保证启动顺序），没有时不注入，并把该名字隔离，防止拿到 Host 上的同名服务。
- **验证**：上述命令输出见本步骤结论；实验脚本在 `tmp/sandbox-spike/scripts/`。

## 遇到的问题

- **问题**：权限清单的 `deny` 不生效。
  - **原因**：nono 0.80.0 清单分支不处理 `deny`。
  - **应对**：不依赖 `deny`，禁止读取用拆分覆盖表达，禁止写入用 macOS profile 模式的 Seatbelt 规则。

## 跳过或推迟的事项

- 无。
