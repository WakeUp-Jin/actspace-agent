## [2026-11-14 16:30] | Task: 脚本执行计划收尾，进行中计划索引和技术债表里过期的内容清掉

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （接上一轮文档减负的汇报）继续。汇报里这一项是：进行中计划索引有 3 行过期；「脚本执行」按新规则可以连同执行记录删掉，没做的登记到技术债表；技术债表里已解决并划掉的行一起删。

### 🛠 Changes Overview

**Scope:** `docs/exec-plans/`、`docs/exec-runs/`、`docs/SECURITY.md`、`docs/design-docs/tool-system/agent-script-execution.md`

**Key Actions:**

- **脚本执行计划收尾**：T1–T9 随 #72 在 2026-11-10 合入。删除 `active/20261109-script-execution.md` 和 `docs/exec-runs/20261109-script-execution/`（3 个文件，2.6 万字符），去掉索引行和设计文档里指向计划的链接。
- **索引另外两行**：契约分层的 P1 已随 #75 合入，索引和计划里还写着「待合入」；CI 提速写的下一步（拆 job、加缓存、desktop 分片）已经在 `main` 上。两行改成现状。
- **技术债表**：删掉 9 行已解决的。8 行是划掉的（Desktop 安全遗留 5 行、CI 与工程化遗留 3 行）；第 9 行「Electron / safeStorage 同步 API」没划掉，但和被划掉的 safeStorage 那行是同一件事，代码里已经没有同步调用。
- **补一条现行约束**：8 行里只有「Browser Bridge 安装」的现行做法别处没写，补进 `docs/SECURITY.md`「Electron 进程隔离」。
- **改一处和代码不一致的说法**：脚本执行设计文档 2.3 节写 Windows 的 shim 目录里是 `actspace-python.cmd`；`prepare.mjs` 实际两个都写，`ACTSPACE_PYTHON` 指向 `.cmd`。

### 🧠 Design Intent (Why)

进行中计划的索引是每个任务开头都可能读到的地方，「待合入」「下一步拆 job」这类过期状态会让人以为事情还没做。技术债表同理：划掉的行每次读表都要付费，内容却是「已经做完了」。

`PLANS_GUIDE.md` 的规则是实现做完就收尾，只剩人工验收的计划也一样。脚本执行的执行摘要写的是交互模式，直接适用。

删每一行之前都核对过它讲的现行规则是否已经在正式文档里：子进程环境、IPC 审计、CSP 在 `docs/SECURITY.md`，katex 的 overrides、发布矩阵、osv-scan 不是必需检查在 `docs/CICD.md`，safeStorage 看代码即可。

上一轮汇报里说脚本执行「没做的打包冒烟登记到技术债表」，核对后不成立：#72 合入前，`release.yml` 在它的最后一个提交上跑过四个平台的打包，`verify-python-runtime.mjs` 四个平台都通过。真正没验的是下面前三项，登记的是它们。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：这轮只改文档。跑了 `./scripts/ci.sh` 和 markdownlint，都通过。
- **遗留**（前三项来自被删掉的脚本执行执行摘要，已登记到 `tech-debt-tracker.md`）：
  - 执行摘要里六项「必须验证」都没有做过的记录：内联脚本的单次审批、`$(…)` 的拒绝文案、脚本文件的授权复用、打包版里用随包 Python 处理 PDF、数据扩展下载、Bash 卡片的脚本形态。登记在「没有实机验证记录的功能」。
  - Windows 上 `bash` 工具没有可用的 shell（代码在 macOS 以外一律启动 `/bin/bash -lc`），随包 Python 在 Windows 上打包、校验都通过，但模型叫不到。设计文档只写了「另立设计」。登记在「CI 与工程化遗留」。
  - 配了 Developer ID 证书时随包 Python 的逐文件签名从来没执行过：`release.yml` 至今只在 PR 上跑过，签名变量每次都是空的。登记在「CI 与工程化遗留」。
  - 执行摘要里还有一条后续建议没登记成技术债，只记在这里：看真实会话里模型用 heredoc 和 `-c` 的比例（Context 面板「Bash 命令」统计），再决定提示词里「超过约 20 行就写成文件」的阈值要不要调。
  - Desktop settings 写入一致性的计划仍在 `active/`：D1–D4 从 2026-10-07 起没有拍板，这轮没有替用户做决定，也没有把它降级。
  - CI 提速的计划文件没动，它的收尾在未合并的 #92 里。
  - 技术债表只删了已解决的行，其余各行没有逐条对着代码复核。

### 📁 Files Modified

- `docs/exec-plans/active/20261109-script-execution.md`、`docs/exec-runs/20261109-script-execution/`（删除）
- `docs/exec-plans/README.md`
- `docs/exec-plans/active/20261109-shared-contract-split.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `docs/SECURITY.md`
- `docs/design-docs/tool-system/agent-script-execution.md`
