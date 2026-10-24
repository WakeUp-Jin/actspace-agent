# F1-01 旧计费与停用模型迁移原生补验（2026-10-24）

MG1–MG5本批子步骤全部通过，F1-01整项仍未覆盖旧OS密文/附加Key字节兼容。实际派发gpt-6.1-sol/high，在无密钥独立旧v4/layers0副本上由生产完整Electron自动迁移；所有模型详情、用途查看与两次CmdQ均为真实原生CU。[逐点原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/migration-native-20261024/native-evidence/report.md)含15对截图/AX和哈希，不用服务单测代签界面。

版本为HEAD00d6b763+未提交源码c5152219076369f534ca7472639655f08ecdcd8f86ae7cece18ebe45b09fbc90、制品d043744e3d6c382bc2d3a0f1348352c512adb440d7e7369d5d99d6365a8b2ce2（296源码/2342制品逐文件冻结、保存顺序聚合）。新migration-native profile/workspace，55122拒绝型观察服务/55123只读CDP；main32148→原生退出→41741正常冷启动→原生退出，无Provider模型请求或Session Journal。

| 子点 | 原旧状态与预期 | 原生实际及主审结果 |
| --- | --- | --- |
| MG1 reference | 显式4/20/cache0.4，旧倍率0.5；迁为手填原值 | 首/二启均4/20/0.4、已修改、倍率0.5；公开有效来源user、ratesScaled=false。通过。 |
| MG2 manual | 旧未写billingMode默认manual；4/20/cache0.4先乘0.5 | 首/二启均2/10/0.2、已修改、倍率0.5；来源user，不再乘倍率。通过。 |
| MG3 token | 丢弃旧显式4/20/cache0.4，按实际目录×0.5 | 首/二启均0.075/0.3/cache0.0375、已×0.5，无已修改；公开来源catalog、ratesScaled=true。UI未写具体目录提供方，来源由只读有效快照旁证。通过。 |
| MG4停用清理/用途 | disabled自定义模型/definition/override删除；utility引用回跟随；保留defaultChat reference/explore manual | 三连接各1在用模型，完整用途列表无Legacy disabled；三个用途实际selected正确；持久三处删除和utility=null。通过。 |
| MG5保护/二启 | 精确迁前备份、迁后值与UI一致、正常二启幂等、无新调用 | 备份逐字等原配置SHA c7868b8c…6ac29；迁后settings首/二启同SHA4f792c74…ae8c0。layers2、旧billingMode无残留，两次exit0且PID消失，HTTP0/Journal0，源码制品无漂移。通过。 |

完整[版本/恢复对账](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/migration-native-20261024/main-restoration-proof.json)和[cold生产公开有效值](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/migration-native-20261024/cold-public-models.json)保留。自有guard30910核对完整命令后停止，driver/observer随应用结束。通用Agent指令路径从已停止Fee合成夹具继承，为已记录的只读引用，两次启动间未修改、未调用模型；不将新profile里另存提示词误称实际消费路径。

既有v1–v4完整应用迁移/精确备份/二启证据继续保留；v2 fixture确实含additionalCredentials extra1，现成迁后JSON已精确复核删除。这证明元数据退役，不等于旧OS加密密钥字节及解密环境兼容；不以本批无secrets配置签该分支。F1-01及相关P2-R02继续只缩小缺口，104/0/61总数与50Bug/49关闭不变。无新确定产品Bug，Goal继续active。
