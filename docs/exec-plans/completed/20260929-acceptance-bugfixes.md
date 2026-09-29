# 统一验收缺陷修复

- 状态：已完成；定向自动化与实机验证见 ../../exec-runs/20260929-acceptance-bugfixes/execution-summary.md。
- 基线：082287a；保留已有5份无关文档改动和验收证据。
- 必读：REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、CODING_BEHAVIOR、FRONTEND_VERIFICATION；原始证据见 ../../exec-runs/20260929-main-unified-acceptance/execution-summary.md。

## 范围和顺序

1. Chat 工具拒绝与历史恢复：在 core/agent-loop 的工具预检失败路径为全部已记录调用写入明确拒绝结果，禁止执行任何越界工具；请求组装为旧版本遗留的孤立调用提供明确未取得结果的错误反馈，不改写原 Journal。测试覆盖拒绝、无工具副作用、下一轮继续、旧历史恢复与合法工具结果不重复。
2. 子 Agent 检查点：复现 store 直接创建的 child 未进入 session.runtime.getOpen；在 RuntimeSessionController 提供有生命周期的外部活跃 Session 登记，由 agent factory 的子 scope 持有并释放，使既有 checkpoint policy 仍严格检查活跃 Session 并真实 flush。验证子请求能够发出、正常终结、注销后不再可访问及失败清理。检查不可读子会话是否由同根因造成，另有根因则据证据修复。
3. 设置字体预览：将开发状态说明/测试命令替换为面向用户的中英文字体与代码样例，不改颜色或布局。
4. 验证：先运行新增回归测试取得失败证据，再修改并跑对应 package 测试/typecheck/build。使用隔离数据和 Electron Computer Use 分组复验：R1 Chat拒绝/续聊/旧失败历史；R2 Plan Explore与Agent子任务/重启；R3 设置字体预览。分别记录 UI 与运行时结果。
5. 收尾：文档与 history 同步，保留未确认问题，恢复临时配置，删除复制凭据。用户后续授权将本轮修复与日志合成一个本地 commit，不推送。
6. 第二轮追加已完成：开发启动增加本轮 main/preload 编译成功屏障；read_file 缓存按 sessionId 隔离。C01–C04 的进程测试及 Computer Use 结果见执行摘要。

## 验收点

- B01 越界工具不执行，所有模型 tool_calls 均得到错误 tool result，之后可继续对话。
- B02 已有孤立调用的历史可继续请求，正常历史保持原有结果。
- B03 Explore/通用子 Agent 能经过实际 checkpoint 并完成，结束后释放活跃登记。
- B04 重启可以读取本次新子会话；旧失败子会话是否可读单独记录。
- B05 字体预览显示用户可理解的样例；字号/字体控件保持可用。

## 风险和边界

不降低模式权限或跳过持久化屏障；不删除或改写用户历史。dev 启动竞态经后续诊断与授权已修复；图片服务连接错误后置，Chrome 未覆盖功能不属于已确认 bug。必要修改涉及 loop、fixture/tests、runtime controller/factory/tests、设置页、启动器、文件读取缓存及文档，均服务于上述明确修复，不做额外架构重构。

回退：按本任务精确文件 diff 回退代码；不回退用户原有修改，不删除验收数据。真实 provider 不可用时保留自动化结果与未验收门槛，不写通过。
