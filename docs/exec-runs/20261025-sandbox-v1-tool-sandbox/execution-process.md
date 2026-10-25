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

### 步骤 2：T1 沙箱管理器 `@actspace/sandbox`

- **操作**：新建 `packages/sandbox/manager`：契约（`types.ts`）、策略合并与指纹（`policy.ts`）、后端选择（`select.ts`）、执行生命周期（`execution.ts`）、服务（`service.ts`）、Host 端 Node 实现（`node-ports.ts`）、清单与插件。
- **影响文件**：`packages/sandbox/manager/**`。
- **验证**：`pnpm --filter @actspace/sandbox test` 24 个通过；`typecheck` 通过。提交 `db6b1521`。

### 步骤 3：T2 Seatbelt 后端 `@actspace/sandbox-seatbelt`

- **操作**：把 shell-tools 的 SBPL 生成与探测搬进 `packages/sandbox/seatbelt`，路径来自策略，断网时去掉 `(allow network*)`。
- **影响文件**：`packages/sandbox/seatbelt/**`。
- **验证**：`pnpm --filter @actspace/sandbox-seatbelt test` 6 个通过，含本机真实执行：写工作区成功，写 HOME、`.git/hooks`、`.git/config` 失败，`~/.ssh` 读不到，断网生效。提交 `65800f78`。

### 步骤 4：T3 nono 后端 `@actspace/sandbox-nono`

- **操作**：新建 `packages/sandbox/nono`：`cover.ts`（拆分覆盖，文件系统可注入）、`config.ts`（macOS profile / Linux 权限清单）、`backend.ts`（探测、准备、去掉 `NONO_*`）、清单与插件。
- **影响文件**：`packages/sandbox/nono/**`。
- **实现中的发现**：
  1. **按计划把 `denyRead` 全部拆开，macOS 上每次执行约 900ms。** 模板的禁止读取列表含十几个 `~/Library` 下的路径，拆开后本机约 1100 条授权；nono 的准备时间随条目数增长（约 110 条时 40ms）。改为 macOS 只围绕 nono 受保护目录拆分，`denyRead` 写成 `(deny file-read* …)` 规则。实测：规则拒绝生效（包括 nono 自带规则组不覆盖的路径），经 `/System/Volumes/Data/...` 访问同样被拒；`zsh -lc true` 端到端 57–87ms。
  2. **单独授权的符号链接按目标生效。** 若链接指向排除路径之内或之上（如 `~/x -> ~/.ssh`），授权它就绕过了排除，因此跳过；整体授权的目录里的链接不受影响（访问时按真实路径判断）。
  3. **nono 的 CLI 模式会自动加入系统读取组**（macOS 含 `/private/var`）。测试若把假 HOME 放在系统临时目录下，nono 会因“授权覆盖受保护目录”拒绝启动；测试的假 HOME 改放包内 `node_modules/.cache`。真实 HOME 在 `/Users` 下不受影响。
  4. **准备阶段提前拒绝 nono 必然失败的策略**：环境变量缺 `HOME`、可写路径与 nono 受保护目录重叠、可写路径不存在，都在 `prepare` 抛错（结果为 `prepare_failed`），不留到运行时。
- **验证**：
  - macOS（本机 Darwin 25.3.0 arm64，nono 0.80.0）：`ACTSPACE_NONO_PATH=tmp/sandbox-spike/ex/nono pnpm --filter @actspace/sandbox-nono test` 14 个通过。
  - Linux（Docker `node:22-bookworm-slim`，内核 6.12.76-linuxkit，arm64，nono 0.80.0，root 运行）：13 个通过、1 个按平台跳过（`.git` 写入拒绝仅 macOS）。

### 步骤 5：T4 nono 获取与打包

- **操作**：`scripts/sandbox/nono-version.json` 锁定 0.80.0 四个平台的压缩包与 SHA256；`scripts/sandbox/fetch-nono.mjs` 下载（`curl`，走 `https_proxy`）、校验、解压到 `dist/sandbox-components/<platform>-<arch>/nono` 或 `--out` 指定位置，压缩包缓存在 `.cache/sandbox/nono/`，每次使用都重新校验；根 `package.json` 增加 `sandbox:fetch-nono` 与 `test:fetch-nono`（并入 `pnpm test`）；`release-package.sh` 在 macOS / Linux 打包时把 nono 装进 `sandbox-components/bin/nono`，macOS 有签名身份时单独签名 nono，所有情况都校验签名与版本号。
- **与计划的差异**：计划写的是从 `dist/sandbox-components/` 复制，但 `release-package.sh` 开头会 `rm -rf dist`，所以改为打包时直接调用 `fetch-nono.mjs --out`。上游 macOS 程序已带 Developer ID 签名与 hardened runtime，未签名 / ad-hoc 包保留上游签名，不再 ad-hoc 重签。
- **影响文件**：`scripts/sandbox/*`、`scripts/test/fetch-nono.test.mjs`、`scripts/release-package.sh`、`package.json`。
- **验证**：`node --test scripts/test/fetch-nono.test.mjs` 4 个通过（本地 fixture，不访问网络）；`pnpm sandbox:fetch-nono --all` 四个平台下载并校验通过，`dist/sandbox-components/darwin-arm64/nono --version` 输出 `nono 0.80.0`，`codesign --verify --strict` 通过；用它跑 `@actspace/sandbox-nono` 真实测试 14 个通过。完整 `release-package.sh` 留到 T9 验证。

### 步骤 6：T5 注册进默认 Harness，Host 提供端口

- **操作**：
  - 准入支持可选依赖：`IsolatedCordisEntry`、`PluginBehaviorDescriptor`、`BuiltinPluginManifestInput`、组合条目增加 `optionalInjects`；清单校验服务名合法、与 `injects` 不重叠；`harness-compatibility` 要求 `optionalInjects` 与 `optional: true` 的契约一致；`harness-mount` 一并比对。`mountIsolatedCordisTree` 对有提供者（组合内或共享服务）的可选依赖并入 Cordis `inject`，没有的加入隔离表。
  - `DEFAULT_HARNESS_ENTRIES` 增加 `sandbox`、`sandbox-nono`、`sandbox-seatbelt`，条目类型 `DefaultHarnessEntry` 带可选第四项 `{ id, fallback }`（T6 的 shell-tools 用）；`actspace.host.sandbox` 加入共享服务、`agent-runtime` 的 inject（`composition.ts` 与 `cordis.yml`）；三个清单加入 `baseBundle`；服务注册表登记 `sandbox`。
  - Host 端口：`boot.ts` 在 Host 未提供时用不带 nono 的 `createNodeSandboxHostPort()`；`@actspace/sandbox` 新增 `findBundledNono`（只认绝对路径的可执行文件）与 `repoNonoPath`；Desktop `resolveDesktopNonoPath`（打包版只认 `resources/app/sandbox-components/bin/nono`，开发版依次 `ACTSPACE_NONO_PATH`、仓库 `dist/sandbox-components/<platform>-<arch>/nono`）经注册表、启动选项传到 `createDesktopToolHostServices`；agent-host / CLI 用 `resolveNodeHostNonoPath`。
  - 启动状态：`agent-runtime-plugin` 在 Harness 初始化后异步取 main Harness 的 `sandbox.status("tool")`，经 `onSandboxStatus` 记一条 `SANDBOX_STATUS` 诊断（有后端为 info，其余为 warning）；Desktop 另在主进程日志记录 nono 路径解析结果。
  - 三个沙箱包补 `lifecycle.test.ts`（包边界检查要求）。
- **与计划的差异**：
  1. 计划写的是打包版也按“打包路径 → 环境变量 → 仓库”依次找；实现为打包版只认随包的 nono，环境变量和仓库副本只在开发版生效，更符合“只用我们打包的 nono”。
  2. `actspace.host.sandbox` Host 端口没有登记进服务注册表：注册表只登记服务定义，现有 Host 端口（如 `actspace.host.background-tasks`）也不在其中。
  3. 状态日志写成运行时诊断而不是一行文本日志：沙箱服务在 Harness 里，Host 只能经回调拿到状态，诊断是现有的记录渠道。
- **影响文件**：`packages/cordis-adapter/src/{cordis-tree,manifest,service-contract}.ts`、`packages/{bundle,composition,boot}/src/*`、`packages/runtime/{cordis.yml,package.json,tsconfig.build.json}`、`packages/runtime/src/{harness,profiles,startup}/*`、`packages/sandbox/*/src/{node-ports,index}.ts` 与 `test/lifecycle.test.ts`、`packages/agent-host/src/node-ports/tool-host-services.ts`、`apps/desktop/src/main/{index,sandbox-resources}.ts`、`apps/desktop/src/main/runtime-v2/{tool-host-services,desktop-host-adapter,runtime-registry}.ts`。
- **验证**：cordis-adapter 39 通过 / 1 跳过；composition 15、boot 22、runtime 84、agent-host 58、agent-cli 13 通过；Desktop 2025 通过 / 7 跳过，`typecheck` 通过；sandbox 27、sandbox-nono 11 通过 / 4 跳过（无 `ACTSPACE_NONO_PATH`）、sandbox-seatbelt 7 通过；`check:packages`、`check:desktop-build-graph` 通过。默认 Harness 构建产出 `sandbox*.js` 三个入口，`@actspace/sandbox/types` 被打进共享块。`test:contract-matrix` 仍有失败（矩阵未登记三个沙箱包），按计划在 T8 处理。

### 步骤 7：T6 shell-tools 接入沙箱

- **操作**：
  - 清单 `optionalInjects: ["sandbox"]`，默认 Harness 条目带回退说明 `bash runs outside the sandbox after approval`；`HostPort.createPorts(background, sandbox)`，Desktop 与 agent-host 把服务传给 `createNodeBashToolPorts`。
  - 权限：进程资源的 `noSandbox` = 显式 `no_sandbox` 或 `!(await sandbox?.status("tool"))?.available`；为 `true` 时没有前缀授权建议。
  - 执行：`createNodeBashToolPorts` 删除 `sandbox?: boolean`，改收 `SandboxService`。`noSandbox` 取自 `context.admittedResources` 里批准的进程资源（没有资源的直接调用方只认显式 `no_sandbox`）。沙箱内执行走 `sandbox.run({ isolation: "sandboxed", readWrite: [工作区, 输出目录, 系统临时目录], TMPDIR=输出目录, scratchDir=输出目录 })`，路径都取真实路径；`.git/hooks`、`.git/config` 的禁止写入由 `tool` 模板派生。批准在沙箱外执行时，有服务走 `isolation: "none"`，没有服务用 `spawnHostProcess` 直接启动并自带进程组终止。需要沙箱但没有服务、没有可用后端或后端准备失败时，返回 `SANDBOX_PREPARE_FAILED` 并列出原因，命令不执行；后台任务把原因写进输出文件并作为结束摘要。
  - `ProcessHandle` 改为消费执行接口的输出与结果，保留输出文件、头部截断与磁盘上限；摘要为 `sandboxed=…, sandbox=<backendId|inherited|none>`。删除 `sandboxSpawn`、`probeSandbox`、`SANDBOX_PROBE_TIMEOUT_MS`、`signalProcess`。
- **与计划的差异**：
  1. 计划要求插件在 `apply` 中缓存一次 `status`；实现为每次提取资源时调用 `status("tool")`。探测结果已由管理器按后端缓存，后端注册或注销时自然更新，不需要插件再维护一份缓存。
  2. 计划写的是执行时用“有效 noSandbox”；实现为执行端只认批准时的进程资源。这样批准时有沙箱、执行时沙箱不可用的情况会返回 `SANDBOX_PREPARE_FAILED`，不会静默在沙箱外执行；参数里夹带 `no_sandbox` 也不能绕过批准结果。
  3. `terminate()` 不带参数（管理器接口如此，取消与超时由调用方区分）。
  4. 计划之外补了真实后端集成测试：macOS 上经 shell-tools 用 Seatbelt 与仓库内 nono 执行，工作区内写入与 `git status` 成功，写 `~` 下文件与 `.git/hooks/pre-commit` 失败且文件不存在。
- **影响文件**：`packages/tools/shell-tools/{package.json,src/manifest.ts,src/plugin.ts,src/node-ports.ts,src/test/*}`、`packages/runtime/src/harness/default-harness-definition.ts`、`apps/desktop/src/main/runtime-v2/tool-host-services.ts`、`apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts`、`packages/agent-host/src/node-ports/tool-host-services.ts`、`tsconfig` 依赖图。
- **验证**：shell-tools 109 通过（含 Seatbelt、nono 真实后端各 1 个），`typecheck` 通过；tools-runtime 47、runtime 84、agent-host 58、agent-cli 13 通过；Desktop 2025 通过 / 7 跳过，`typecheck` 通过；`check:packages`、`check:desktop-build-graph` 通过。

## 遇到的问题

- **问题**：权限清单的 `deny` 不生效。
  - **原因**：nono 0.80.0 清单分支不处理 `deny`。
  - **应对**：不依赖 `deny`，禁止读取用拆分覆盖表达，禁止写入用 macOS profile 模式的 Seatbelt 规则。

## 跳过或推迟的事项

- 无。
