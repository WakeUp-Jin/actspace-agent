# DeepSeek 搜索与抓取执行摘要

## 已实现

三路并行搜索、独立来源启停、URL去重、RRF融合排序和全局截取；DeepSeek抓取默认关闭且独立授权；共享官方Key、设置持久化与每次调用生效；关闭总搜索不影响抓取。CLI显式授权环境变量也已接线。

## 自动化验证

- `pnpm --filter @actspace/runtime... build`：通过。
- `pnpm --filter @actspace/desktop build:deps:dev`：通过（先构建Runtime依赖闭包）。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop build:renderer`、`build:electron`：通过；renderer保留大chunk提示。
- `pnpm --filter @actspace/tools-web-tools test`：19项通过。
- Desktop定向6文件：85项通过，覆盖设置迁移、默认授权、来源启停、凭据热更新及设置UI。搜索总开关新增断言复跑通过；mock bridge另23项通过。
- `pnpm --filter @actspace/desktop test`：1926通过、7跳过、1条compaction用例超时；该超时用例定向复跑通过，不能将初次全量标为全绿。
- `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:ipc-channels`：通过。
- `check:current-docs`：314项旧截图链接缺失；对HEAD归档基线执行同一脚本也是314项，本次新增0。
- `git diff --check`：通过。
- 提交前 `npm run ci`：被上述既有文档截图链接缺失阻断，未声称完整CI通过。

## Computer Use

由gpt-6.1-sol完成，见 [逐项验收](computer-use.md)。mock UI通过入口/费用、默认关闭、DeepSeek/智谱/Tavily三路启停组合、共享Key、抓取独立、浅深主题、480px与Space代表操作。TinyFish/Exa未逐一配置切换。真实Electron窗口已观察，但原生AX反复超时/索引失效，缺Key禁用和真实保存重开未获CU签收；缺Key禁用由组件单测覆盖。

另补真实Electron工程验证：通过真实preload的 settings.getV4/updateV4 调用检查默认关闭、独立写入、JSON落盘，再退出进程重启读取一致；结果见 [工程证据](electron-ipc-result.json)。该检查没有写入Key，不调用外部Provider，也不是原生CU通过。退出时日志出现既有Usage read model disposed竞态提示，未影响设置断言，不扩大本轮修复范围。

可复验脚本：[verify-settings-ipc.cjs](verify-settings-ipc.cjs)。先完成Desktop构建，使用新的隔离目录（必须以 `/tmp/actspace-deepseek-ipc-` 开头）运行：

```sh
ACTSPACE_DATA_DIR=/tmp/actspace-deepseek-ipc-review node scripts/run-electron-dev.mjs docs/exec-runs/20261018-deepseek-web-tools/verify-settings-ipc.cjs
ACTSPACE_DATA_DIR=/tmp/actspace-deepseek-ipc-review ACTSPACE_VERIFY_ONLY=1 node scripts/run-electron-dev.mjs docs/exec-runs/20261018-deepseek-web-tools/verify-settings-ipc.cjs
```

第二次必须复用第一次目录。通过时输出DEEPSEEK_IPC_OK，并在该隔离目录生成两份不含凭据的结果。

## 真实服务边界

未使用真实DeepSeek账户调用Search/Fetch，未验证联网结果质量、实际余额扣费或远端站点覆盖率。单测使用fake fetch，不能视为真实API成功。需要实际服务验收时：显式开启对应来源/抓取，执行一次搜索与一次公共URL读取，核对来源输出及平台计费；关闭后再次读取应走本地。

## 回退和交付

关闭DeepSeek搜索与抓取即可停止后续付费请求，原智谱/国际搜索和本地读取仍可用。已开始的请求可能完成。分支提交与PR状态以Git及远端记录为准。
