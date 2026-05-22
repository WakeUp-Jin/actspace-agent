# Skill 集成

为 Agent 集成 Skill 支持时，开发围绕五个阶段展开：**发现、解析、使用、管理、快速构建**。贯穿全过程的核心原则是渐进式披露——按需逐层加载，避免一次性注入过多信息。

三层渐进式披露：

1. **第一层**：会话启动时，将所有 Skill 的元信息（名称 + 描述）加载到上下文
2. **第二层**：Skill 被激活时，将完整的 SKILL.md 正文内容加载到上下文
3. **第三层**：任务复杂度需要时，按需加载 references、scripts、assets 等资源文件

## 发现

Agent 需要从文件系统中发现运行环境有哪些可用 Skill。Skill 目录分为两个范围：

- **项目局部范围**：只对当前项目生效（如前端设计 Skill、React 最佳实践 Skill）
- **用户全局范围**：对用户所有项目生效（如 find-skills、pptx 生成 Skill）

### 扫描路径

按以下路径依次扫描，查找包含 `SKILL.md` 的子目录：

1. `<project>/.<agent-client>/skills/` — 项目范围，客户端专属
2. `<project>/.agents/skills/` — 项目范围，跨客户端共享
3. `~/.<agent-client>/skills/` — 全局范围，客户端专属
4. `~/.agents/skills/` — 全局范围，跨客户端共享

`/.agents/` 路径的存在是一种跨客户端共享约定——无论什么 Agent 客户端，都将 Skill 安装到 `~/.agents/skills/`，其他客户端自动可见。这避免了每个客户端都要兼容其他客户端的私有路径。

### 优先级规则

当同一个 Skill 同时出现在多个路径中：

- 项目级优先级大于用户级
- 相同范围内，按发现顺序排优先级

### 信任检查

从仓库拉取的项目可能包含恶意 Skill（如泄漏密钥）。在 Agent 配置中设计一层 Skill 信任检查——项目范围内只有被标记为受信任的 Skill 才可以加载。

### 扫描技巧

- 只认包含 `SKILL.md` 的目录为有效 Skill
- 跳过 `node_modules/` 等依赖目录，遵守 `.gitignore` 规则避免扫描构建产物
- 设置最大搜索深度（5-6 层）和最大文件数限制，防止大型项目拖慢启动

## 解析

扫描到 Skill 后，解析 SKILL.md 提取元信息。

### 文件结构

SKILL.md 包含两部分：以 `---` 分隔的 YAML 前置元数据，和分隔符后的 Markdown 正文内容。

### 元数据字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 技能名称，最多 64 字符，小写字母 + 数字 + 连字符 |
| `description` | 是 | 技能描述，最多 1024 字符，决定触发准确性 |
| `license` | 否 | 许可证名称或引用 |
| `compatibility` | 否 | 环境要求（目标产品、系统包、网络访问） |
| `metadata` | 否 | 附加元数据 |
| `allowed-tools` | 否 | 技能允许执行的工具列表 |

YAML 解析时错误处理不要太严格——小的格式错误不应阻止 Skill 加载，将警告信息返回给用户即可。

### 内存存储

用 Map 结构存储解析结果，name 作为 key，value 至少包含三个字段：

- `name`：名称
- `description`：描述
- `location`：SKILL.md 文件的绝对路径

是否在此阶段同时加载 Markdown 正文内容，需要权衡：预加载正文使第二层披露响应更快，但增加内存占用；懒加载正文省内存，但激活时需要额外 IO 读取。根据 Skill 总量和运行环境做选择。

## 使用

元信息解析完毕后，需要将 Skill 目录注入给 Agent，让它知道有哪些 Skill 可用以及何时使用。有两种注入路径。

### 方式一：系统提示词注入

在系统提示词中嵌入 Skill 目录，使用结构化格式（XML/JSON）。Agent 看到列表后自行判断当前任务是否需要某个 Skill。

```xml
<available_skills>
  <skill>
    <name>code-review</name>
    <description>Review code for bugs, style issues, and best practices.</description>
    <location>/home/user/.agents/skills/code-review/SKILL.md</location>
  </skill>
</available_skills>
```

`location` 字段的作用：为读取工具提供正确的路径参数，也让 Agent 能据此推算 Skill 内部引用资源的相对路径。

### 方式二：专用工具注入

**将 Skill 目录以工具描述的格式提供**。Agent 通过调用专用工具来激活 Skill，传入 name 参数，工具返回 SKILL.md 正文内容和结构化的资源列表。

```xml
<skill_content name="code-review">
# Code Review
## 审查步骤
1. 阅读代码，理解其意图
2. 对照 references/style-guide.md 检查风格问题
3. 运行 scripts/lint-check.sh 进行静态分析

Skill directory: /home/user/.agents/skills/code-review
<skill_resources>
  <file>scripts/lint-check.sh</file>
  <file>references/style-guide.md</file>
</skill_resources>
</skill_content>
```

专用工具比系统提示词注入在开发控制上更有优势：

- 返回内容可控——只返回正文，不重复元信息
- 工具输出可标记保护状态，上下文压缩时跳过
- 引用资源以结构化列表呈现，Agent 理解更准确
- 可加入统计分析、执行控制等附加逻辑

资源列表通过扫描 Skill 目录下的 references、scripts、assets 文件夹自动生成。限制列表大小，并提示 Agent "列表可能不完整，按需探索"，避免 Agent 被工具返回内容限制。

## 管理

渐进式加载的意义是避免预加载所有 Skill 正文。但已加载的 Skill 内容是当前会话的行为指导，盲目压缩会导致 Agent 性能退化。

### 上下文保护

两种保护方式：

- **系统提示词路径**：在读取工具结果中识别结构化标签，压缩时保留 Skill 内容
- **专用工具路径**：将技能激活工具的输出标记为保护状态，压缩时根据标记判断是否跳过

### 压缩后的处理

当对话过长、Skill 数量多、上下文窗口不足时，压缩 Skill 内容可能是必要的。但压缩后必须显式提示 Agent"Skill 内容已被压缩，如有需要请重新加载"。否则 Agent 会陷入压缩幻觉——认为自己仍持有完整的 Skill 指令，实际上已丢失。

### 子智能体执行

更高级的方案：用子智能体（subAgent）执行 Skill。将用户输入 + Skill 元信息注入子智能体，整个执行过程（技能指令 + 引用文件 + 中间推理）发生在子智能体的上下文中，主智能体只消费最终结果，上下文完全不受污染。

是否使用子智能体交给主智能体判断——例如任务复杂度超过阈值时自动委托。

## 快速构建

以上是从头为 Agent 构建 Skill 模块的完整路径。如果追求快速集成，可以使用已有的 Agent SDK——它们内置了 Skill 发现、解析和渐进式披露的完整实现。

目前可用的 SDK：

- **Claude Agent SDK**：配置 `setting_sources` 和 `add_dirs` 即可自动加载 Skill，支持项目级和用户级路径
- **pi-mono 的 pi-coding-agent 核心包**
- **Kimi Agent SDK**

自建 vs SDK 的权衡：自建自由度高、可控性强，能根据业务需求定制每个环节；SDK 构建速度快、迭代方便、开发难度低，但 Agent 的整体设计思路需要贴合 SDK 的架构约束。根据团队能力和项目需求选择。

## 注意事项

- Skill 的 `description` 字段决定触发准确性——写明"何时使用"而非"是什么"。under-trigger（该用时不用）和 over-trigger（无关场景加载无关内容）都损害体验
- 多个 Skill 同时加载时注意上下文总量，避免 Skill 内容占满窗口
- Skill 内容更新后需要重新扫描才能生效，考虑文件监听或重启机制
- Skill 加载的上下文属于"不可压缩"类别——它是 Agent 的行为规范，压缩会导致行为退化
