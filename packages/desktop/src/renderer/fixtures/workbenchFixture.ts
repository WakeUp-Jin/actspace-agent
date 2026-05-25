import type {
  AgentTurnResult,
  BootstrapState,
  ContextUsageSnapshot,
  MessageBlock,
  SessionListItem,
  SessionRecord
} from "@actspace/shared";

const now = new Date().toISOString();

export const mockContextSnapshot: ContextUsageSnapshot = {
  totalTokens: 71_400,
  maxTokens: 200_000,
  percentUsed: 36,
  compressionCount: 2,
  cumulativeTokens: 184_200,
  buckets: [
    { key: "systemPrompt", name: "systemPrompt", label: "System prompt", tokens: 3200, colorToken: "context.system" },
    { key: "tools", name: "tools", label: "Tools", tokens: 15_000, colorToken: "context.tools" },
    { key: "rules", name: "rules", label: "Rules", tokens: 681, colorToken: "context.rules" },
    { key: "skills", name: "skills", label: "Skills", tokens: 1900, colorToken: "context.skills" },
    { key: "mcp", name: "mcp", label: "MCP", tokens: 3200, colorToken: "context.mcp" },
    { key: "subagents", name: "subagents", label: "Subagents", tokens: 710, colorToken: "context.subagents" },
    { key: "conversation", name: "conversation", label: "Conversation", tokens: 46_800, colorToken: "context.conversation" }
  ]
};

export const mockSessions: SessionListItem[] = [
  {
    id: "session-learning-doc-plan",
    title: "Learning documentation plan",
    updatedAt: now,
    turnCount: 4
  },
  {
    id: "session-auth-refactor",
    title: "Authentication flow refactor",
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    turnCount: 2
  },
  {
    id: "session-ci-design",
    title: "CI/CD pipeline design",
    updatedAt: new Date(Date.now() - 172_800_000).toISOString(),
    turnCount: 1
  }
];

export const mockMessages: MessageBlock[] = [
  {
    kind: "user",
    id: "mock-user-1",
    content:
      "I want to add a templates folder and organize the learning docs by templates. Update the docs structure and create a plan. Then modify AGENTS.md to reflect this change.",
    createdAt: now
  },
  {
    kind: "assistant",
    id: "mock-assistant-1",
    content:
      "Sure. I will review the current docs structure, design the templates-based organization, create an implementation plan, and update AGENTS.md accordingly.",
    createdAt: now,
    model: "actspace-4.1",
    provider: "deepseek"
  },
  {
    kind: "thinking",
    id: "mock-thinking-1",
    title: "Thinking for 18s",
    content:
      "Goal: Introduce templates for reusable learning document templates and update navigation.\nApproach: Inspect current docs, propose new structure, write plan, update AGENTS.md.\nKey files: docs/** structure, README.md, LEARNINGS_GUIDE.md, AGENTS.md.",
    createdAt: now,
    collapsedByDefault: true
  },
  {
    kind: "read",
    id: "mock-read-1",
    filePath: "AGENTS.md",
    range: "L1-62",
    displayText: "Read AGENTS.md L1-62",
    createdAt: now
  },
  {
    kind: "read",
    id: "mock-read-2",
    filePath: "docs/README.md",
    range: "L1-80",
    displayText: "Read docs/README.md L1-80",
    createdAt: now
  },
  {
    kind: "search",
    id: "mock-search-1",
    query: "template",
    scope: "docs/**",
    displayText: "Searched files in docs/** for template",
    resultCount: 8,
    createdAt: now
  },
  {
    kind: "grep",
    id: "mock-grep-1",
    pattern: "ToolUiPreview",
    scope: "*.ts",
    displayText: "Grep ToolUiPreview in *.ts",
    resultCount: 4,
    createdAt: now
  },
  {
    kind: "glob",
    id: "mock-glob-1",
    pattern: "src/**/*.ts",
    scope: "packages/agent-core",
    displayText: "Glob src/**/*.ts in packages/agent-core",
    resultCount: 12,
    createdAt: now
  },
  {
    kind: "edit_diff",
    id: "mock-diff-1",
    filePath: "AGENTS.md",
    additions: 12,
    deletions: 4,
    collapsedLines: 5,
    diff:
      "@@ -42,7 +42,13 @@\n- ## Docs structure\n- - docs/learning/* - individual learning notes\n+ ## Docs structure\n+ - docs/templates/ - reusable learning doc templates\n+ - docs/learnings/ - finalized learning notes\n+ - docs/exec-plans/ - execution plans and active work\n+\n+ ## Agent route\n+ - Read AGENTS.md before changing repository conventions\n+ - Keep durable learning criteria beside the learning docs README",
    createdAt: now
  },
  {
    kind: "assistant",
    id: "mock-assistant-2",
    content:
      "All set. I added the templates folder, updated the docs structure in AGENTS.md, and prepared the migration plan.",
    createdAt: now,
    model: "actspace-4.1",
    provider: "deepseek"
  },
  {
    kind: "user",
    id: "mock-user-2",
    content:
      "I do not think we need a templates folder yet. Keep the route in AGENTS.md, and put the actual learning documentation guidance in one README instead.",
    createdAt: now
  },
  {
    kind: "assistant",
    id: "mock-assistant-3",
    content:
      "That is cleaner for the current stage. I will simplify the plan so AGENTS.md only points to the learning documentation entry, while the README owns the judgment criteria and writing flow.",
    createdAt: now,
    model: "actspace-4.1",
    provider: "deepseek"
  },
  {
    kind: "thinking",
    id: "mock-thinking-2",
    title: "Thinking for 6s",
    content:
      "Revise the proposed docs flow: avoid template churn, keep a single documented entry point, and make the trigger criteria explicit enough for agents to use.",
    createdAt: now,
    collapsedByDefault: true
  },
  {
    kind: "edit_diff",
    id: "mock-diff-2",
    filePath: "docs/learnings/README.md",
    additions: 18,
    deletions: 6,
    collapsedLines: 5,
    diff:
      "@@ -1,6 +1,14 @@\n+ # Learning docs\n+ Use this folder for durable, transferable lessons from completed work.\n- Templates live in docs/templates.\n+ Keep the format lightweight; agents can choose structure based on the lesson.\n+\n+ ## When to write\n+ - Capture concepts that are transferable or surprisingly easy to get wrong.\n+ - Prefer one clear note over many thin templates.",
    createdAt: now
  },
  {
    kind: "read",
    id: "mock-read-3",
    filePath: "AGENTS.md",
    range: "L1-69",
    displayText: "Read AGENTS.md L1-69",
    createdAt: now
  },
  {
    kind: "read",
    id: "mock-read-4",
    filePath: "docs/learnings/README.md",
    range: "L1-44",
    displayText: "Read docs/learnings/README.md L1-44",
    createdAt: now
  },
  {
    kind: "tool",
    id: "mock-tool-1",
    title: "Updated plan",
    content: "Removed the template folder from scope and kept learning docs as a lightweight README-driven workflow.",
    createdAt: now
  },
  {
    kind: "tool",
    id: "mock-tool-2",
    title: "Checked docs",
    content: "Confirmed the route stays in AGENTS.md while the detailed criteria live beside the learning docs.",
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-success",
    status: "success",
    title: "Typecheck agent-core",
    commandPreview: "cd, pnpm",
    command:
      "cd /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent && pnpm --filter @actspace/agent-core typecheck",
    cwd: "/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent",
    stdout:
      "> @actspace/agent-core@0.1.0 typecheck /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/packages/agent-core\n> tsc --noEmit -p tsconfig.json",
    stderr: "",
    exitCode: 0,
    durationMs: 1284,
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-approval",
    status: "pending",
    title: "Test shell with permissions echo",
    commandPreview: "echo",
    command: "echo \"测试需要额外权限的命令\"",
    cwd: "/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent",
    reason: "Not in allowlist: echo \"测试需要额外权限的命令\"",
    policyLabel: "Allowlist (with Sandbox)",
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-running",
    status: "running",
    title: "Build workspace",
    commandPreview: "pnpm",
    command: "pnpm build",
    cwd: "/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent",
    stdout: "Building shared...\nBuilding agent-core...",
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-failed",
    status: "failed",
    title: "Run tests",
    commandPreview: "pnpm",
    command: "pnpm test",
    cwd: "/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent",
    stderr: "src/env.ts(229,10): error TS2352: Conversion may be a mistake.",
    exitCode: 2,
    durationMs: 842,
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-denied",
    status: "denied",
    title: "Dangerous delete",
    commandPreview: "rm",
    command: "rm -rf /",
    reason: "Command contains dangerous delete operation",
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-expired",
    status: "expired",
    title: "Install dependency",
    commandPreview: "pnpm",
    command: "pnpm install",
    reason: "Approval expired before the command was allowed.",
    createdAt: now
  },
  {
    kind: "bash",
    id: "mock-bash-cancelled",
    status: "cancelled",
    title: "Run script",
    commandPreview: "pnpm",
    command: "pnpm run seed",
    reason: "User skipped this command.",
    createdAt: now
  },
  {
    kind: "assistant",
    id: "mock-assistant-4",
    content:
      "Updated the plan. The learning docs now stay lightweight, with AGENTS.md acting as the route and the README carrying the actual writing guidance.",
    createdAt: now,
    model: "actspace-4.1",
    provider: "deepseek"
  }
];

export const mockBootstrapState: BootstrapState = {
  appVersion: "0.1.0",
  dataRoot: "Mock data root",
  sessionRoot: "Mock data root/sessions",
  logRoot: "Mock data root/logs",
  tmpRoot: "Mock data root/tmp",
  workspaceRoot: "Mock workspace root"
};

export const mockSessionRecord: SessionRecord = {
  meta: {
    id: "session-learning-doc-plan",
    title: "Learning documentation plan",
    createdAt: now,
    updatedAt: now,
    turnCount: 4
  },
  events: [],
  messageBlocks: mockMessages,
  contextSnapshot: mockContextSnapshot
};

export const mockTurnResult: AgentTurnResult = {
  sessionId: "session-learning-doc-plan",
  turnId: "mock-turn-1",
  events: [],
  contextSnapshot: mockContextSnapshot,
  status: "completed"
};
