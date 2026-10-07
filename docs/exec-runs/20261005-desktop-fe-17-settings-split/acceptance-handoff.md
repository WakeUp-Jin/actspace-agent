# 17 settings-service 拆分验收交接

- 主线提交：`fcdc0de5`（`refactor/desktop-frontend`）
- 子分支：`refactor/desktop-fe-17`（`ec7dca02`..`6f869aa6`，共 15 个提交，每个 T 一个提交；T7 分 5 个提交，另有复核与 Electron 检查、收尾各一个提交）
- 状态：**可以交给验收**（2026-10-07）。没有需要你判断的事项。
- 启动方式：
  - `pnpm --filter @actspace/shared build`，然后 `pnpm --filter @actspace/desktop build`。
  - 这份计划改的是设置的读写，**建议用你平时的数据目录直接启动**，看现有设置是否完好。要先保险的话，把数据目录复制一份，用 `ACTSPACE_DATA_DIR=<副本目录>` 启动：在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=<副本目录> node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。

## 阶段：17 全部（T0–T8，单阶段）

### 用户能感知到的变化

- **没有**。这是纯搬迁：`apps/desktop/src/main/settings-service.ts`（2637 行）按职责拆到 `apps/desktop/src/main/settings/` 下 19 个文件，原文件只再导出原来的 API。
- `settings.json` / `secrets.json` 的格式、旧版本迁移和备份、写失败时的回滚、并发写的排队、写进环境变量的时机都不变。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/desktop typecheck`；settings 相关文件另开 `--noUnusedLocals` | 通过 | — |
| test | desktop vitest | 文件 192 通过 / 1 跳过，用例 1547 / 2 跳过，没有失败；比 17 开始时多 1 个文件、38 个用例 | `execution-process.md` 各 T「验证」 |
| 构建与脚本 | `pnpm --filter @actspace/desktop build`、`check:current-docs`、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` | 通过 | — |
| 特征测试 | 搬迁前先写 38 条，覆盖迁移、v4 读写、加密与 0600、回滚、串行、custom connection、写 env、通知、system prompt 文件 | 搬迁全程不改断言，一直通过 | `M/test/settings-characterization.test.ts` |
| 搬得对不对 | 工具逐个比对声明正文；类方法规范化后比对；公开方法签名和 13 个导出逐个比对 | 顶层声明全部一致；方法 41 个里 39 个一致，另 2 个是有意改写的 system prompt 读写；签名和导出一致 | `execution-process.md` T2–T7 |
| 用例确实能拦住错误 | T6、T7 各一轮变异检查 | 第一轮各有拦不住的改动，补用例（T6 +6、T7 +4）后全部能拦住；新用例先在改动前的代码上跑通 | `execution-process.md` T6、T7 |
| 范围复核 | Sonnet 只读子智能体，对照 `cd325f96` | 没有发现行为变化 | `execution-process.md`「复核与 Electron 检查」 |
| Electron：迁移 | 构建产物，临时数据目录，放入 v3 fixture 启动 | 迁移成 v4；`settings.v3.backup.json` 与 fixture 逐字节相同，sha256 一致 | `screenshots/electron-after-migration.png` |
| Electron：写入与重启 | 通过 bridge 新建自定义连接、设置 Tavily key（都是假 key），重启 | 连接和 key 都保留；`secrets.json` 是 v2、0600；模型页显示连接，搜索页 Tavily「已连接」；没有应用层报错 | `screenshots/electron-models-after-restart.png`、`electron-search-after-restart.png` |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 用平时的数据目录启动，依次打开设置的通用、外观、模型、搜索、工具、子 Agent 页 | 所有设置和改动前一样；已连接的模型、搜索服务仍是「已连接」 | 规则不允许我读写你的真实数据 |
| A2 | 改默认会话模型和一个工具开关，退出再打开 | 改动保留 | 同上，需要真实数据 |
| A3 | 模型页新建或编辑一个自定义连接（真实 Base URL 和 Key），点检测，再在会话里用它发一条消息；重启后再看一眼 | 检测结果正常；能回复；重启后连接还在 | 我只有假 key，只验证到写入和显示 |
| A4 | 让 Agent 联网搜索一次；配了图片生成的话，让它生成一张图 | 都能调用成功，没有「未配置 key」的报错 | 同上，需要真实 key。这一项依赖把 key 写进环境变量 |
| A5 | 搜索页断开一个服务，再让 Agent 搜索 | 不再走这个服务 | 同上 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：设置 → 通用 →「Agent 指令」里改一次「系统提示词」并保存，重开设置后内容还在。

### 已知问题与未覆盖

- **真实 key 的调用**：中转站连通、真实搜索、图片生成都没有验证，以 A3、A4 为准。
- **特征测试记下的现有问题**（17 是纯搬迁，不修；已记技术债「Desktop settings 遗留」）：
  1. 旧接口 `update` / `updateV2` 改 agent 字段时，v4 里已有值就不会写进文件。
  2. 写失败回滚时，恢复 settings.json 失败就不再恢复 secrets.json。
  3. v4 namespace 写入在字节已经落盘后才报错时，只恢复内存、不恢复文件。
- Electron 检查用的是 v3 fixture；更早的 v1 / v2 迁移只有单测（特征测试里的黄金结果）。
- `execution-process.md` 里的路径用了 `M/` 缩写，含义见文件开头。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
