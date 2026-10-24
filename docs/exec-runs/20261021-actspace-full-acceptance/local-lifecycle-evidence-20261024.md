# 本机生命周期与历史 worktree 原生补验

2026-10-24；主侧审查后，11-A4、11-B1按原要求通过。附件普通文件过滤和 hover 仍未覆盖。执行均明确派发 `model="gpt-6.1-sol"`、`reasoning_effort="high"`、`fork_turns="none"`；没有将先前批次倒标 High。

## 验收点、分组与版本

先列验收点：真实终端保持 shell 活跃；Review 触发正常只读 Git；通过产品入口运行 Desktop 拥有的 Browser Bridge 命令；一次原生 ⌘Q 后逐 PID 检查退出；已有历史 worktree 打开树、预览、Review。操作按终端→Review→文件树/预览→Review 刷新→Chrome 能力连接详情→退出分组。

当前冻结源码298条，SHA256 `24a1e8a4c1c7c68d3e1fc92bedc08fdc44a60c51460456758db895eca484c926`；制品2423条，SHA256 `56bbfa4f1162e0118cf11587c0570aea37ee49ee1ed201f7ac0fcd809b956eda`，HEAD `00d6b763`及已有未提交改动。静态 file renderer，独立 profile。主侧没有在验收中重建、HMR或修改源码。

本地证据根为 `tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/`：

- [原生独立报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/local-lifecycle-20261024/native-evidence/report.md)：LC1–4及当前历史B短复验。
- [所有权预检](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/local-lifecycle-audit-high/report.md)：真实产品路径、进程归属与环境隔离。
- [11-B1来源追溯](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/old-worktree-scope-high/report.md)：原交接、统一计划及已有原生证据；属于只读审查，不冒充新交互。

## 11-A4：真实退出与进程回收

main PID32170，bundle `com.actspace.acceptance.bug038`，profile `local-lifecycle-20261024/profile`，CDP52394仅作只读旁证。真实终端执行 printf 显示 shell PID36957、PPID32170，再以 pwd 确认自有B工作树；shell没有预先 exit/kill。

Review 实际展示 ONLY_B 及 TARGET 的B差异并刷新。Git命令可能极短，40ms目标间隔的进程观察未捕获具体Git PID，不伪造PID。能力页按“Chrome浏览器→开始连接”合法安装到本批隔离 support/manifest/socket，显示等待扩展和诊断；捕获 Desktop-owned `abb.tmp… help` PID42516、PPID32170，以及四个短 `(abb)`，均在退出前自然结束。没有启动Chrome-owned Native Host，也没有覆盖用户全局登记。

无modal、草稿为空且shell仍活着时，16:24:18.505Z调用原生 `app.pressKey('super+q')` 恰好一次；退出事件16:24:18.943Z，code0、signal null。原生返回 App quit，清单isRunning=false。退出后约5秒，观察器的84个后代均消失；约30/65秒直接ps及主侧最终核对包含main和旧后代的85个PID，均无残留，包含防止reparent后漏检的旧PID。应用退出后才停止driver，不以driver CtrlC、app.close或kill代替⌘Q。

原A4要求“打开终端、触发一次Git后⌘Q，无shell/git/Browser Bridge残留”；未要求恰在退出瞬间制造常驻Git/abb。当前按该原范围通过；明确未验证退出瞬间正在运行的Git/abb中止，不将短命令自然完成写成中止成功。此处app-bound⌘Q不证明OS全局快捷键BUG-039。

## 11-B1：已有历史 worktree 的树、预览及 Review

原交接仅要求“如果旧数据里有worktree会话，打开文件树、预览、Review，正常”，并未指定某个旧header/schema迁移版本。此前台账追加的“旧版本header迁移样本”没有找到上游依据，本次校正为原范围，不改其他历史兼容编号的要求。

使用已有B会话66a78f2b-3587-4d07-a35c-6fc8f7692aca，创建于2026-10-22，跨运行/构建保留；从原fixture到来源副本及本批副本的Journal均80158字节、SHA256 `0bb3a2fe508b07afaad2a51e70bcaec97f8b96b0456a17fcc94266c22c10b5e4`，没有新建会话、改header或发请求。当前原生树实际出现ONLY_B，打开TARGET正文为WORKTREE_B_MODIFIED_TARGET，显式打开B Review并刷新后保持ONLY_WORKTREE_B及B正文。主侧核对截图与AX。结合既有A/B原生路线，11-B1通过；不宣称未知发布版本schema迁移、P2-R01或最终F6通过。

## 首批受工具限制的尝试与保护结果

先前 `local-native-20261024` 的LN1–4均未覆盖，[原报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/local-native-20261024/native-evidence/report.md)保留。GoToWindow对话框路径无法按真实原生路由导航/关闭，未到达PNG/TXT对照；接口没有hover/move，不以focus代替。modal下⌘Q未退出，后来app.close是清理，不能计通过。新批是在无modal的新独立实例重新走真实退出路线，不抹去前次限制，不登记为已确认产品Bug。

两批均已释放桌面。最终核对2721条冻结状态、17个原fixture文件及用户Chrome全局manifest均无变化。历史B原副本与本批Journal哈希相同，无Provider请求。11-A4/11-B1新增通过后为165项103通过、0失败、62部分或未覆盖（62.4%）；49条Bug中48关闭，仅BUG-039未关闭。Goal保持active，继续剩余可执行项。
