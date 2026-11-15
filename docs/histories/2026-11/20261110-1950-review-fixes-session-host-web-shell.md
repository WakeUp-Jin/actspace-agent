## [2026-11-10 19:50] | Task: 审查修复合集：测试稳定性、会话读路径、Agent Host 传输、web_fetch、hooks 规则、子进程环境与输出订阅

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）M3 可以；M6、M7 应该也可以修；M9、M10 应该也可以修；L1 到 L6 都可以修；L9 我也没懂，但感觉可以修。……都可以按照你的建议去做吧。

这是审查修复批次的第 3 个 PR，计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。包含 M6、M9、M7、M3、L2、L9 六个条目。

### 🛠 Changes Overview

**Scope:** `tool-runtime`、`session-persistence-jsonl`、`session-projection-cache`、`runtime`、`subagent`、`agent-host`、`shared`、`tool-web`、`tool-fs-search`、`tool-shell`、`background-tasks`、`apps/desktop`、`apps/web`

**Key Actions:**

- **M6 测试稳定性**：`tool-runtime` 的 runtime 测试把工作区写死成 `/workspace`，在这个路径是符号链接的机器上有 3 个用例失败；改用真实的临时目录。JSONL 的增量读在文件大小和时间戳都没变时认为文件没变，同一个时钟刻度内的等长改写会被漏掉；现在这种情况再比对末尾 4 KiB。
- **M9 打开中的会话的读路径**：读一屏、翻页、展开工具详情从归档读的事件数不再随会话长度增长。轮次、请求、工具调用在日志里的位置索引从冷会话缓存里抽成独立模块（`history-index.ts`），会话控制器给每个打开中的会话就地维护一份，每次只折叠新写入的事件。打开后第一次读把归档历史过一遍而不是两遍；展开一条工具详情只读这次调用自己的事件。子 Agent 一次运行收尾和读最后一条 `turn/start` 不再从头遍历日志。
- **M7 Agent Host**：线上错误分成三类，只有请求本身写错了才把原因原样发回设备，Host 自己出的错只回固定的一句并记到 Host 日志。分块下载只读请求的那一块，整文件的完整性校验按文件版本记住。新建上传时的暂存配额从内存里算。上传目录里有别的程序留下的条目（名字不是上传 id，比如 `.DS_Store`）时，清理跳过它；原先清理会抛错，Host 启动不了，运行中则转成不接收新任务的状态。这一条是整理没做的事项时核对代码发现的原有问题。
- **M3 `web_fetch`**：域名只解析一次，连接只连检查过的地址；IPv6 字面量地址能正确判断是不是公网地址。
- **L2 hooks 规则**：打开 biome 的 `useHookAtTopLevel`。两个以 `use` 开头的普通方法改名：`BrowserBridgeService.useSourceExtension` → `setSourceExtension`，桌面端 bridge 契约的 `browserBridge.useBundledExtension` → `switchToBundledExtension`。IPC channel 的字符串没有变。
- **L9 子进程环境**：交给工具子进程的环境变量多剥几类凭据：名字是 `DATABASE_URL`、以 `_PWD` 或 `_DSN` 结尾的，以及值里带 `://用户名:密码@` 的。代理变量（`HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`）不按值剥。
- **L9 ripgrep 输出解码**：`grep` / `glob` 读 ripgrep 的输出时，一个多字节字符被切在两块之间不再变成乱码。
- **L9 输出订阅的正则**：后台命令的 `notifyOnOutput` 正则放到单独的线程里匹配。一批输出行 5 秒内没有匹配完，就结束这个线程、停掉这条订阅，并发一条 `subscription_stopped` 通知唤醒模型；命令继续运行。界面上这条通知显示「输出订阅已停止」。

### 🧠 Design Intent (Why)

**M9。** 打开中的会话原先每次读都靠 `journal.project` 增量折一份轮次边界，展开一条工具详情要把整份日志读出来再按 `callId` 过滤，打开后的第一次读把归档历史过两遍。位置索引让这三种读都只碰窗口内的事件。返回内容和原实现逐字节一致：提交前用 4 种会话形态、7,806 组读取参数对拍过（对拍脚本没有入库）。

没有解决的部分：每次读仍然要重建整份会话快照并校验一遍（`assertJson`），打开后第一次读要回放读模型，这两处随会话长度增长，而且第二处随工具调用次数按平方增长。它们的数字和线索写进了 `docs/exec-plans/perf-backlog.md` 的 P5、P6，这批不做。审查里点名的另一处（`jsonl-reader.ts` 每次追加 `[...resume.events, ...next]`）量过之后不改：它复制的是指针，而「已经交出去的读取结果不会在持有者手里变化」是有测试守着的契约；同一条路径上真正的开销是投影状态的 JSON 往返。

**M7。** 原先所有 `TypeError` 都当成「参数不对」带着原始信息发回设备，而 JavaScript 自己在内部出错时抛的也是 `TypeError`，信息里可能带本机路径。分块下载原先每取一块都把整个文件读进内存算一遍 SHA-256；新建上传每次都把所有上传的状态文件读一遍。校验结果按文件版本（设备号、inode、大小、mtime、ctime）记住，文件写完头 2 秒内不记，因为同一个时钟刻度内的改写从时间戳上看不出来。

**M3。** 原先检查地址时解析一次域名，`fetch` 发请求时再解析一次，两次的答案可以不同（DNS 重绑定），检查过的地址和实际连的地址不是同一个。现在请求用 `node:http` / `node:https` 自己发，`lookup` 只返回检查过的地址。地址分类改用 `net.BlockList`。原先的写法把带方括号的 IPv6 主机名当成域名去解析，所有 IPv6 字面量地址的网址都读不了；域名解析出 `::ffff:7f00:1` 这种写法的回环地址时又会被判成公网。`198.18.0.0/15` 有意放行：fake-IP 模式的代理把所有域名都解析到这个网段。设置了 `NODE_USE_ENV_PROXY=1` 时仍然走 `fetch`，因为这时连的是代理，目标地址由代理解析。

**L9 子进程环境。** 代理变量不按值剥：需要带账号的代理才能上网的机器上，剥掉它命令就连不了网。代价是命令能读到代理密码，这一条写进了 `docs/SECURITY.md`。值的检查第一版是一条带协议前缀的正则，对长串类似协议名的字符是平方耗时（50 KB 2.2 秒，200 KB 约 35 秒），提交前换成了先找 `://` 再用粘性正则匹配。

**L9 输出订阅。** 正则是模型写的，一行最长 4,000 个字符。`(a+)+$` 这样的写法对 30 个 `a` 加一个 `!` 要算十几秒，每多一个字符翻一倍，期间主线程不动，这个进程里所有会话都停住。JavaScript 没有办法给一次正则匹配设超时，只能放到另一个线程里、超时就结束线程。停掉订阅时单独发一种通知而不是复用「输出匹配」，因为模型可能正等着匹配，需要知道不会再有匹配上报。匹配变成异步之后，命令结束时还没匹配完的行不再匹配；结束通知本身带着输出尾部。

### ✏️ 对提交说明的四处更正

这个 PR 里有四个提交的说明各有一处写得不准。仓库约定不改写已有提交，在这里更正：

- `06ffe517`（M9）写「每条事件复制一次数组」。实际旧代码是增量折叠，只在遇到 `turn/start`、请求记录、系统提示词记录、工具定义记录时复制一次数组，不是每条事件一次，也不是每次读重新折叠。
- `bd95b85e`（M3）写「30 个应拒绝的字面量」。测试里实际是 32 个。
- `dac05f59`（L9 子进程环境）写新的检查对 200 KB 的值「实际不到 1 毫秒」。三种输入实测是 0.15、0.59、3.80 毫秒，都远低于测试断言的 200 毫秒。
- `fbc8b2cf`（M9 补的两条边界用例）写这两处改错「提交 `06ffe517` 时靠没有入库的对拍脚本发现」。只有 `requestOffset` 那一处是这样；工具详情延后阈值的 `>` 写成 `>=` 当时对拍脚本也没有发现，是这次补用例才第一次有测试守着。

### ✅ Verification

- M6：`tool-runtime` 的 3 个用例在 `/workspace` 是符号链接的机器上通过；JSONL 增量读新增「同一时钟刻度内等长改写」的确定性用例。
- M9：规模测试 `session-read-projection.scale.test.ts`，1k 与 10k 事件的会话读一屏、翻页、展开工具详情从归档读的事件数相同。旧实现上它失败：第一次读把归档过两遍（多读 944 / 9,944 条），展开工具详情读 944 / 9,944 条而不是 2 条。在新读路径上选 13 个点各改错一处，入库的测试能发现 12 处；剩下 1 处不改变结果。
- M7：`artifact-download-io.test.ts` 用计数的文件系统量读取量。2 MiB 快照分块下完读 2 到 2.1 倍文件大小，旧实现 71,317,788 字节（约 34 倍）；600 KiB 附件旧实现 47,320,219 字节（约 77 倍）；20 次新建上传 `readdir` 0 次，旧实现 20 次。下载途中文件被改，快照和附件都拒绝；旧实现的附件读取会把改过的内容发出去。上传目录里放一个 `.DS_Store` 和一个无关目录，清理正常完成、两个条目原样留着；修之前这条用例在清理那一步失败。
- M3：32 个应拒绝的字面量、9 个应放行的字面量；本地 HTTP 服务上验证请求只连给定的地址、不自己解析域名，gzip 与 br 能解码；重定向的每一跳各自检查、各自只解析一次。
- L2：打开规则后 `pnpm lint` 通过；临时写了一个在 `if` 里调用 `useState` 的组件确认规则会报真实的违规，确认后删除。
- L9：环境变量 56 个用例，含一条「200 KB 的值不是平方耗时」。ripgrep 解码用例用一个把「中」字拆成两次写出的假 `rg`，旧代码输出乱码。输出订阅的慢正则用例在旧代码上主线程卡住 11.6 秒后失败，新代码主线程最长停顿小于 1 秒。
- `pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过；基线里 `session-controller.ts` 的整份读从 4 处降到 3 处，`subagent/src/manager.ts` 的整份遍历从 2 处降到 0 处。

### 🔁 2026-11-13 补充：同步 `main`，修两处推送后才发现的 CI 失败

11-10 推送后没有等 CI 跑完就接着做下一个 PR。11-13 回来看，#85 有两项检查是红的，都是这个 PR 自己的问题；`main` 这时已经合了 #82、#86–#90，这一批的三个 PR 也要先同步。

- **同步 `main`**：从栈底往上逐层用合并提交同步（`main` → PR 1 → PR 2 → 这个分支），不改写已经推送的提交。这个分支和 #90（子智能体并入后台任务）都改了后台任务登记表，要手工解决的冲突四处：
  - `registry.ts`：`main` 删掉了 `task_wait`，这个分支加了 `notifySubscriptionStopped`，两边都保留。
  - `registry.test.ts`：两边在同一个位置加的用例全部保留。
  - `agent-background-tasks.md` 的「通知与唤醒」：用 `main` 改写后的条目，保留这个分支加的正则匹配那一条。
  - 发布记录：按日期倒序排。

  其余两边都改过的文件（`subagent/src/manager.ts`、`ipc/guards.ts` 和它的测试、`BackgroundNoticeRow.tsx`、`desktop-bridge/contract.ts`）由 git 自动合并，合并后跑了全量验证。
- **「官网」构建失败**：PR 2 和这个 PR 各加了一条 2026-11-10 的发布记录。官网的更新日志解析器要求一个日期只有一条发布，`pnpm build:site` 报错。两条合成一条，内容不变。
- **CodeQL 报了一条 high**：`child-process-env.ts` 里判断值里有没有 `://用户名:密码@` 的那条粘性正则，被报成多项式复杂度。这条正则单独拿出来确实是平方级的（不带 sticky 标志时，4 万个 `:` 要 1.07 秒）；代码里是先用 `indexOf` 找到 `://`、再带着 sticky 标志只匹配这一个位置，实际是线性的，但要把正则和调用它的循环放在一起才看得出来。换成逐字符扫描的 `startsWithPasswordUserinfo`，不回溯。新旧两种写法在 200 万个随机串上结果全部一致（对比脚本没有入库）；测试补了 6 条边界，上面 Verification 里写的 56 个用例现在是 62 个。
- **「包测试」随机失败**：同步之后 #83 和 #85 的「包测试」各红了一次，`main` 自己也红了一次，是 #90 带进来的三种依赖时间的失败，和这一批的改动无关。修在第 1 个 PR 上，见 `docs/histories/2026-11/20261113-1311-flaky-package-tests-and-registry-dispose.md`。

前两处当时没发现的原因：本地验证没有跑官网的三条命令（`pnpm check:site`、`pnpm test:site`、`pnpm build:site`），推送后也没等 CI 跑完。之后每个 PR 的本地验证都带上这三条；上一个 PR 的 CI 跑完并且通过，才给下一个分支建 PR。

### 📁 Files Modified

- `packages/core/tool-runtime/src/test/runtime.test.ts`
- `packages/session/session-persistence-jsonl/src/jsonl-reader.ts`、`storage.ts`
- `packages/session/session-storage/src/index.ts`
- `packages/session/session-projection-cache/src/history-index.ts`、`journal-cache.ts`、`index.ts`
- `packages/core/runtime/src/session/session-controller.ts`、`session-read-projection.scale.test.ts`、`session-projection.test.ts`
- `packages/subagent/subagent/src/manager.ts`
- `packages/host/agent-host/src/server.ts`、`rpc.ts`、`artifacts.ts`、`uploads.ts`、`verified-content.ts`、`node-ports/artifact-store.ts`、`approval.ts`、`auth.ts`、`bootstrap.ts`、`live-output.ts`、`payloads.ts`
- `packages/util/shared/src/host-protocol/index.ts`、`child-process-env.ts`、`desktop-bridge/contract.ts`
- `packages/web/tool-web/src/public-request.ts`、`node-ports.ts`
- `packages/fs/tool-fs-search/src/node-ports.ts`
- `packages/shell/tool-shell/src/node-ports.ts`
- `packages/background-tasks/background-tasks/src/registry.ts`
- `apps/desktop/src/main/browser-bridge-service.ts`、`ipc/guards.ts`、`plugins/optional-plugin-stubs.ts`、`runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/components/extensions/BrowserConnectPanel.tsx`、`messages/BackgroundNoticeRow.tsx`
- `apps/web/src/pages/session/blocks/EventRow.tsx`
- `biome.jsonc`、`scripts/hot-path-reads-baseline.json`、`scripts/scale-test-coverage.json`
- `docs/SECURITY.md`、`docs/design-docs/agent-runtime/agent-progressive-session-loading.md`、`docs/design-docs/collaboration/agent-background-tasks.md`、`docs/design-docs/tool-system/agent-web-tools.md`
- `docs/exec-plans/perf-backlog.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/releases/feature-release-notes.md`
- `packages/host/agent-host/README.md`、`packages/session/README.md`、`packages/shell/tool-shell/README.md`、`packages/web/README.md`
- 以上各包对应的测试文件；新增的有 `agent-host` 的 `artifact-download-io.test.ts`、`verified-content.test.ts`，`session-projection-cache` 的 `history-index.test.ts`，`tool-web` 的 `public-request.test.ts`
- `docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`、`execution-summary.md`
