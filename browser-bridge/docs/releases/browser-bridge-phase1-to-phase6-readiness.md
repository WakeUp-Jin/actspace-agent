# Browser Bridge Release Readiness

## 当前定位

这份文档用于记录 Browser Bridge 主线在当前仓库内的阶段性 readiness，而不是宣称项目已经完成最终产品化发布。

当前状态：

- Phase 1 到 Phase 6 的历史阶段计划已经完成并归档。
- 当前 active 计划是 `docs/exec-plans/active/2026-06-20-complete-cli-extension-browser-bridge.md`。
- 代码层面已经实现完整 extension backend 命令面：Native Messaging host install、local RPC broker、browser info、tab/session commands、basic CDP/debugger commands。
- 最终 release readiness 仍依赖一次真实 Chrome 环境手动验收。

## 上层消费入口

当前推荐的上层消费入口仍然是 CLI：

- `abb help`
- `abb install-native-host`
- `abb doctor`
- `abb capabilities`
- `abb backends`
- `abb ping`
- `abb info`
- `abb tabs`
- `abb user-tabs`
- `abb history`
- `abb open-tab`
- `abb claim-tab`
- `abb navigate`
- `abb wait-load`
- `abb page-info`
- `abb finalize-tabs`
- `abb cdp`
- `abb screenshot`

消费原则：

- 上层 Agent Runtime 默认站在 CLI 边界，不直接依赖 extension 私有实现细节。
- 共享协议入口以 `packages/protocol/` 为准。
- 当前桥接层仍是基础设施，不承担上层工具系统的产品规则。

## 当前验证证据

已验证通过：

```sh
GOCACHE=/private/tmp/abb-go-cache go test ./packages/protocol/... ./apps/cli/...
node --check apps/chrome-extension/src/background.js
```

这些命令分别覆盖：

- protocol 的 method/payload/frame helper。
- CLI 的命令表、manifest 生成、参数校验和 socket offline 行为。
- extension background 脚本语法有效性。

## 最终手动验收

加载 Chrome extension 并安装 native host 后，需要统一执行：

```sh
cd apps/cli
GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --json
GOCACHE=/private/tmp/abb-go-cache go run . doctor --json
GOCACHE=/private/tmp/abb-go-cache go run . ping --json
GOCACHE=/private/tmp/abb-go-cache go run . info --json
GOCACHE=/private/tmp/abb-go-cache go run . tabs --json
GOCACHE=/private/tmp/abb-go-cache go run . user-tabs --json
GOCACHE=/private/tmp/abb-go-cache go run . history --query browser --limit 5 --json
GOCACHE=/private/tmp/abb-go-cache go run . open-tab --url https://example.com --json
GOCACHE=/private/tmp/abb-go-cache go run . navigate --tab-id <tab-id> --url https://example.com/agent-browser-bridge --json
GOCACHE=/private/tmp/abb-go-cache go run . page-info --tab-id <tab-id> --json
GOCACHE=/private/tmp/abb-go-cache go run . cdp --tab-id <tab-id> --method Runtime.evaluate --params '{"expression":"document.title","returnByValue":true}' --json
GOCACHE=/private/tmp/abb-go-cache go run . screenshot --tab-id <tab-id> --output /private/tmp/abb-screenshot.png --json
GOCACHE=/private/tmp/abb-go-cache go run . finalize-tabs --keep '[]' --json
```

## 仍未完成的部分

这些部分仍未达到最终产品成熟度：

- Linux/Windows Native Messaging manifest installation.
- 独立 CDP backend fallback。
- `tabGroups`、downloads、完整事件流和更复杂 session deliverable 管理。
- 上层 Agent Runtime 的真实消费集成。
- 正式发布产物和跨平台分发链路。

## Readiness 结论

当前结论：

- 这套 Browser Bridge 主线已经完成完整 extension backend 的代码层实现。
- 它已具备被上层系统通过 CLI 消费的命令面。
- 它还需要真实 Chrome profile 的最终手动验收，才能宣称这一阶段完全验证完成。
