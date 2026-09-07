# P09：内置工具迁移与 Browser Bridge 适配

状态：执行中（Tool parity、具体 executor、Bash process/shutdown 与 vision attachment 授权已完成；真实 Chrome/Extension 验收未完成）

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P03、P05、P06

消费方：P11-P15

Exec-run slug：`actspace-v2-plan-09-built-in-tools-and-browser`

## 1. 目标

把 ActSpace 已验证的具体工具算法迁移为 v2 Core Tool plugins，同时保留路径保护、权限分类、输出上限、脱敏、外部协议和行为 fixture。Browser Bridge 保持 Go CLI + Chrome Extension 外部进程，通过 Host capability 注入；不把它伪装成 Cordis code plugin。

本计划不迁移旧 ToolManager / ToolScheduler，不实现 `agent`、`explore` 或 Todo，它们由 P10/P11 按新 Agent / Session 语义重写。

## 2. 必读与迁移账本

- [能力去留研究](../../../design-docs/agent-plugin-runtime/agent-research-capability-disposition.md)
- [Tool Runtime ABI](../../../design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md)
- `packages/agent-core/src/tools/tools/`
- `browser-bridge/`
- `docs/design-docs/browser/agent-browser-use-index.md`
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`

必须逐项迁移并建立 parity fixture：

| 类别 | 工具 |
|---|---|
| 读取与搜索 | `read_file`、`list_directory`、`grep`、`glob` |
| 文件修改 | `edit_file`、`write_file`、`delete_file` |
| Shell | `bash`、`bash_output`、`bash_kill` |
| Web | `web_search`、`web_fetch` |
| 图片 | `generate_image`、`inspect_image` |
| Browser | `browser_help`、`browser_run`、`browser_cua`、`browser_dom`、`browser_locator` 及生成的 canonical actions |

## 3. 文件布局

```text
packages/agent-runtime/src/plugins/
├── core-tools/
│   ├── manifest.ts
│   ├── plugin.ts
│   ├── file/
│   ├── search/
│   ├── bash/
│   ├── web/
│   └── image/
└── browser-tools/
    ├── manifest.ts
    ├── plugin.ts
    ├── host-port.ts
    ├── definitions.ts
    ├── executor.ts
    └── redaction.ts
```

Core plugin id 固定为 `actspace.core-tools`，Browser plugin id 固定为 `actspace.browser-tools`。每个 tool id 使用 `<pluginId>/<existing-tool-name>`，对模型暴露的 local name 保持现有名称。

## 4. 任务

### 09.1 建立逐工具 parity harness

- 从旧测试抽取输入、输出、permission、boundary、truncation、redaction 和 failure fixtures；fixture 不能导入旧 ToolManager。
- 同一 fixture 分别运行 v1 executor adapter 与 v2 plugin executor，比较 canonical result；v1 特有 SessionEvent / UI preview 字段从比较中明确排除。
- 记录每个工具的 side-effect class、concurrency class、Host capability、credential ref 和 artifact behavior。

### 09.2 文件、搜索与修改工具

- 迁移 path normalization、workspace symlink escape 防护、ripgrep path、atomic write、diff/edit 精确匹配和 deletion guard。
- 读取类声明 concurrency-safe；写入/删除类默认 exclusive，并继续走 Host approval 和 checkpoint。
- 大输出经模型输出裁剪与 artifact reference 双通道处理，不把完整大文件塞进 Journal Surface。

### 09.3 Bash

- 迁移 command rules、permission、sandbox profile、subprocess runner、background task registry、output monitor 和 kill。
- subprocess、stream subscription、temp file 和 task registry 由 plugin Effect 拥有，shutdown 必须等待或协作终止。
- top-level body 只在 checkpoint 成功后 spawn；abort / timeout / kill 的 exit、signal、tail output 和 outcome 状态稳定。

### 09.4 Web 与图片

- 迁移 web search provider 选择、fetch SSRF 防护、HTML-to-Markdown、timeout、output limit 和结构化 failure。
- 迁移 image generation / inspection 的 Provider port、input validation、public-host guard、artifact 保存和 model-safe result。
- Credential 仍由 Host resolver 提供，工具 config / Journal / projection 不保存 key。

### 09.5 Browser Bridge

- 保留 Go command engine、Chrome Extension、socket protocol、62 command registry 和 locator runtime。
- Desktop/CLI 只通过 `BrowserCapability` port 提供 socket/process readiness；Cordis plugin 不安装或管理任意未知二进制。
- Host ceiling 缺 Browser 时整个 Browser plugin optional skip，并输出结构化 diagnostics；required Profile 则 Boot 失败。
- bridge crash、socket disconnect、Chrome 缺失、shutdown 和 redaction 进入 parity / failure tests。

### 09.6 Plugin lifecycle

- 每个 plugin 使用 Static Manifest + pure Codec module + Behavior entry；工具本身没有 durable custom event 时 codec module 为空但仍可纯加载。
- registration、subprocess、socket client、timer 和 temp cleanup 全部 effect-owned。
- 配置变化只设置 restartRequired，不在线替换正在执行的工具。

## 5. 允许修改

- `packages/agent-runtime/src/plugins/{core-tools,browser-tools}/**`
- 迁移后复制到新位置的 executor helper 与 fixture
- `browser-bridge/` 仅做 v2 Host port 必需的协议兼容修改，不重写 command engine
- `scripts/check-browser-command-registry.mjs` 和 Browser 构建检查的 v2 路径
- 对应 tests、exec-run、design/history

禁止修改 `packages/agent-runtime/src/agent/**`、Todo、Desktop UI、CLI、旧 executor 源文件或默认 Runtime。

## 6. 失败与回滚

- 任一保留工具缺少 parity 证据时不能进入 P15；不能用 generic Tool Runtime 测试代替。
- Browser real-process 失败时保留其他工具候选，但完整产品 gate 仍为失败，不发布缺 Browser 的 v2。
- 回滚移除新 plugins；旧工具和 Browser Bridge 仍由 v1 使用。

## 7. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/plugins/core-tools src/plugins/browser-tools
pnpm --filter @actspace/agent-runtime typecheck
pnpm check:browser
GOCACHE=/private/tmp/abb-go-cache go -C browser-bridge/packages/protocol test ./...
GOCACHE=/private/tmp/abb-go-cache go -C browser-bridge/apps/cli test ./...
pnpm check:secrets
git diff --check
```

两条 `go -C` 分别在 `packages/protocol` 与 `apps/cli` module 中执行；`browser-bridge` 根目录只有 `go.work`，不能直接对根目录使用 `./...`。Unix socket 测试若在受限 sandbox 出现 `EPERM`，必须在允许 socket bind 的环境重跑，不能把环境失败宣称为功能通过。

## 8. 完成标准

- 迁移账本中的每个工具都有 v2 plugin registration 和 parity evidence。
- Browser Bridge 在真实 Chrome/Extension/Go 进程链中可用并可静止关闭。
- 新插件没有对旧 ToolManager、Desktop component 或 Kairos 的导入。

## 9. 当前进度

- [x] Core / Browser Tool definitions、namespaced registration 与 Host capability seam。
- [x] prepared execution、policy、approval、checkpoint 与 generic result 复用 P06 契约。
- [x] 为每个保留工具建立不依赖旧 ToolManager 的行为 parity fixture；25-tool parity ledger、core node ports、Browser canonical command 和 image attachment tests 已覆盖。
- [x] 从 `@actspace/agent-core` 抽离或重写具体 executor 与 legacy transport；v2 plugin 目录不导入旧包，旧 Host wiring 仍由 P15 cutover 删除。
- [x] 为 `inspect_image` 建立 v2 Session-owned attachment identity、授权路径与 vision adapter；未配置 Host 时仍显式返回 unavailable，禁止扩大到 workspace root。
- [x] 完成 Browser Bridge Go/protocol module、Bash subprocess 和 shutdown 自动化验收。
- [ ] 完成真实 Chrome / Extension Browser Bridge 验收。
