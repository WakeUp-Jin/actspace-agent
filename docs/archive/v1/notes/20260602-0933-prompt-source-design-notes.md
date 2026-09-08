# Prompt Source 设计讨论临时备忘

记录时间：2026-06-02 09:33

用途：为上下文压缩前保留本轮关于系统提示词、设置页、prompt 文件和 `AGENTS.md` 加载的关键讨论结论。此文件是临时备忘，不是长期设计事实来源；后续应沉淀到正式 design doc 或 execution plan。

## 背景

当前正在拆 `docs/exec-plans/active/20260527-agent-tool-capabilities-breakdown/01-bash-tool-choice-boundary.md`。

最初想法是通过增加主 Agent 系统提示词来降低 `bash` 滥用，例如明确：

- 读文件用 `read_file`，不用 `bash cat`。
- 搜索内容用 `grep`，不用 `bash grep/rg`。
- 找文件用 `glob`。
- 列目录用 `list_directory`。
- 写/改文件用 `write_file` / `edit_file`。
- 删除文件未来用 `delete_file`，不用 `bash rm`。
- `bash` 只用于构建、测试、Git、系统命令和真实 shell 工作。

但用户指出：设置页里已有“主 Agent 自定义系统提示词”的显示与保存入口，如果新增规则只写进隐藏的代码变量，会造成设置页看不到的隐性 prompt，不符合 actspace 的“上下文可见、可控制”方向。

## 当前代码事实

桌面端真实 turn 的系统提示词来源链路是：

```txt
SettingsPage textarea
-> settings:update
-> settings.json
-> getSettingsService().get().agent.systemPrompt
-> runAndPersistTurn(... getSystemPrompt)
-> buildAgentConfig(runtimeContext.systemPrompt)
-> SystemPromptContext
```

相关路径：

- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/prompt/main-agent.ts`

`MAIN_AGENT_SYSTEM_PROMPT` 目前主要是默认种子 / fallback。真实桌面端运行时优先使用 settings 传入的 `agent.systemPrompt`。如果用户本地 `settings.json` 已经有空字符串，单纯修改 `MAIN_AGENT_SYSTEM_PROMPT` 不会让设置页显示新内容，也不一定会对真实 turn 生效。

## 参考调研结论

### OpenCode

OpenCode 的方向值得参考：

- 项目规则使用 `AGENTS.md`。
- 配置中支持 `instructions` 引用 Markdown 文件或 glob。
- custom agents 可以用 Markdown 文件定义 prompt。

核心启发：长 prompt / instructions 更适合做成文件化 artifact，配置只保存引用和模式。

### Claude Code 本地源码

用户提供的本地参考项目：

`/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src`

观察到的相关模式：

- 主 loop 里会组合 `systemPrompt + systemContext`。
- 项目 onboarding 会引导创建 `CLAUDE.md`。
- 自定义 agent 以 Markdown 文件形式保存：frontmatter 存元数据，body 存 system prompt。

相关路径：

- `/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/query.ts`
- `/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/projectOnboardingState.ts`
- `/Users/wakeup-jin/Desktop/code-project/back-code/claudecode-src/components/agents/agentFileUtils.ts`

核心启发：主系统约束、项目规则、用户/Agent 自定义 prompt 应分层，而不是都塞进一份 settings JSON 字符串。

## 暂定设计方向

### 1. Prompt 正文用文件，settings 只存编排配置

不建议把大段 prompt 正文长期放在 `settings.json` 里作为唯一真来源。

建议改成：

```ts
agent: {
  promptMode: "default" | "append" | "override";
  userPromptPath: string | null;
  instructionPaths: string[];
  loadAgentsMd: boolean;
}
```

用户自定义 prompt 正文默认存：

```txt
<userData>/prompts/main-agent.user.md
```

设置页里的编辑框编辑这个文件；点击保存时 main 进程写文件，而不是把正文写进 JSON。

### 2. Effective prompt 由多段组成

建议最终生效 prompt 顺序：

```txt
[Actspace core prompt]
[User prompt file]
[Global AGENTS.md]
[Workspace AGENTS.md]
[Configured instruction files]
[Dynamic context]
```

说明：

- `Actspace core prompt`：产品内置、版本化、只读。放工具边界、运行原则、身份和安全默认值。
- `User prompt file`：用户可编辑。根据 `promptMode` 追加或覆盖。
- `Global AGENTS.md`：可选，例如 `~/.config/actspace/AGENTS.md`。
- `Workspace AGENTS.md`：当前 workspace root 下的 `AGENTS.md`，默认加载。
- `Configured instruction files`：settings 中配置的额外 Markdown 文件或 glob。
- `Dynamic context`：工具定义、Skill summary、会话历史、压缩摘要等运行时上下文。

### 3. 工具选择边界属于 core prompt，不应完全交给用户覆盖

降低 `bash` 滥用的规则属于产品运行约束，不应只存在用户可清空的自定义 prompt 里。

建议：

- 工具边界写进 `Actspace core prompt`。
- 设置页展示 effective prompt，让用户能看到这些规则来自 core prompt。
- 用户可以追加自己的偏好。
- 如允许 override，需要明确提示：覆盖 core prompt 会替换默认工具使用约束，可能降低可靠性。

### 4. 设置页需要两个视图

建议设置页分为：

1. 用户提示词：编辑 `main-agent.user.md`。
2. 最终生效提示词：只读预览，按来源分段折叠展示。

这样新增 core prompt、加载 `AGENTS.md` 或配置 instruction files 都不是隐形注入。

### 5. `AGENTS.md` 加载

第一版建议支持：

```txt
~/.config/actspace/AGENTS.md
<workspaceRoot>/AGENTS.md
settings.agent.instructionPaths
```

嵌套目录级 `AGENTS.md` 可后置：

- 当 Agent 读取/编辑某个路径时，再加载最接近该路径的上级 `AGENTS.md`。
- 第一版先支持 root-level，降低复杂度。

### 6. 旧 settings 迁移

当前已有 `settings.agent.systemPrompt`。

迁移建议：

- 如果旧 `systemPrompt` 非空：
  - 启动时写入 `<userData>/prompts/main-agent.user.md`。
  - settings 改成 `promptMode: "append"` + `userPromptPath`。
- 如果旧 `systemPrompt` 为空：
  - 不创建用户 prompt。
  - 走 `Actspace core prompt`。
- 旧字段短期保留兼容，后续再删。

## 对 01 Bash 工具边界计划的影响

`01-bash-tool-choice-boundary.md` 需要调整：

- 不应写成“直接修改 `MAIN_AGENT_SYSTEM_PROMPT`”。
- 应改成“设计并接入 settings-backed effective prompt 体系”。
- Bash 工具边界规则放进 core prompt 文件。
- 设置页能显示最终生效 prompt。
- Context state 也应能看到 systemPrompt entry 里的最终内容。
- 如果 scope 过大，可先拆出一个 prompt-source-foundation plan，再让 Bash 工具边界计划依赖它。

## 待决策

1. prompt 文件默认路径：
   - 候选：`<userData>/prompts/main-agent.user.md`
2. core prompt 存储方式：
   - 候选 A：`packages/agent-core/src/prompt/main-agent.ts`
   - 候选 B：`packages/agent-core/src/prompt/main-agent.md` + 构建期/raw import
3. `promptMode` 是否允许 `override`：
   - 允许更自由，但可能让用户覆盖工具边界。
   - 也可第一版只支持 `append`，后续再开放 override。
4. 是否把 `AGENTS.md` 内容计入 `rules` bucket：
   - 倾向：是，`AGENTS.md` / instruction files 属于 rules。
5. 是否需要在 settings 页提供“打开 prompt 文件”按钮：
   - 倾向：可以后置，第一版只提供编辑保存。

## 当前偏好

倾向方案：

- 文件是 prompt 正文事实来源。
- settings 是 prompt 编排配置。
- 设置页是用户 prompt 编辑器 + effective prompt 预览器。
- `AGENTS.md` 是 workspace rules 的默认入口。
- 工具使用边界属于 actspace core prompt，默认可见但不可直接混进用户 prompt 字段。

## 2026-06-02 后续收敛：先做更简单的一文件方案

用户进一步收敛了第一版设计，不做上面较复杂的 `promptMode: default | append | override` 多模式，也不做“core prompt + user prompt”双编辑模型。

第一版只关注两个点：

1. 主 Agent 系统提示词只有一个文件。
2. 加载 `AGENTS.md` 规则文件。

### 最终采用的第一版设计

主系统提示词文件：

```txt
<userData>/prompts/main-agent.md
```

settings 只保存路径：

```ts
agent: {
  systemPromptPath: string;
  disabledTools: string[];
  bashAlwaysAsk: boolean;
  temperature: number | null;
  maxTokens: number | null;
}
```

行为：

- 首次启动或文件缺失时，用默认模板创建 `<userData>/prompts/main-agent.md`。
- 默认模板里可以写入 actspace 设计好的工具选择规则，例如降低 bash 滥用的规则。
- 设置页 textarea 直接显示这个文件内容。
- 用户点击保存时直接覆盖写入这个文件。
- 主 Agent turn 读取同一个文件作为系统提示词。
- 用户可以保留默认规则，也可以自己删掉或重写，控制权回到用户手里。

`AGENTS.md` 第一版加载两个固定来源：

```txt
<userData>/AGENTS.md
<workspaceRoot>/AGENTS.md
```

说明：

- `<userData>/AGENTS.md` 作为用户/运行时级规则。
- `<workspaceRoot>/AGENTS.md` 作为项目/工作区级规则。
- 文件不存在时跳过。
- 文件存在时注入上下文，但不写回 `main-agent.md`。
- 嵌套目录级 `AGENTS.md`、instruction glob、多 prompt mode 都后置。

### 对计划的影响

已同步更新：

`docs/exec-plans/active/20260527-agent-tool-capabilities-breakdown/01-bash-tool-choice-boundary.md`

该计划现在应按“一文件主系统提示词 + 两级 AGENTS.md 加载”执行，不再按复杂 effective prompt 多模式执行。
