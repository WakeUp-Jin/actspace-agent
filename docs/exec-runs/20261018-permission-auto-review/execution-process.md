# 执行过程

- 2026-10-18：用户批准先计划后执行。已建立功能分支，确认原重复审批来自 Bash 前缀白名单范围；按三段方案开始实施。
- P1：查询命令采用显式选项集合；git -C 与查询路径做 realpath 检查。额外限制预处理器、跟随链接、敏感文件和外部目录。第一轮 shell 测试通过，后续补路径及策略接线回归。
- P2–P3：新建 auto-review 判断插件，作为默认 Harness 独立 entry；Loop 传入当前请求模型标识，Runtime 在 ask 处调用。保留 30 秒超时、取消、模式与资源复验。发现 global file boundary 只判断 default，修复为所有非 full-access 模式都保留工作区边界。
- P4：新增已连接模型选择，缺省跟随会话，指定模型不可用不降级；设置新字段使旧 golden 多出 null，审查后更新了 6 个 fixture，共 12 行新增。工具结果的两字段通过 live/durable 路径进入 Bash 详情；无新增事件。
- 验证：依赖构建、Desktop 类型检查、renderer/Electron 构建、包边界、主题、token 检查通过。新增 fixture 曾遗漏 Step 和 LLM stopReason，已补齐后重新验证。
- Computer Use：按 AGENTS 委派 gpt-6.1-sol，检查确认环境无桌面/浏览器交互工具；U1–U7 均保留真实交互未覆盖，未启动应用或用源码结果代替界面验收。
- 文档门禁：check:docs 被既有 completed 前端重构总计划指向已不存在 demo/ 的链接阻塞；该文件不在本次修改范围，单独记录。
- P5–P6 收尾：相关包 330 项与 Desktop 68 项定向测试通过；最终 Desktop typecheck 和 52 项目 build graph 校验通过。history、学习文档、执行摘要已补齐，计划移入 completed，真实界面与 Provider 门禁保留未覆盖。

- 追加真实交互验收：用户要求启动Computer Use。重新委派gpt-6.1-sol，发现无原生工具后按前端规范使用CDP真实Electron，独立数据目录与synthetic Provider；U1–U7按代表路线完成。
- 发现并修复主对话路由取排序第一项的问题：新增auto-review后误作主路由，两处选择改为优先default并排除辅助路由；Runtime63/DesktopApp13测试、Desktop类型检查通过，真实差异模型与跟随请求复验通过。
- 工具审计展示最初仅展开轮级活动未看到，展开Ran详情后确认正常，撤销该误报；旧格式fixture通过轨迹详情验证，不将无助手消息导致的对话无工具卡视为缺陷。
- 2026-10-19追加原生Computer Use：确认系统屏幕截图与CGEvent可用，由gpt-6.1-sol独占真实窗口，按设置、执行、恢复与主题路线完成U1–U7；没有使用CDP或DOM驱动界面。本轮不改产品代码。
- 原生补证：指定模型主alternate/审批main，跟随模型两者alternate，审批tools=0；新查询会话1次asked、2次grant-used，结果session；拒绝与HTTP错误回人工，pending重载后仍可处理。旧格式轨迹及480×800浅深主题可读。
- 原生核查曾误判审计文字缺失，最终发现输出卡片独立滚动，滚到底部后自动审批与原因可见，撤销误报。逐项结果见native-computer-use-acceptance.md，关键截图u4-inner-scrolled-bottom.png；synthetic Provider不代表商业模型判断质量。
