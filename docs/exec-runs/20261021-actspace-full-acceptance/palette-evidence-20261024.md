# BUG-050 原生复验与版本主审（2026-10-24）

主智能体核对真实原生R50-1–5、独立Sol/high审查与磁盘保护后关闭BUG-050。09-P3-4恢复未覆盖：已解决合法矮窗可见性问题，真正“上方不足且下方足够”的原生翻转仍无场景证据；不能以组件room-below样例代签。

## 版本、方法与证据

分支fix/settings-model-select、HEAD00d6b763加既有dirty源码；296源码摘要`c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90`，2342制品摘要`d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2`。主侧与独立审查均逐文件核对无漂移。

旧manifest聚合说明有顺序描述偏差：build摘要实际按清单保存顺序compact JSON计算；2342项全局按path重排后为`0414e6c669881616cefa56c2a4fac395c0768a0fda88898162b2f933b6eb5674`。原清单和摘要不覆写；这不是制品漂移，后续清单明记保存顺序。

原生执行者原始配置为gpt-6.1-sol/high，main81736/renderer81783，独立profile、静态renderer、CDP55092仅只读。完整本地证据根`tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/`，不随仓库分发：

- `bug050-native-20261024/native-evidence/report.md`及20组状态JSON/AX、关键JPG：原生动作与中间态。
- `resume-r50-audit-high/report.md`及audit-summary.json：独立审查，未冒称新原生动作。
- `bug050-native-20261024/resume-main-verification.json`：296源码、2342制品、112原保护文件无漂移，profile无Journal，12自有Skills。
- `native-method-gate-20261024/report.md`和owned app-exit：真实CmdQ、19:21:55.541Z退出code0，main/renderer消失。此批复核当前API无新增系统按键、hover、叠层/音频、Mac窗口ID/标题入口；相关原编号缺口不变，不重复同条件失败。

## 原要求逐点结果

| 点 | 主审结论与证据 |
| --- | --- |
| R50-1 | 合法1440×760、空草稿，主页和Skills整卡/搜索/返回在屏内，真实返回通过。 |
| R50-2 | 同655字符16行草稿、textarea200及panel279..537；Skills从修前top−51/高322变为top8/高263。列表client221、scrollHeight1064，真实滚轮与ArrowUp环绕末项可见通过。 |
| R50-3 | 真实唯一过滤、返回、Esc回textarea，655字符保留，最终清空通过；未选Skill、未发送。 |
| R50-4 | 浅色1440/480及深色1440代表通过；不是全部排列。System/新建页/空草稿恢复，原1440×861恢复为1440×860的1px精度限制保留。误命名light-wide实际480，采用draft-skills作为浅色宽屏证据。 |
| R50-5 | 20份观察均无会话/消息/停止；主侧核profile无Journal、112原文件和冻结源码/制品均不变。无Provider启动或模型发送，只有本批fixture；自有应用随后正常退出。 |

## 工程及剩余边界

审阅原日志：真实布局红测到达边界断言并失败；修后12组通过，相关120测试通过。首次Desktop2007断言通过但HoverCard销毁后异常exit1保留；随后2 worker完整253文件/2007通过、2文件/7项跳过、exit0。双端类型检查、renderer构建及既有前端门禁记录通过，当前制品哈希吻合；本次为旧日志审查，不冒称全部重新运行。设计、前端验证入口、history及学习记录已同步；本次current-docs检查通过。

当前165项103通过、0失败、62部分或未覆盖；50个Bug中49关闭，仅BUG-039尚未关闭。未覆盖、有限窗口未收敛、缺方法/权限/设备/最终整合各按原项保留，Goal继续active，不提交、推送或发布。
