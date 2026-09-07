# Lab Rust CLI 设计草案

## 1. 背景

Lab 的目标不是为 Agent 预先穷举工具，而是让 Agent 在解决问题时，可以发现能力缺口、构建实验、验证理论，并把可复用能力沉淀为工具。

当前讨论中的关键问题是：如果 Agent 需要自己构建工具，实践场应该如何提供安全、可复现、足够轻量的执行环境。

一开始直接选择 WASM / Wasmtime 会引入较多运行时和编译约束；直接把完整 Agent 放进 Docker 又比较重。因此第一阶段可以选择一个更务实的中间形态：

**使用 Rust 构建一个独立的实验室 CLI 二进制文件，由它控制 Docker 实践场。Agent 不直接操作 Docker，而是通过受限命令执行这个 CLI。**

## 2. 一句话定义

Lab Rust CLI 是一个 Agent 可调用的实验室命令行工具。

它由 Rust 实现，打包后是一个单独二进制文件。任何具备受限命令执行能力的 Agent，都可以通过调用该二进制文件来创建实践场、写入文件、执行命令、运行测试、收集产物和生成实验报告。

```text
Agent
  -> 受限命令工具
    -> lab-rust-cli
      -> Docker sandbox
        -> /workspace
        -> Rust toolchain
        -> cargo build / test / run
        -> logs / artifacts / report
```

## 3. 核心判断

这个 CLI 不应该暴露 Docker 细节给 Agent。

Agent 看到的不是：

```text
docker run
docker exec
docker cp
```

而是：

```text
lab help
lab sandbox create
lab sandbox write
lab sandbox exec
lab sandbox read
lab sandbox export
lab sandbox destroy
```

Docker 只是第一版 backend。CLI 的语义应该围绕实践场，而不是围绕 Docker。

这样后续可以把 backend 替换为：

- Docker。
- WASI / Wasmtime。
- local trusted runner。
- remote runner。
- Firecracker / gVisor 等更强隔离后端。

Agent 的调用方式不需要变化。

## 4. 为什么要做成 CLI

把 Lab 实践场做成 Rust CLI 有几个好处：

- 独立于 actspace 内部工具协议。
- 可以被任何能执行命令的 Agent 使用。
- 易于分发，一个二进制文件即可。
- 和 MCP、Agent SDK、UI 解耦。
- 方便先验证实验闭环，再决定是否内置到 actspace。
- Rust 适合实现命令解析、状态管理、Docker 编排、日志和 JSON 输出。

更重要的是，CLI 可以通过 `help` 命令向 Agent 暴露能力说明。

Agent 不需要预先知道这个工具有哪些命令。它可以先执行：

```bash
lab help
```

然后根据帮助信息决定后续调用方式。

## 5. 安全模型

这个方案的安全前提是：

**Agent 不应该拥有完整宿主机 bash 权限。Agent 应该只拥有一个能够安全执行 Lab CLI 的工具。**

也就是说，安全边界不应该是：

```text
Agent 可以执行任意 bash，但希望它自觉只调用 lab。
```

而应该是：

```text
Agent 的命令执行工具只允许调用 lab 这个二进制文件。
```

或者在 actspace 中把该工具注册成专门能力：

```text
lab_cli.run(args)
```

这样 Agent 不能绕过 Lab CLI 去直接操作宿主机。

CLI 内部再负责控制 Docker sandbox：

- 不挂载用户真实项目目录。
- 只挂载 CLI 创建的临时 workspace。
- 不传入宿主环境变量。
- 不挂载 Docker socket 到容器内。
- 不使用 privileged 容器。
- 限制 CPU、内存、进程和超时。
- 网络默认禁用或走 allowlist。
- 只导出白名单产物。
- 每次实验记录命令、输出、日志和产物。

## 6. 大脑在外面，手脚在容器里

第一阶段推荐的模式是：

```text
Agent / LLM 推理在容器外
文件操作、代码执行、编译、测试在容器内
```

这不是让 Agent 进到容器里，而是让 Agent 可调用的动作全部通过 Lab CLI 映射到容器内部。

例如：

```bash
lab sandbox exec <run_id> --cwd /workspace -- cargo test
```

CLI 内部执行：

```text
docker exec -w /workspace <container_id> cargo test
```

Agent 得到的是结构化结果：

```json
{
  "ok": false,
  "exit_code": 101,
  "stdout": "...",
  "stderr": "...",
  "duration_ms": 1832
}
```

因此 Agent 可以根据测试失败信息继续修改代码，但它的所有动作仍然发生在 Docker sandbox 中。

## 7. 典型实验流程

输入可以是一份 Markdown 构建清单：

```text
build_plan.md
```

里面描述：

- 要验证的问题。
- 理论整理结果。
- 工具目标。
- 输入输出约定。
- 权限需求。
- 成功标准。

执行流程：

```text
1. Agent 调用 lab help，了解 CLI 能力。
2. Agent 调用 lab sandbox create，创建实验场。
3. CLI 启动 Docker sandbox，并准备 /workspace。
4. Agent 写入 build_plan.md。
5. Agent 根据计划写 Rust 代码。
6. Agent 调用 lab sandbox exec 执行 cargo build / cargo test。
7. Agent 根据日志修正代码。
8. 测试通过后，Agent 生成实验报告。
9. Agent 调用 lab sandbox export 导出工具产物和报告。
10. Agent 调用 lab sandbox destroy 销毁实验场。
```

输出包括：

- Rust 工具源码。
- 构建产物。
- 测试结果。
- 实验报告。
- 验证结论。
- 可复现日志。

## 8. CLI 命令草案

### help

```bash
lab help
lab help sandbox
lab help sandbox exec
```

用于让 Agent 自发现 CLI 能力。

帮助信息需要简短、明确，并包含输入输出示例。

### sandbox create

```bash
lab sandbox create --name feishu-doc-demo --image lab-rust:latest
```

创建一个新的实践场。

输出：

```json
{
  "ok": true,
  "run_id": "run_20260603_001",
  "workspace": "/workspace",
  "backend": "docker"
}
```

### sandbox write

```bash
lab sandbox write <run_id> /workspace/build_plan.md --stdin
```

把内容写入实践场文件系统。

也可以支持从本地临时文件导入，但第一版更建议 Agent 通过 stdin 写入，减少路径暴露。

### sandbox read

```bash
lab sandbox read <run_id> /workspace/experiment_report.md
```

读取实践场内文件。

CLI 应限制可读取路径，只允许读取 `/workspace`、`/output`、`/logs` 等允许目录。

### sandbox exec

```bash
lab sandbox exec <run_id> --cwd /workspace -- cargo test
```

在实践场内执行命令。

第一版可以只允许一组命令前缀：

- `cargo build`
- `cargo test`
- `cargo run`
- `rustc`
- `ls`
- `cat`
- `sed`
- `rg`

后续再根据实验需要扩展。

### sandbox export

```bash
lab sandbox export <run_id> --to ./artifacts
```

导出白名单产物。

例如：

- `/workspace/src`
- `/workspace/Cargo.toml`
- `/workspace/experiment_report.md`
- `/workspace/target/release/<tool>`
- `/logs`

### sandbox destroy

```bash
lab sandbox destroy <run_id>
```

销毁实践场。

可以支持：

```bash
lab sandbox destroy <run_id> --keep-artifacts
```

但默认应该销毁容器，只保留导出的报告和日志。

### sandbox status

```bash
lab sandbox status <run_id>
```

查看实践场状态：

```json
{
  "ok": true,
  "run_id": "run_20260603_001",
  "state": "running",
  "created_at": "2026-06-03T10:00:00Z",
  "container": "lab_run_20260603_001",
  "workspace_files": 12
}
```

## 9. 输出格式

面向 Agent 的 CLI 应默认输出 JSON，方便模型解析。

建议支持：

```bash
lab --format json ...
lab --format text ...
```

默认可以选择 JSON。

所有命令输出至少包含：

```json
{
  "ok": true,
  "message": "...",
  "data": {}
}
```

失败时：

```json
{
  "ok": false,
  "error": {
    "code": "COMMAND_NOT_ALLOWED",
    "message": "Command prefix is not allowed in this sandbox.",
    "details": {}
  }
}
```

## 10. Docker backend 职责

第一版 backend 使用 Docker，职责包括：

- 拉起 sandbox 容器。
- 挂载临时 workspace。
- 设置工作目录。
- 执行容器内命令。
- 收集 stdout / stderr / exit code。
- 限制资源。
- 控制网络。
- 导出产物。
- 销毁容器。

CLI 层不要把 Docker 细节泄露给 Agent。

Agent 不应该关心容器名、镜像、挂载参数和 `docker exec` 的细节。

## 11. Runtime 状态目录

CLI 可以在本机维护一个 Lab runtime 状态目录。

建议结构：

```text
<lab-home>/
  runs/
    <run_id>/
      manifest.json
      workspace/
      logs/
      artifacts/
      report.json
  config.toml
```

`lab-home` 可以通过参数指定：

```bash
lab --home /tmp/actspace-lab sandbox create
```

actspace 内部集成时，可以把它放到应用自己的 userData 或 workspace 专属目录。

## 12. 与 actspace 的关系

Lab Rust CLI 可以先作为独立二进制存在。

actspace 只需要提供一个受限工具：

```text
lab_cli.run(args)
```

该工具只能执行这个 CLI，不能执行任意宿主命令。

未来如果 CLI 被证明稳定，可以有几种集成方式：

- 继续作为外部二进制。
- 注册为 actspace managed CLI。
- 包装为 MCP server。
- 把核心能力迁移进 agent-core 的 Lab Runtime。

第一阶段不建议直接深度耦合到 actspace 内部。

## 13. 与现有 Bash 权限体系的关系

actspace 已经有 Bash allowlist 设计。

Lab CLI 可以复用这个思路，但不应该依赖 Agent 的通用 Bash 工具。

更安全的方式是新增专用工具：

```text
LabCliTool
```

它内部只允许调用：

```text
lab <args>
```

这样 Agent 既能通过命令形式使用 CLI，又不能绕过 CLI 直接执行宿主 bash。

## 14. 后续演进

第一阶段：

```text
Rust CLI + Docker backend
```

目标是快速验证：

- Agent 能否通过 CLI 创建实践场。
- Agent 能否在实践场内写 Rust 代码。
- Agent 能否编译、测试、修正工具。
- Agent 能否产出实验报告和工具产物。

第二阶段：

```text
更完整的权限策略和网络 allowlist
```

增加：

- 网络默认关闭。
- 域名 allowlist。
- 环境变量 allowlist。
- 命令前缀 allowlist。
- 资源限制配置。

第三阶段：

```text
WASI / Wasmtime backend
```

对于已经锻造完成的小工具，可以尝试编译为 WASM，并在更轻量的 runtime 里执行。

第四阶段：

```text
Browser / computer-use adapter
```

如果实验需要浏览器或 GUI，再引入更重的 adapter。

这类能力不应阻塞第一版 CLI。

## 15. 当前设计结论

Lab Rust CLI 是当前最适合验证 Lab 自主工具构建想法的第一版形态。

它兼顾：

- 足够快的落地速度。
- 清晰的安全边界。
- 对 Agent 友好的使用方式。
- 对 actspace 的低耦合。
- 对后续 WASM / MCP / Runtime 内置化的演进空间。

最小目标不是做完最终 Runtime，而是先证明：

**Agent 可以通过一个受限 CLI，在隔离实践场里完成从构建计划到 Rust 工具产物的闭环。**
