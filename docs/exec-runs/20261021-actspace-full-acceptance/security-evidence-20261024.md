# Desktop 本地文件安全：原生证据主审（2026-10-24）

本批仅补 P2-R02 的本机文件边界。实际派发 gpt-6.1-sol/high，全部应用输入、允许/拒绝及退出为真实 Electron Computer Use；主侧只布置自有 canary、被动观察、公开只读快照和 Journal/HTTP 对账。完整[逐点原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/security-native-20261024/native-evidence/report.md)保留操作分组、截图、AX、真实现象及限制。

验收版本：HEAD 00d6b763，带未提交源码 c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90；构建 d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2，按清单保存顺序聚合，296 源码/2342 制品逐文件冻结。main84797/renderer84840，独立 security-native profile、55102本地Provider/55103被动观察器；workspace /tmp/actspace-security-native-20261024/workspace。完整清单及元数据澄清见[frozen-build.json](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/security-native-20261024/frozen-build.json)，未将旧R50测试对象误作本批对象。

| 子点 | 主审结果 | 必需方式与实际证据 |
| --- | --- | --- |
| SN01 | 通过 | 真UI Agent/“自动”default；工作区内读取无审批，真实结果为inside canary；公开只读快照agent/default/grants=[]。 |
| SN02 | 通过 | 工作区外canonical A询问，原生拒绝；APPROVAL_DENIED/approval，无run-start或该次内容。 |
| SN03 | 通过 | 同A新请求再次询问，原生只允许once；真实结果仅A，无会话grant。 |
| SN04A | 通过 | 敏感.env只允许once、无grantSuggestions/会话选项；真UI允许后返回假canary。 |
| SN04B | 通过 | 同.env新requestId再次询问，真UI拒绝，无该次读取。 |
| SN05 | 通过 | .ssh/id_acceptance_canary在policy直接CREDENTIAL_FILE_DENIED，无可允许卡/读取。 |
| SN06 | 通过 | 真卡待批绑定A，主侧确认未决定/执行后仅原子换owned link→B；原生允许旧卡后RESOURCE_SCOPE_CHANGED/guard，failed，无run-start/B内容。 |

SN06时序：asked seq161；原生19:39:02Z确认待批，主侧19:39:29Z交换，原生19:39:52Z点击once，真实guard拒绝。错误码/phase来自[逐call对账](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/security-native-20261024/main-reconciliation.json)，界面可见实际失败详情；不把固定assistant结束文字当工具结果。最终15真实本地HTTP=14main+1title，7工具=3completed/3denied/1guard-failed，仅3completed有run-start，5ask/5真实决定，0grant事件，无Provider error/额外请求。B canary不在Journal或Provider内容中。

恢复：原生CmdQ，main84797于19:40:39Z exit0；19:40:56Z恢复link→A，全部六份canary哈希不变，源码/制品逐文件未漂移；自有Provider精确停止，driver/observer自然结束。[版本与恢复证明](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/security-native-20261024/main-version-restore-proof.json)保留完整事实。主侧亲自审阅重复敏感审批与guard失败截图。夹具辅助器曾在执行前修正latest-human supplement选择及按requestId核对决定的前置条件，均仅证据脚本，未改产品。

配置/旧OS凭据迁移、远端附件边界等独立子点仍未覆盖，P2-R02保持未覆盖。整表仍103通过/0失败/62部分或未覆盖，50Bug中49关闭，仅BUG-039开放；本批无新Bug，不等于Goal完成。
