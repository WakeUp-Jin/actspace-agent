# R20 本机图片过滤原生闭环（2026-10-24）

本机RF1–RF4全部通过，R20整项仍缺有效Desktop远端Host的普通文件选择与引用。实际gpt-6.1-sol/high子智能体使用真实Electron/OS原生CU，经Open侧栏Desktop→唯一自有目录，未再使用已失败的GoToWindow，也没有CDP选文件或协议注入。

| 子点 | 真实操作与结果 | 结论 |
| --- | --- | --- |
| RF1 | Composer图片入口打开实际OS Open面板，侧栏Desktop进入本批目录。 | 通过。 |
| RF2 | 同目录blocked-text.txt可见灰显，实际点击不选中且Open禁用；allowed-image.png选择蓝显且Open启用。两中间态有截图/AX，不能仅以未见文件推断过滤。 | 通过。 |
| RF3 | 点击Open后真实缩略图与右侧放大预览可见；移除后恢复空文字/附件0，未发送。 | 通过。 |
| RF4 | 再次打开后原生取消返回空态，原生CmdQ exit0；主侧核无Session Journal，两个canary hash相同、仅清理本批新建目录及两文件。 | 通过。 |

[逐点原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/r20-filter-native-20261024/native-evidence/report.md)保存必要截图/AX及UTC时间。主侧审查04-TXT灰显/Open禁用与05-PNG蓝显/Open启用截图，核[退出/保护/清理](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/r20-filter-native-20261024/main-restoration-proof.json)。main57342于20:23:56.763Z正常退出，未触剪贴板或用户文件，无Provider/模型请求；74B合法2×2 PNG SHA f61eb2acfd02f7a571aa5df0c35ae878fb96d6b9c0eb9c3b0beefa70df111865。

版本HEAD00d6b763+dirty源码c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90、完整制品d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2，296源码/2342制品逐文件无漂移；独立profile/55143。只补本机负例，不以此签远端文件，104/0/61与50Bug49关闭不变，Goal继续active。
