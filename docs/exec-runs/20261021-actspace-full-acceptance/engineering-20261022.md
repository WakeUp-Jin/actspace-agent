# 工程验收基线与补充验证

版本：主仓库 fix/settings-model-select / HEAD 00d6b763，包含未提交产品实现；恢复前哈希与 version-initial.json 完全一致。BUG-001只改测试，BUG-003只改文档，未改变产品运行源码。不以本表通过代签真实UI、Provider、扩展和外部设备。

原始日志统一放在 `tmp/codex-acceptance/20261021-actspace-full-acceptance/`（本地证据，不随仓库分发）。

| 命令 / 范围 | 实际结果 | 证据 / 边界 |
| --- | --- | --- |
| 前轮 `pnpm build` | 通过（退出0，已有终态输出本轮复核） | build.log；主仓库产品源码未变化 |
| 前轮 `pnpm typecheck` | 失败，Desktop测试两处TS2488 | typecheck.log；BUG-001 |
| 修后 `pnpm --filter @actspace/desktop typecheck` | 通过（renderer+electron） | desktop-typecheck-fixed-20261022.log；全仓其他包修前已完成，未被测试文件改动影响 |
| `markdown-blocks` 定向vitest | 7通过 | markdown-blocks-fixed-20261022.log |
| 前轮 `pnpm test` | 失败，在current-docs停止；不声称后续自动运行 | test.log；BUG-003 |
| 前轮直接 `pnpm -r --if-present test` | 各包终态Done，Desktop 1926通过/7跳过；Web101通过；CLI11通过；Site23通过 | package-tests.log；其中流式性能5项、SSH1项与editor1项跳过，不能计通过；Cordis另有1跳过 |
| 补跑 contract-matrix / renderer-bridge / harness-events / ipc / frontend-tokens tests | 43项中40通过、3失败 | remaining-root-tests-20261022.log；两条矩阵失败为BUG-004，一条token失败为BUG-002 |
| `pnpm test:harness-recovery` | 1通过 | harness-recovery-20261022.log |
| `pnpm test:agent-host:process` | 7通过 | host-process-20261022.log；本机独立Host真实网络，受控模型/Provider，不等同云端和Desktop交互 |
| `pnpm test:agent-cli:process` | 12通过 | cli-process-20261022.log；SIGINT、真实HTTP受控Provider、成功/错误/重试/恢复；未证明商业Provider、SIGTERM、TTY全路径 |
| `node --test apps/desktop/scripts/test-usage-read-model.mjs` | 69通过 | usage-read-model-20261022.log；真实SQLite工作线程夹具，非用户历史UI对账 |
| `pnpm check:ipc-channels` / `check:renderer-bridge` / `check:frontend-theme` / `check:packages` | 通过 | 初始engineering-results.tsv与对应日志，产品源码一致 |
| `pnpm check:frontend-tokens` | 失败 | BUG-002，check-frontend-tokens.log；未抬基线 |
| `pnpm check:docs` / `check:current-docs` / `test:current-docs` 修后 | 通过；current-docs测试7通过 | docs-fixed/current-docs-fixed/current-docs-tests-fixed-20261022.log；BUG-003闭环 |
| `pnpm check:browser` | 通过 | browser-static-20261022.log；注册表、locator、cursor与扩展contract |
| Browser CLI与protocol分别 `go test ./...` | 通过 | browser-cli-go/browser-protocol-go-20261022.log；没有测试文件的包不计测试覆盖 |
| `go run . doctor --json` | CLI/manifest可用，RPC socket离线 | browser-doctor-20261022.log；退出0不是扩展连接通过，真实62action未执行 |
| `pnpm check:site` / `pnpm build:site` | 通过；51个Astro文件0错误/警告/提示，46路由构建 | site-check/site-build-20261022.log；未证明线上部署和浏览器实际交互 |
| opt-in trajectory-streaming-perf vitest | 5通过，前轮跳过项已补跑 | trajectory-perf-20261022.log；仅夹具微基准，数值及边界见performance.md，非T1–T5签收 |
| 现有 verify-trajectory-electron.mjs | 退出0，11项检查通过 | electron-trajectory-script/result-20261022；真实Electron/preload/IPC、25轮夹具Journal、20轮分页与更早历史、工具结果/Schema、commit通知、草稿切换和reload。无真实Provider，不代签原生AX/IME/VoiceOver |
| managed CLI重新打包与包外smoke | 退出0 | cli-package/cli-package-smoke-20261022.log；独立outdir、解压临时目录运行，详见cli-20261022.md |
| CLI补充真实HTTP/文件/信号与制品核对 | 结果见逐子项报告 | cli-extra-20261022/；SIGTERM立即恢复的锁拒绝符合30秒租约，过期且PID退出后成功恢复；完整性20118条无差异 |

根入口仍有BUG-002/004；本轮不把分开执行的测试拼成根测试全绿。待处理工程问题已记录建议，不阻断其他功能验收。

补充：Browser helper旧Runtime导入路径为BUG-006，已仅修fixture路径并实际导入/ping复验；Journal故障副本及canary见[可靠性报告](reliability-20261022.md)。原CLI正常输出未出现测试Key的结果不覆盖上游故意回显错误；新场景明确复现BUG-008，不能继续称全部出口脱敏通过。

独立制品：release-manifest.json、Browser component verify、app/DMG/tar.gz生成通过；签名/公证未做。Playwright packaged launch与直接隔离启动没有形成可见窗口，不能作为安装制品通过，详见 execution-process。

设置迁移补测：构建SettingsStore实际读取v1–v4 fixture副本与layers1→2，备份原字节、二次load幂等通过；不代签OS crypto/UI/用途路由，见reliability-20261022.md。

最终轨迹组件定向vitest（trajectory-session-source/subagents-panel/trajectory-details）3文件18项通过，日志final-targeted-tests-20261022.log；包含React act警告，未据此冒充真实交互。Host55项与独立进程7项的具体边界见[Host报告](host-20261022.md)；14个文件工具真实Runtime调用见[文件工具报告](filesystem-runtime-20261022.md)。

Skill发现优先级、目录无正文/按需读取、Todo 6次工具调用真实Runtime补证见[扩展补表](extensions-runtime-20261022.md)，未代签Desktop投影。

网络/媒体7次真实Runtime工具结果及真实公共HTTPS抓取/缓存见[补表](network-media-runtime-20261022.md)，未代签商业搜索、合法看图/生成和Desktop附件。当前源码哈希复核 version-current-20261022.json：初始2344项中仅BUG-001测试及BUG-006验收helper两项变化，无缺失项。

默认跳过项补验：`ACTSPACE_REAL_CORDIS=1` 的cordis-lifecycle单文件10项通过（其中9项此前已运行，只有原skip的一项新增覆盖，不累加为10项新增）；真实Loader/Include/Group/Timer挂载与排空有证据，日志cordis-real-optin-20261022.log。`ACTSPACE_TEST_SSH=1` 的remote-host-ssh 1项通过，真实系统sshd/ssh隔离配置、未知/错误指纹拒绝、授权转发、端口冲突、未授权Key拒绝，finally清理；日志ssh-real-optin-20261022.log。不是Desktop配对UI通过。Editor PoC的IME发送测试仍为源码显式skip，未通过删skip或改断言使其变绿。

## 未签名制品的只读系统评估

- `desktop-package-assessment-20261022.json`保留只读codesign/spctl输出：应用与主可执行文件均为`code object is not signed at all`，spctl退出3、`rejected / source=no usable signature`。正式脚本无签名参数时会移除顶层签名，与manifest的signature=none一致。
- 这解释了当前产物缺少系统可接受签名的事实；没有证明此前SIGKILL一定由Gatekeeper/AMFI发起，不把推测写成已定位根因。未自行签名、修改系统策略或安装。安装制品启动/升级历史专项仍未覆盖。
