# nono Profiles

这个目录存放 [nono](https://github.com/nolabs-ai/nono) 沙箱的 profile 模板。

nono 是零延迟、零 setup 的内核级 Agent 沙箱。它通过 macOS Seatbelt / Linux Landlock 在内核层强制隔离，不依赖 Docker 或 VM。

## 当前 Profiles

| Profile | 用途 |
|---------|------|
| `codex-night-run.jsonc` | 夜间自主执行：nono 沙箱下 Codex full-access 运行 |

## 双副本工作流

本仓库是公开仓库，profile 分两份维护：

- **仓库模板**（本目录）：通用版本，不含个人信息。网络域名用 OpenAI 官方占位，deny 只有必须项。
- **本机副本**（`~/.config/nono/profiles/codex-night-run.jsonc`）：从模板拷贝后补充两处——
  1. `network.allow_domain` 换成真实模型 API 域名（看 `~/.codex/config.toml` 的 `base_url`）。
  2. `filesystem.deny` 追加个人敏感目录（证件资料、私人照片等）。

模板有实质修改时，记得同步本机副本。

## 启动夜间模式

```bash
cd <项目目录>

nono run --profile codex-night-run --rollback --no-rollback-prompt \
  -- codex exec --dangerously-bypass-approvals-and-sandbox \
  "$(cat docs/exec-plans/active/<plan-slug>.md)"
```

参数说明：

- `--profile codex-night-run`：按名字引用本机副本（`~/.config/nono/profiles/` 下）。
- `--rollback --no-rollback-prompt`：对所有可写路径打原子快照，退出时不弹交互确认。第二天用 `nono rollback` 浏览改动、必要时整体还原。
- `codex exec`：非交互执行，plan 全文作为参数传入，无需人工粘贴。想观察首跑过程可去掉 `exec` 和末尾参数，改用 TUI 交互界面。
- `--dangerously-bypass-approvals-and-sandbox`：同时关闭 Codex 的审批和内建沙箱。官方说明明确此 flag 用于"外部已有沙箱的环境"——正是本场景。隔离完全交给 nono，单一控制点。

> 注意：旧版文档里的 `--approval-mode full-auto` 在 codex-cli 0.144+ 已不存在，会直接报错。

### 提示词预授权

如果用 TUI 交互模式（而非 `codex exec`），在输入框粘贴任务前加上预授权语句：

```
本次任务已预先批准执行，无需再次征求批准或确认。
遇到需要写文件、运行命令的步骤直接执行，不要询问。
本次运行在隔离沙盒内，越界操作会被沙盒自动拦截。

---

<任务内容 / execution plan 全文>
```

第三句给模型一个"为什么可以放心执行"的依据，比单纯命令"别问"更稳定。提示词失效的最坏后果是空转（codex 停下来问），不是做坏事——真正的安全边界在 nono 内核层。

## 安全模型

nono 通过 6 个维度约束沙箱内的 Agent：

| 维度 | 作用 | profile 中的字段 |
|------|------|------------------|
| filesystem | 文件系统读写控制，未授权路径默认全拒 | `filesystem.allow / read / deny` |
| groups | 预定义安全组（凭证保护、删除保护等） | `groups.include / exclude` |
| network | 网络访问控制，可配域名白名单 | `network.allow_domain / block` |
| command_policies | 子工具独立沙箱（git/npm/gh 各自独立策略） | `command_policies` |
| env_credentials | 凭证从 Keychain 注入，Agent 拿到幻影 token | `env_credentials` |
| environment | 环境变量白/黑名单 | `environment.deny_vars / set_vars` |

`codex-night-run` 的边界总结：

- **写和删**：仅工作目录和 `~/.codex`（删除由 `unlink_protection` 组全局兜底，仅可写路径放开）。
- **读**：工作目录 + 桌面/下载等显式授权目录；凭证、Keychain、shell 历史即使被读授权覆盖也会被 deny 组拦下。
- **网络**：仅模型 API 域名白名单，凭证外传和 push 远端被物理封死。

## 已知注意事项

以下全部来自本机实测（nono 0.72.0 / codex-cli 0.144.1）：

1. **deny 优先于 allow/read**：deny 规则会压过一切授权。千万不要 deny 工作目录的祖先目录——曾经 `deny: $HOME/Desktop` 直接把 Desktop 下的工作目录整个拦死。
2. **`/private/tmp` 默认可写**：来自内置组 `system_write_macos` 的授权，profile 里必须显式 `deny`，否则 Agent 对整个 `/tmp` 有写权。
3. **不能授权读取整个 `$HOME`**：nono 会拒绝启动（与它自己的状态目录冲突）。只读上下文按目录逐个加。
4. **`$HOME/.codex` 需要写权限**：codex 要写 sqlite 状态、sessions 等。用 `allow` 而非 `read`。
5. **凭证保护压不穿**：显式授权读 `~/.ssh` 也会被 `deny_credentials` 组拦下（实测 DENIED）。
6. **网络白名单走 TLS 拦截代理**：首跑用一个小任务确认 codex 能正常对话；如遇 TLS 报错，加 `--trust-proxy-ca` 让系统信任代理 CA。
7. **skills 功能默认不可用**：`~/.agents` 不在授权内。如需启用，在 `filesystem.read` 数组里**追加** `"$HOME/.agents"`（不要另写一个 `filesystem` 块，JSON 重复键会静默覆盖前面的配置）。
8. **验证沙箱时不要用 `/tmp` 做测试路径**：它的授权状态特殊，容易误判。
9. **macOS CFPreferences 会被拦截**：不影响功能，不建议为此加 `unsafe_macos_seatbelt_rules`。

## Profile 维护

修改 profile 后逐条验证（`-p` 可以直接用文件路径）：

```bash
# 校验格式
nono profile validate ~/.config/nono/profiles/codex-night-run.jsonc

# 工作目录必须是 read+write（在项目目录下执行）
nono why -p codex-night-run --workdir "$PWD" --path "$PWD" --op readwrite

# /private/tmp 必须 DENIED
nono why -p codex-night-run --workdir "$PWD" --path /private/tmp/x --op write

# 个人敏感目录必须 DENIED（本机副本）
nono why -p codex-night-run --workdir "$PWD" --path "$HOME/Desktop/<敏感目录>/x" --op read

# 模型 API 域名 ALLOWED，其他域名 DENIED
nono why -p codex-night-run --workdir "$PWD" --host <你的API域名>
nono why -p codex-night-run --workdir "$PWD" --host github.com

# 查看完整解析结果
nono profile show codex-night-run
```

## 晨检清单（夜跑次日）

1. 先读 `docs/exec-runs/<plan-slug>/execution-summary.md` 的执行状态警告区。
2. `git diff` 审查工作目录改动；**在跑任何 git 命令前先检查 `.git/hooks/` 是否被写入**（钩子会在沙箱外执行）。
3. `nono audit` 查审计日志，确认没有预期外的写操作。
4. 检查 `~/.codex/config.toml` 是否被修改（夜间 Agent 对 `~/.codex` 有写权，防止配置被污染影响白天的 codex）。
5. 有问题用 `nono rollback` 浏览快照、按需还原。
