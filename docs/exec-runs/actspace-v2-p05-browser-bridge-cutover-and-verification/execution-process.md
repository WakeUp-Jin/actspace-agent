# P05 Browser Bridge、唯一切换与全量验证 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260824-actspace-v2-package-layout-and-plugin-packaging/actspace-v2-p05-browser-bridge-cutover-and-verification.md`
- **执行模式**：交互
- **开始时间**：2026-08-25
- **结束时间**：未结束（发布门禁进行中）

## 执行时间线

### 步骤 1：切换 Host-facing Runtime

- **操作**：将 runtime boot、RuntimeHandle、Session controller、projection 和 Profile composition 从旧 monolith 迁入 `@actspace/runtime`；core-agent 补齐 Todo 语义；CLI/Desktop loader 改为 `@actspace/runtime/loader`。
- **影响文件**：`packages/runtime/`、`packages/core/agent/`、`packages/agent-cli/`、`packages/desktop/`、`packages/host/`、根构建与 managed packaging 脚本。
- **决定**：保留 `@actspace/runtime` 作为 Host-facing facade，但不再让它隐藏领域实现；领域 API 通过各自 workspace package exports 暴露。
- **验证**：`pnpm typecheck`、`pnpm build`、CLI 14 tests、Desktop 522 tests 通过。

### 步骤 2：退役旧 monolith 与通用入口

- **操作**：将旧 `packages/agent-runtime` 移出 workspace 到被忽略的 `tmp/retired/agent-runtime`；清理 lockfile/workspace consumer；严格扫描旧包引用、`src/` deep import、通用 `plugins/`、Kairos/fs-watch/`/eval`。
- **影响文件**：`pnpm-lock.yaml`、`packages/README.md`、站点贡献文档、`scripts/check-package-cutover.mjs`、旧路径消费者。
- **决定**：没有删除用户 Session 或历史数据；旧源码保留在本地 ignored archive，避免把回滚参考和运行时可达图混在一起。
- **验证**：`pnpm check:package-cutover -- --strict`、`pnpm check:v2-legacy-removal -- --strict`、`pnpm check:packages` 均通过。

### 步骤 3：Browser Bridge 顶层化

- **操作**：将 Browser Bridge 从 `plugins/browser-bridge` 迁到顶层 `browser-bridge/`；桌面 Host service 移出 `src/main/plugins/`；修正 locator/command registry/build 脚本和 Go cache 传递。
- **影响文件**：`browser-bridge/`、`packages/desktop/src/main/browser-bridge-service.ts`、Browser checks、`.gitignore`、`AGENTS.md`。
- **验证**：Chrome extension/locator/cursor 静态门禁通过；Go CLI 与 protocol 两个 module 的 `go test ./...` 通过。

### 步骤 4：全量自动化与制品

- **操作**：执行 workspace typecheck/test、Desktop/CLI build、managed CLI deploy/smoke、docs/repo/secrets/diff checks。
- **验证**：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm package:agent-cli`、`pnpm test:agent-cli:package`、`pnpm check:browser`、`pnpm check:docs`、`bash scripts/ci.sh` 全部通过。

### 步骤 5：收尾复核与发布边界

- **操作**：在当前工作树再次执行 frozen install、CI、typecheck、全量 tests、build、managed CLI package smoke、CLI SIGINT/exit-drain 和 Browser Extension/Go 门禁；对 CLI/Desktop 编译产物与 managed deploy 运行旧路径扫描。
- **验证**：workspace、Session golden、CLI、Desktop、Browser 静态/fixture 门禁全部通过，产物旧路径命中为 0。
- **宿主边界**：`pnpm package:desktop` 已生成 portable `Actspace.app`，但 `hdiutil` 返回“设备未配置”，DMG/签名/公证不能在本环境完成。Desktop 本地设置实际已配置 DeepSeek 与 OpenRouter 凭据；只读正式网络探针因当前 Codex 沙箱禁止出站连接而统一返回 `network`，没有发送仓库内容、输出凭据或写回设置。当前 `abb doctor` 确认 Native Messaging manifest 有效，但 local RPC socket 仍 offline。

### 步骤 6：无缓存 clean checkout 复验

- **操作**：从当前工作树建立隔离的本地 clean checkout `70f3d85`，不携带 `node_modules` 或历史 `dist` 缓存；执行 frozen/offline install、依赖闭包声明构建、全量 typecheck/test/build、managed CLI smoke、Browser/Go、CI 和产物扫描。
- **结果**：所有自动化门禁通过；Desktop portable app 构建完成，DMG 仍只受当前宿主 `hdiutil` 权限阻塞。临时 checkout 的验证提交不写入主仓库。

### 步骤 7：应用目录与最终 package boundary 收口

- **操作**：将 Desktop、CLI、Site 从 `packages/` 迁入根级 `apps/`，保持 package name、命令、Runtime facade、页面和部署行为不变；同步 workspace、lockfile、TypeScript/Vite/Vitest、CI、release/package 脚本和当前设计文档。
- **边界**：`apps/` 只放可运行、打包或部署入口；`packages/` 只放可复用 package。verifier 禁止 package 反向依赖 app、app 依赖 sibling app，以及跨 package/app 的 sibling `src` deep import。
- **验证**：离线 frozen install、31 manifests/boundary、strict cutover/legacy scan、全量 typecheck/build/test、Site 0 diagnostics + 17 tests + 22 pages、managed CLI package/smoke + 2 个真实进程 SIGINT tests、Browser 静态检查与两个 Go module tests 均通过。另从当前文件树创建不含 `.git`、`node_modules`、`dist` 的隔离快照，只复用原仓库的 pnpm content-addressable store，frozen install、typecheck、test、build、Site、CLI process、Browser/Go 全部通过。Desktop portable app 再次生成，DMG 仍在 `hdiutil create` 被宿主拒绝。

### 步骤 8：最终完成审计与时间 fixture 稳定化

- **操作**：按 P00-P05 的任务、验证和完成标准重新逐项审计当前工作树；复核 package boundary、旧入口扫描、Chrome/Computer Use、Provider 网络、ABB socket、codesign 和 portable app 状态。
- **发现**：首次全量复验中 Sidebar 的“超过 8 条 Session 显示 See more”用例出现 1 次失败。生产代码会按 `updatedAt` 降序排序，而测试的 12 条 fixture 使用实时 `new Date()`；全量并发变慢后后创建的 `Plan item 9` 被排进前 8 条，单测独跑时同毫秒稳定排序又会通过。
- **修复**：只为该排序场景写入明确递减的固定时间戳，不改变 Sidebar 产品逻辑或样式。
- **插件契约收口**：审计发现原 `check:packages` 不会机械阻止可装载 package 丢失 Manifest、Behavior 或 lifecycle test；为 6 个缺少直接 Behavior contract 的领域包补 activation/dispose test，并增加 plugin/codec/export/lifecycle 一致性检查及负向 fixture。
- **验证**：目标用例连续 20 次通过；新增 6 个 lifecycle tests 与 package boundary 2 个 tests 通过；Desktop 78 files / 522 tests、根全量 tests、build、Browser checks、managed CLI package/smoke/process、Site 0 diagnostics / 17 tests / 22 pages 再次通过。

### 步骤 9：恢复执行后的真实宿主门禁复核

- **Chrome 控制面**：Google Chrome `151.0.7922.174` 已运行；官方诊断确认 ChatGPT/Codex Chrome Extension 已安装、已启用且没有 disable reason，Native Messaging host manifest 也完全匹配。Browser Runtime 仍只发现 Codex In-app Browser，无法取得 Chrome binding；按官方恢复流程，下一步需要用户授权打开所选 Chrome profile 的新窗口后再重试一次，不能用 shell、AppleScript 或其他自动化替代。
- **ActSpace Browser Bridge**：`abb doctor --json` 继续确认 ActSpace Native Messaging manifest 有效，但 local RPC socket 仍 offline；真实 Extension reload、权限提示和只读 Browser action 尚未通过。
- **Desktop UI**：portable `dist/desktop/Actspace.app` 仍存在，但 Computer Use 对 Actspace 返回未批准，不能观察或操作真实 Electron 窗口。
- **Provider 与发布宿主**：`api.deepseek.com` 仍在 DNS 解析阶段失败；最小 `hdiutil create` 仍返回“设备未配置”；本机有效 codesign identity 和签名/公证环境配置数仍均为 0。

### 步骤 10：当前文档真相收敛

- **问题**：默认 README、架构/安全/可靠性、Context/Analysis/Tool/Subagent 设计和 active 计划队列仍混有 v1 `packages/agent-runtime`、`session.jsonl` sidecar、Trace sidecar、ToolScheduler 与已删除 Team/Kairos 入口，自动检查只验证文档骨架，无法阻止旧事实继续传播。
- **操作**：重写根层与跨专题当前文档为 v2 Journal/Projection/真实插件包事实；把纯 v1 cache/Bash/approval 设计移入 `v1-legacy/`；把基于 v1 的 Team V1 和 Bash allowlist 计划移入 `discarded/`；修复索引、TODO、历史引用和测试规范入口。
- **门禁**：新增 `scripts/check-current-docs.mjs`，对显式 current-truth 文件检查失效路径、已丢弃 active 入口与相对 Markdown 链接；新增正向仓库测试、v1 路径 + 断链负向 fixture 和合法链接 fixture，并接入 `pnpm check:docs` 与根测试链。
- **范围边界**：本步骤不修改 Browser Bridge 实现、不执行 Chrome/Provider/DMG 外部门禁、不删除旧用户 Session，也不创建 commit。
- **验证**：`pnpm test:current-docs` 与 `pnpm check:docs` 通过；后续完整 repo/secrets/diff 检查在本轮收尾重新执行。

## 遇到的问题

- **Go 测试默认写入 `/private/tmp/abb-go-cache` 被环境拒绝**：让 Browser Bridge 子进程继承当前 `GOCACHE`，使用 workspace `.tmp/go-cache` 后通过。
- **Desktop DMG 生成被宿主环境的 `hdiutil` 拒绝**：portable `Actspace.app` 已构建，最小 DMG 探针返回“设备未配置”；DMG/签名/公证保留为宿主环境门禁，没有将失败误报为完整发布通过。
- **临时 clean-checkout 命令曾误在主工作树生成验证提交**：核对 reflog 和提交内容后，以保留工作树的 mixed reset 将 `refactor-dsh-plugin` 恢复到原基线 `9366c19`；916 项工作树改动完整保留，暂存区为空，未删除文件、未 push。
- **真实 Chrome 连接不可用**：ActSpace Native Messaging manifest 已存在且指向已安装 host，但 local RPC socket offline。上一轮只读诊断曾发现 unpacked Extension 指向迁移前路径；恢复执行后没有绕过 Chrome 控制面重新读取 profile 文件，因此当前路径状态仍需通过 Chrome Extension reload 和真实 action 验证。
- **Codex Chrome 扩展已启用但控制通道未建立**：恢复执行后的官方诊断确认扩展已启用、Native Host 正确，但 Browser Runtime 仍只发现 Codex In-app Browser。按 Chrome 控制约束，没有使用 shell、AppleScript 或其他 UI 自动化绕过；需用户授权打开一个 Chrome 窗口后按官方流程重试，若仍失败则从 Codex 插件 UI 重装 Browser plugin。
- **Electron 手工验收未获授权**：portable `Actspace.app` 已存在，但 Computer Use 对 Actspace 返回未批准，且当前沙箱启动 Electron 时在 macOS application registration 阶段退出；没有用替代自动化绕过用户授权。
- **开发服务器端口受限**：`pnpm dev:log` 已解析到迁移后的 `apps/desktop`，但当前沙箱禁止绑定 `127.0.0.1:5173`，因此不能在此环境完成 renderer/Electron 联调验收。
- **发布凭据不可用**：本机有效 codesign identity 为 0，签名/公证环境变量配置数为 0；最小 `hdiutil create` 返回“设备未配置”。
- **迁移后相对路径失效**：Desktop/CLI 的 tsconfig alias、Vite/Vitest alias 和一个 CLI process smoke 曾继续指向旧目录层级；逐项改为从 `apps/*` 指向根级 `packages/*` 后，全量 typecheck/build/test 通过。
- **脚本拼接旧路径**：直接文本扫描没有捕获 `join(repoRoot, "packages", "agent-cli", ...)`；真实进程测试暴露后改为 `apps/cli`，并将 cutover 扫描扩展到 `apps/`。
- **隔离快照首次离线安装缺少 tarball**：快照主动排除了仓库本地 `.pnpm-store`，导致 `esbuild@0.21.5` 无离线 tarball，后续均为依赖未安装的连锁失败；改为只读复用原仓库 content-addressable store，仍不复用 `node_modules` 或 `dist`，重跑后全部通过。
- **实时测试时间戳造成并发排序漂移**：测试 factory 默认生成当前时间，而产品逻辑按时间排序；将依赖顺序的 fixture 改为显式固定时间，避免单测独跑与全量并发结果不同。
- **文档“软声明”无法阻止回归**：仅在旧总计划顶部写 superseded 提示，不能阻止其他当前文档继续复制旧路径；改为 current truth zone 白名单 + 负向 checker，使默认阅读路径成为可测试契约。

## 跳过或推迟的事项

- 真实 Provider 请求：本机 DeepSeek/OpenRouter 凭据已配置，但当前 Codex 沙箱禁止出站网络；需在允许网络且不会暴露凭据的宿主环境运行固定无敏感内容探针及 managed CLI resume。
- 真实 Chrome Extension reload/权限与 browser action：Codex Chrome 控制扩展已启用，但需用户授权打开一个 Chrome 窗口以恢复控制通道；随后从当前 `browser-bridge/apps/chrome-extension` reload ActSpace Extension 并人工验收只读 action。
- Electron UI：需用户批准 Computer Use 访问 Actspace，或自行完成固定页面、reload/quit/flush 验收。
- Desktop DMG、签名、公证和最终产品切换 commit：当前环境不具备安全/授权条件；未执行 commit、push 或发布。应用目录迁移也未单独提交。
