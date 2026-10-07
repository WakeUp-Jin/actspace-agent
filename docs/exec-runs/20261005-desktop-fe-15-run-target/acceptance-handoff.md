# 15 运行目标验收交接

- 主线提交：`refactor/desktop-frontend` @ `856b776f`；验收反馈第 1 轮修复 `7154f57d`
- 补记：squash 提交信息里写的「共 32 个提交」有误，子分支实际是 31 个（`06760433`..`006fe160`）
- 子分支：`refactor/desktop-fe-15`（`06760433`..`3a879d32` 是 T0–T15 和复核修复，后面另有一个收尾提交）
- 状态：**可以交给验收**
- 启动方式：
  - 先运行 `pnpm install`（如有需要）和 `pnpm --filter @actspace/shared build`，再运行 `pnpm --filter @actspace/desktop build`。
  - Electron：在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。验证真实 Host 时用已配对过 Host 的数据目录。
  - 浏览器 mock：在 `apps/desktop` 下运行 `pnpm dev:renderer`（vite），浏览器打开 `/?mock=remote-host`。mock bridge 没有实现 `hosts.call`，选远端 Host 时会显示「无法读取机器信息」，这是预期的；我是另外注入假的 `host.describe` 测的。

## 阶段：15 全部（T0–T15，单阶段）

### 用户能感知到的变化

- **远端未就绪时说明原因**：原来只有一句「Host 未就绪」；现在分 11 种状态，例如：
  - 「正在连接 X」「X 未连接」；
  - 「正在读取 X 的工作区和模型」「无法读取机器信息：…」；
  - 「X 正在停止，暂不接受新任务」「X 恢复上次的任务时出错，暂不接受新任务」；
  - 工作区或模型缺失。

  发送按钮的 tooltip 和读屏名称就是原因，草稿可以照常编辑。
- **新建页记住每台 Host 上次的模型**。
- **远端会话的模型和工作区跟着会话走**：切走再切回不变；记录的工作区在 Host 上已经没有时，会说明是哪一个。
- **损坏的会话标识**：显示「会话标识损坏，无法打开这个会话。」，不白屏，也不当成本机会话。
- **远端会话里**：Review 入口、改动摘要条、工作区标题栏控件、右侧开发对象都隐藏（与原来一致，判断方式改了）。
- **Host 被移除后**：它的会话留在侧栏，显示「远端 · 未连接」，待审批标记和本地记录被清掉。
- 其他是内部改动：
  - Host 列表全窗口只订阅一次；
  - 审批按 `hostId` 路由；
  - git 子进程统一入口，非交互，不会等凭据输入。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | desktop vitest、shared | desktop 文件 168 通过 / 2 失败 / 1 跳过，用例 1279 / 2 / 2。2 个失败是基线中已知的 `workspace-git-context-service` 和 composer 偶发用例（单独跑全过）；比 14 结束时多 11 个文件、118 个用例。shared 163 通过 | `execution-process.md` 各 T「结果」 |
| 脚本检查 | `check:renderer-bridge`、`check:ipc-channels`、`check:frontend-tokens`、`check:current-docs` | 通过 | — |
| grep 门槛 | 业务代码里的 `startsWith("host:")`、`remoteSessionRef`、`remote-approval`（renderer）、`useRemoteTarget`、`actspace:remote-models`（迁移代码除外） | 全部为 0 | `execution-process.md` T2、T8、T11、T14 |
| 用例确实能拦住错误 | 变异验证 | 每个 T 的关键判断都有用例失败；存活的都已核实为等价变异并写明理由 | `execution-process.md` |
| mock：新建页选 Host 到发送 | headless Chrome + CDP，`?mock=remote-host`，注入假的 `host.describe` | 通过：工作区和模型来自 Host；换成 web / smart 后发送，建出远端会话，prefs 记下两者 | `screenshots/mock-new-page-devbox-ready.png`、`mock-remote-session-created.png` |
| mock：切换会话 | 同上 | 通过：本机会话只有本机 UI；切回远端会话后模型和工作区不变 | `mock-switch-to-local.png`、`mock-switch-back-remote.png` |
| mock：未就绪文案 | `#devbox=blocked` / `draining` / `fail=devbox` | 通过：文案正确；发送禁用，点击无效；草稿保留；错误摘要去掉了 IPC 前缀和堆栈；console 无报错 | `mock-new-page-devbox-blocked.png`、`-draining.png`、`mock-new-page-fail-devbox.png` |
| Electron：没有 Host | 空的临时数据目录 | 通过：只有「本机 Mac」，没有远端 select，console 无报错 | `electron-empty-hosts-new-page.png` |
| Electron：git 三态 | 临时目录加进临时数据目录的工作区列表 | 无 HEAD 显示「master」，正常仓库显示当前分支，非仓库不显示分支控件。非仓库在中文系统下的状态当时是 `failed`，已在验收反馈第 1 轮修复 | `electron-git-*.png` |
| 范围复核 | Sonnet 只读子智能体 | 没有高、中严重度的确定缺陷；6 条存疑中 3 条属实，已修复（`3a879d32`），3 条不改并写明理由 | `execution-process.md`「复核处理」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 连一台真实 Host。新建页选它，换一个工作区和模型后发送 | 工作区、模型列表来自这台 Host；建出远端会话，select 锁定并显示刚才的选择 | 没有真实 Host，只能用 mock |
| A2 | 再新建一次，选同一台 Host | 模型默认是上次选的 | 同上 |
| A3 | 两个远端会话分别用不同模型，来回切换；重启应用后再看 | 各自的模型和工作区不变 | 同上 |
| A4 | 远端会话里触发一次需要审批的工具调用，批准；再触发一次，拒绝 | 批准后继续运行，拒绝后停止；侧栏待审批标记随之消失 | 需要真实 Host 和模型 |
| A5 | 停掉 Host 或断网 | 会话显示「远端 · 未连接」；发送按钮说明原因；草稿保留；恢复后能继续发送 | 需要真实 Host |
| A6 | 在 Host 上让 describe 失败一次（例如短暂卡住），然后恢复，不断开连接 | 先显示「无法读取机器信息：…」，下一次 Host 列表变化后自动恢复（复核修复） | 需要真实 Host |
| A7 | 侧栏移除一台 Host | 它的会话留在侧栏，显示「远端 · 未连接」，没有残留的待审批标记 | 需要真实 Host |
| A8 | 在升级前用过远端模型选择的数据目录上启动 | 原来选过的模型仍在；localStorage 里不再有 `actspace:remote-models` | 我只有单测覆盖迁移函数，入口调用没有测试 |
| A9 | 打开一个非 Git 目录、一个刚 `git init` 的目录、一个正常仓库作为工作区 | 非仓库不显示分支控件；无 HEAD 显示当前分支名；正常仓库可以切分支 | 我在临时目录上测过；请在真实工作区复看 |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：
  - 设置 → Host 连接：添加、重新连接、移除，列表随之更新；
  - 本机会话的 worktree 菜单、切分支、新建分支；
  - 本机会话附件只收图片；远端会话「图片与文件」都能选。

### 已知问题与未覆盖

- **已修复（2026-10-06，方案 B，`7154f57d`）：中文系统下「不是 Git 仓库」识别不出来**。以下是当时的分析，保留备查。修复后 desktop 全量 1284 个用例全部通过，Electron 实测非仓库返回 `not_repository`。
  - 现象：`workspace-git-context-service` 用 `/not a git repository/i` 匹配 git 的错误输出。在中文系统下 git 输出「致命错误：不是 Git 仓库……」，结果是 `failed`，不是 `not_repository`。基线中唯一的失败用例就是这个原因，Electron 实测相同。
  - 影响：**目前用户看不到差别**。
    - renderer 对 `failed` 和 `not_repository` 的处理相同；
    - main 里只有 `prepareExecutionContext` 区别对待两者，它只被测试调用；
    - review-git 和 workspace-environment 用 `rev-parse --is-inside-work-tree` 判断，不受语言影响。
    - 风险在以后：依赖 `not_repository` 的新代码在中文系统下会出错，测试在中文环境的机器上一直是红的。
    - 我只验证了从终端启动（继承 `LANG=zh_CN.UTF-8`）的情况；从 Finder 启动时环境由 launchd 给，是否复现没有验证。
  - 方案：
    - **A. run-git 对所有 git 调用设 `LC_ALL=C`**
      - 优点：一处改动，所有 service 都不再受语言影响，以后按文本判断的代码也安全。
      - 缺点：直接展示给用户的 git 原文（例如「Could not switch branches.」后面附的 git 错误）会从中文变成英文。
    - **B. 只让 git-context 的 `rev-parse --show-toplevel` 这一次调用用 `LC_ALL=C`**（run-git 增加一个 `env` 选项）
      - 优点：只改分类用的那一次调用，展示给用户的文案不变；测试转绿。
      - 缺点：其他 service 以后如果也按文本判断，需要各自记得加。
    - **C. 不改代码，只让这个测试在 `LC_ALL=C` 下跑**
      - 优点：零风险。
      - 缺点：问题还在，只是测试不再报出来。
  - **我的建议：B**。改动最小、不改用户能看到的文字，又把唯一按文本判断的地方修正了。确认后我在主线上单独提交（附测试），不影响 16 的进行。
- **mock 预置会话的路径对不上**（与基线相同）
  - mock 里的「devbox：跑集成测试」，路径与 Host 的工作区都对不上。
  - 文案是「选择一个远端工作区」，但已有会话的 select 是锁定的，视觉上显示第一项。
  - 真实 Host 上会话路径来自 Host 自己的工作区，一般不会出现。
  - 文案和锁定态的取舍留给 09 的新菜单。
- **取消归档后模型回到默认**
  - 会话被 evict（归档、移除工作区、移除 Host）时删除它的 prefs，这是决策记录定的。
  - 取消归档后，工作区按路径找回；模型回到该 Host 新建页的选择。
- **`review-pr-service` 没有并入 run-git**：它同时跑 git 和 gh，失败语义也不同。理由见执行过程 T13。
- **composer 偶发用例**：`composer.test.tsx`「opens a card listing selected text and comments」在全量满载时偶尔超时，单独跑通过，与本计划无关。
- 远端的 3 个 `<select>` 保留到 09；Composer 的工作区和 Git prop 等 16 拆 Composer 时收进 Context。
- `execution-process.md` 里的路径用了 `R/`、`M/`、`S/` 缩写，含义见计划文档开头。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-06 | 中文系统下识别不出「不是 Git 仓库」（交接里列为待你判断） | 已修 | 见「已知问题与未覆盖」第一条，你选了方案 B | `7154f57d` |
