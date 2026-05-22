# 多类型 Agent 评估方法

不同类型的 Agent 有不同的核心任务，评估策略也因此不同。编码 Agent 看测试是否通过，对话 Agent 还要看交互质量，研究 Agent 关注来源可信度。理解每种类型的评估侧重点，避免用错误的标准衡量 Agent 表现。

## 编码 Agent

编码 Agent 的核心任务是编写、测试和调试代码，依赖明确指定的任务——确定性评分器非常适合这类 Agent。

### 评估方向一：结果是否正确

用测试套件验证 Agent 产出的代码：

- **单元测试式验证**（如 SWE-bench Verified）：给 Agent 一个真实问题，Agent 编写修复代码，运行测试套件验证是否通过
- **端到端验证**（如 Terminal-Bench）：不是修复单一编译错误，而是完成整个任务流程——部署 Web 应用、从零搭建数据库

### 评估方向二：过程是否合理

仅看结果是否通过不够，同样完成任务的两种方式可能有本质差距。例如查询用户信息——Agent A 查询全部数据再在内存过滤，Agent B 使用 WHERE 条件精确查询。两者都"通过"，但 B 的做法更合理。

两种过程评估方式：

- **启发式代码质量检查**：用代码规则检查复杂度、重复率、命名规范、安全漏洞、性能问题
- **模型行为评估**：用 LLM 评估 Agent 的中间执行步骤是否高效合理

### 编码 Agent 评估配置示例

```yaml
task:
  id: "fix-auth-bypass_1"
  desc: "修复当密码字段为空时的认证绕过漏洞"

  graders:
    - type: deterministic_tests
      required:
        - test_empty_pw_rejected.js
        - test_null_pw_rejected.js

    - type: llm_rubric
      rubric: prompts/code_quality.md

    - type: static_analysis
      commands: [eslint, tsc]

    - type: tool_calls
      required:
        - tool: read_file
          params: { path: "src/auth/*" }
        - tool: edit_file
        - tool: run_tests

  tracked_metrics:
    - type: transcript
      metrics: [n_turns, n_toolcalls, n_total_tokens]
    - type: latency
      metrics: [time_to_first_token, output_tokens_per_sec]
```

## 对话 Agent

对话 Agent（客服、销售、辅导等）与其他 Agent 的独特差异在于：**交互本身的质量也是评估的一部分**。一个完成了退款但语气生硬的客服 Agent 和一个既完成退款又体现同理心的 Agent，在功能上等价但在体验上有本质差距。

### 评估方向一：可验证的最终状态

对话 Agent 最终要完成具体任务——退款是否处理、地址是否修改、工单是否关闭。用状态检查来验证。

### 评估方向二：交互质量

需要评估对话过程中的同理心、清晰度、效率：

- 是否在合理轮次内完成（如 10 轮以内）
- 语气是否恰当（用 LLM 评估）
- 是否基于正确的工具调用结果做出回复

对话 Agent 评估通常需要一个 LLM 来模拟用户，通过多轮对话测试 Agent 行为。参考测试基准：t-Bench 和 t2-Bench，模拟了零售支持和航空预订等领域的多轮交互。

### 对话 Agent 评估配置示例

```yaml
graders:
  - type: llm_rubric
    rubric: prompts/support_quality.md
    assertions:
      - "Agent 对客户的沮丧表现出同理心"
      - "解决方案被清晰地解释"
      - "Agent 的回复基于 fetch_policy 工具的结果"

  - type: state_check
    expect:
      tickets: { status: resolved }
      refunds: { status: processed }

  - type: tool_calls
    required:
      - tool: verify_identity
      - tool: process_refund
        params: { amount: "<=100" }
      - tool: send_confirmation

  - type: transcript
    max_turns: 10
```

## 研究 Agent

研究 Agent 收集、综合和分析信息后产出报告或答案。其输出质量无法像编码 Agent 那样用单元测试确定——专家可能对综合是否全面存在分歧，真实情况会随参考内容变化，更长更开放的输出为错误创造更多空间。

### 评估三要素

组合多种评分器覆盖研究质量：

- **基础性检查**：每一个声明都有来源支持吗？
- **覆盖性检查**：来源中的关键信息都被使用了吗？
- **来源质量检查**：引用的资料是否权威？不能因为搜索排名靠前就直接采用

参考测试基准：BrowseComp——设计"容易验证但难以解决"的问题，测试 Agent 能否在开放网络中找到特定信息。答案通常是一个词或短语，方便自动化验证。

## 计算机使用 Agent

计算机使用 Agent 通过屏幕截图、鼠标点击、键盘输入与软件交互——使用的是人类相同的界面而非 API。

### 评估关键点

不仅评估界面是否出现，还要验证软件后端的逻辑是否正确执行。例如确认页面出现了不等于订单真的已下单——需要检查后端状态。

参考测试基准：
- **WebArena**：基于浏览器的任务，使用 URL 和页面状态检查验证导航正确性，对数据修改任务做后端状态验证
- **OSWorld**：完整操作系统控制，检查文件系统状态、应用配置、数据库内容和 UI 元素属性

### 工具选择评估

浏览器 Agent 需要在 token 效率和延迟之间取得平衡：

- **DOM 操作**：执行快但消耗大量 token。适合文本密集的页面（如维基百科摘要）
- **截图方式**：速度慢但 token 效率高。适合 DOM 复杂但视觉信息集中的页面（如电商商品推荐）

评估浏览器 Agent 时，检查它是否为每个场景选择了正确的交互方式。

## 跨类型通用指标：pass@k 与 pass^k

Agent 行为在每次运行中都会变化，同一个任务可能某次通过、下次失败。两个指标捕获这种差异：

### pass@k（可用性）

衡量 Agent 在 k 次尝试中**至少获得一个正确解决方案**的概率。k 增大时 pass@k 上升——更多尝试意味着至少一次成功的几率更高。

适用场景：关注 Agent 的潜力和能力边界。pass@1 = 50% 意味着第一次尝试就成功完成半数任务。

### pass^k（稳定性）

衡量 Agent 在 k 次试验中**全部成功**的概率。k 增大时 pass^k 下降——要求在更多试验中保持一致是更难的标准。

适用场景：关注 Agent 的可靠性。如果每次成功率 75%，3 次全部成功的概率是 (0.75)^3 = 42%。

### 选择哪个指标

- 对于工具类应用，一个成功就有价值——使用 pass@k
- 对于面向用户的 Agent，一致性是关键——使用 pass^k

k=1 时两者相同。随着 k 增大，两者分化：pass@k 趋近 100%，pass^k 趋近 0%。
