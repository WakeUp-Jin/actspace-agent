# Agent 重构隔离验收环境

用于 `20261005-agent-refactor-final-closeout` 的真实 Electron/Host 验收。只创建新隔离目录，使用 synthetic credential，不读取或复制用户设置。先从当前源码完成 `pnpm --filter @actspace/agent-cli... build`。

```sh
node scripts/acceptance/agent-refactor/fixture.mjs start --root /tmp/actspace-final-cu-new
node scripts/acceptance/agent-refactor/fixture.mjs control --root /tmp/actspace-final-cu-new --action hold
node scripts/acceptance/agent-refactor/fixture.mjs control --root /tmp/actspace-final-cu-new --action release
node scripts/acceptance/agent-refactor/fixture.mjs stop --root /tmp/actspace-final-cu-new
```

start 输出并保存 `fixture.json`：Provider/Host/WSS/control 动态回环端口、PID、证书、独立数据目录、Desktop 启动命令和 Host 配对命令。执行生成的 `start-desktop.sh`；以日志 `[dev-runtime]` 的 appId 操作应用。首屏必须核实 workspace 是 fixture 的 workspace；新建会话若落到默认 Downloads，通过 UI 选择隔离 workspace 后再发任务。

控制命令仅访问带本次 instanceId 的独立 control HTTP 端口；产品 Provider/WSS 端口不接受控制。支持 hold/release、summary-hold/summary-release、summary-error/summary-ok、title-hold/title-release、offline/online、upload-error/upload-ok、status。stop 等待本次拥有的 Host 退出，不按名称杀进程；保留证据，重复 stop 安全。已停止目录保留原状。`resume --root <原目录>` 只用于继续同一验收：沿用 Provider/WSS/Host/control 端口、设置、证书和数据，不重新 seed；Host 重新启动，控制 instanceId 更新，Provider 请求编号继续。新一轮独立验收仍创建新目录。

`resume` 不绕过生产恢复检查。若期间重建了 Host 共享契约或固定产物，旧选择可能因指纹变化而阻断；保留原数据和诊断，通过生产维护流程处理后再继续。不能清空选择文件、重写 journal，或把维护后的恢复当作无维护升级通过。

Provider 标记：

- 普通文本：确定性流式回复；`FIXTURE_HOLD`：输出首段并等待 release。
- `FIXTURE_TOOL`：请求 Bash 审批，批准后写 `result.txt`，返回文件链接。
- `FIXTURE_LONG`：12 次工具步骤，产生可压缩历史。
- 测试 Skill 名为 `acceptance-fixture`，目录标记 `ACTSPACE_FIXTURE_SKILL`，正文标记 `ACTSPACE_FIXTURE_SKILL_BODY`；hasSkill 只检测正文，不能把目录可见当成技能已读取。
- 两个模型 fixture-main/fixture-alternate 均声明图片及 low/medium/high 推理档位。
- `valid.png` 是 32 × 32 不透明双色棋盘 PNG，`oversized.png` 大于当前 20 MiB 限制。

`provider-requests.jsonl` 记录请求 ID、模型、推理、图片/Skill 标记、摘要/标题判定、fixture 用户内容，不记录 Authorization。流式 hold 每 20 秒发送 SSE 注释心跳，避免客户端无流量超时干扰慢速原生操作；心跳不是模型内容，不改变产品预算或标题请求超时。只有观察到对应请求记录，才可释放 hold 并声称覆盖竞争状态。源码/请求日志不能代替界面操作。原生文件选择器不能用内部 API 注入代替。

当前 SSH 的 UI 连接只接受 alias/port，调用系统 SSH 默认配置；测试函数有 configFile seam，但 UI 没有独立配置路径入口。不得修改真实 `~/.ssh` 来假装隔离。SSH 自动化可按 `ACTSPACE_TEST_SSH=1` 运行，CU7.9 使用下述专用验收装配，不能改验 WSS 后写通过。

验收点、分组与签收依据见[验证附件](../../../docs/exec-plans/completed/20261005-agent-refactor-final-closeout/verification.md)。这是测试设施，不是产品后台服务或线上 Provider 验证。

## SSH 的真实界面隔离装配

无需增加产品设置或改用户 `~/.ssh`。测试 sshd 仅监听回环，使用独立密钥和固定 known_hosts；由于 macOS 的 `/private/tmp` 祖先目录可写，fixture 显式关闭 StrictModes 目录检查，密钥与配置仍限制访问。这不改变系统 SSH 服务设置。另起本机 Host/sshd，使用仅包含 synthetic Provider 的新目录：

```sh
node scripts/acceptance/agent-refactor/ssh-fixture.mjs --root /tmp/actspace-ssh-cu-new --provider http://127.0.0.1:PROVIDER_PORT/v1
```

读取该目录 `fixture.json`。先正常退出已有隔离 Desktop，再启动 renderer 与专用测试入口，保持原数据目录：

```sh
pnpm --filter @actspace/desktop dev:renderer
# 另一个终端；使用原 fixture 的实际绝对路径
ACTSPACE_DATA_DIR="/tmp/actspace-final-cu-new/desktop-data" ACTSPACE_WORKSPACE_ROOT="/tmp/actspace-final-cu-new/workspace" \
NODE_EXTRA_CA_CERTS="/tmp/actspace-final-cu-new/cert.pem" ACTSPACE_ACCEPTANCE_SSH_CONFIG="/tmp/actspace-ssh-cu-new/ssh_config" \
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 \
node scripts/run-electron-dev.mjs scripts/acceptance/agent-refactor/ssh-desktop-entry.cjs
```

测试入口先装配 preload，再加载未修改的生产 main。定制 Electron 应用会忽略 `NODE_OPTIONS=--require`，不能用该变量假定装配已生效。preload 只在 Electron main 对 `/usr/bin/ssh` 调用追加 `-F`，且只允许 `closeout-fixture`；其他 SSH 别名拒绝，防止访问真实配置。连接、认证、转发和关闭仍由原产品代码与系统 SSH/sshd 实现，不能称为用户默认 SSH 配置的验证。

重开必须由验收操作正常退出原 Desktop，保留原数据目录。UI 选择 SSH、填写 fixture alias 与 Host 端口、使用 fixture Host 新配对码；必要证据包含界面与 `ssh_config.calls`、sshd 日志。结束向该 fixture 的 supervisor PID 发送 TERM，脚本只关闭自己启动的 Host/sshd，保留文件作为证据。
