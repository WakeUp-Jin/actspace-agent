# PWA 浏览器离线与恢复：2026-10-24

本批由实际 `gpt-6.1-sol` / `high` 仅操作两个精确自有Chrome tab；正常生产CLI Host显式 `--mock`，只验PWA生命周期。唯一origin `http://localhost:55162`；未操作用户其他tabs/origin、安装菜单或系统窗口，未注入token/SW/visibility。真实安装/独立窗口与iPhone不由普通tab代签。

| 点 | 主审结果 | 实际证据及缺口 |
| --- | --- | --- |
| PW-D1/D2 | 未覆盖 | 原生安装菜单/精确独立窗口无受支持方法。本批正常页面配对成功，但不能签standalone。 |
| PW-D3 | 浏览器子步骤通过 | 正常reload确认在线A和原历史后，主侧正常CLI stop Host79115，再精确停proxy79130，55162/55164无监听；原生浏览器20:45:45.517Z正常reload同Session深链，实际缓存外壳与“已断开，正在重连…”可见，输入/发送禁用。历史停留加载中，不声称离线历史缓存。 |
| PW-D4 | UI恢复与事实去重子步骤通过 | 同origin恢复Host85782/proxy85783后，20:46:50.791Z自然恢复原Session/原用户消息/原Mock回复，无reload/重配对/重发。真实Journal从停服前到恢复、更新等待及最终停止完全字节相同；1Task/1Run/1main request/1user message，没有新请求。代理故意不采RPC正文，未直接记录auth.resume方法，不能说捕获了该帧；该路由仅为源码解释。 |
| PW-D5 | 未覆盖 | A和B均为正常生产构建，B assets先发、保留A assets，再原子index、sw最后发布。工具明确拒绝owned tab的active属性，无法真实可见切换触发；有界30秒无Toast，仍A主script且草稿保留。没有刷新点击或B接管证据，不判产品失败。 |
| PW-I1/PW-N1 | 未覆盖 | 无可用iPhone/Tailscale真机；当前Web v1未交付系统通知，不为验收增加功能。 |

[真实浏览器逐点报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/pwa-desktop-20261024/browser-evidence/report.md)、[主侧恢复证明](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/pwa-desktop-20261024/main-restoration-proof.json)。同目录保存完整A/B清单、正常typecheck/build日志、transparent proxy静态字节hash、停服/发布及全部关键PNG/AX/DOM。

Session `b793d8a3-2e5d-4144-9e6b-0cab76d3874c`，Task `30ea817b-b373-4354-b840-58355c432cc2`，Run `0d3853a4-49ab-48d5-a39b-8b9b3ba884c5`，Journal SHA `d4c1d5a406fe291761f8e1df9c23b43ae122f0f7e1df5dc81db00ee33740c17a`。没有商业Provider调用或质量/余额结论。

源码HEAD00d6b763+未提交296文件SHA `c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90`、2342共享制品闭包SHA `d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2`，结束逐文件未变。A SW657f7102…ea9、main-xRqb7Rrw.js实际下载与DOM确认；B SW282d342f…6afb、main-WzwBPikC.js只证明构建和发布，不倒称接管。普通标签不是新Chrome profile，仅唯一新origin及确切tab ID隔离。只读scope不提供navigator，未绕过读取controller；离线冷重载结果和停服/真实下载共同支持D3。

20:50:04.946Z只关闭owned tabs1531332316/1531332317，owned session列表空；Host79115/85782正常CLI stop退出，proxy79130/85783精确结束，均无残留。仅保留有界自有origin缓存，未清用户浏览器profile/cache或改用户安装。P2-W04仍未覆盖，165总数104/0/61不变，Bug仍50/49关闭。
