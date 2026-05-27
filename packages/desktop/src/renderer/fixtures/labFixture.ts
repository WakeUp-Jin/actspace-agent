export type LabStageId = "hypothesis" | "verification" | "forge" | "promotion";

export type LabStageView = {
  id: LabStageId;
  title: string;
  className: string;
  addLabel: string;
};

export type LabCardSection = {
  title: string;
  body: string;
};

export type LabCardView = {
  id: string;
  stage: LabStageId;
  tag: string;
  tagColor: string;
  title: string;
  meta: string;
  experiment: string;
  creator: string;
  updatedAt: string;
  evidence: string;
  artifacts: string;
  sections: LabCardSection[];
  checks: string[];
};

export type LabCompletedFilter = "promoted" | "rejected" | "abandoned";

export type LabCompletedExperimentView = {
  id: string;
  title: string;
  result: string;
  resultColor: string;
  filter: LabCompletedFilter;
  artifact: string;
  date: string;
  summary: string;
};

export const labStages: LabStageView[] = [
  {
    id: "hypothesis",
    title: "假说构建",
    className: "hypothesis",
    addLabel: "添加假说",
  },
  {
    id: "verification",
    title: "实证验证",
    className: "verification",
    addLabel: "添加验证",
  },
  {
    id: "forge",
    title: "能力锻造",
    className: "forge",
    addLabel: "添加产物",
  },
  {
    id: "promotion",
    title: "晋升评审",
    className: "promotion",
    addLabel: "提交评审",
  },
];

export const initialLabCards: LabCardView[] = [
  {
    id: "hyp-rust-cli",
    stage: "hypothesis",
    tag: "主假说",
    tagColor: "#1f5fe8",
    title: "让 Agent 锻造 Rust CLI",
    meta: "CLI · 12m 前",
    experiment: "Agent CLI Forge",
    creator: "User",
    updatedAt: "12m 前",
    evidence: "0",
    artifacts: "0",
    sections: [
      {
        title: "问题",
        body: "Agent 经常需要重复解析日志、文件结构和命令输出，当前只能靠临时 bash 片段和聊天上下文维持。",
      },
      {
        title: "能力缺口",
        body: "缺少一个可被 bash 稳定调用、可测试、可复用的 CLI 能力，用来把高频解析动作从临时步骤变成长期工具候选。",
      },
      {
        title: "假说",
        body: "如果把高频解析逻辑封装成 Rust CLI，主 Agent 可以通过 bash 工具稳定复用，并且更容易记录证据、测试和错误边界。",
      },
    ],
    checks: ["CLI 能处理 3 组样例输入", "有明确错误输出", "包含最小测试", "不默认启用，必须进入晋升评审"],
  },
  {
    id: "hyp-skill",
    stage: "hypothesis",
    tag: "草稿",
    tagColor: "#6b7280",
    title: "失败任务沉淀 skill",
    meta: "Kairos · 昨天",
    experiment: "Frontend Verification",
    creator: "Kairos",
    updatedAt: "昨天",
    evidence: "0",
    artifacts: "0",
    sections: [
      {
        title: "问题",
        body: "前端修改后经常需要重复解释验证步骤，且不同会话容易遗漏 Electron 实机检查。",
      },
      {
        title: "假说",
        body: "把重复失败经验沉淀为 skill，可以降低后续 UI 任务漏验的概率。",
      },
    ],
    checks: ["触发描述清晰", "覆盖桌面端检查", "包含反例"],
  },
  {
    id: "hyp-search",
    stage: "hypothesis",
    tag: "阻塞",
    tagColor: "#d94d5c",
    title: "评估 web_search 证据质量",
    meta: "等待引用策略",
    experiment: "Evidence Quality",
    creator: "User",
    updatedAt: "今天",
    evidence: "0",
    artifacts: "0",
    sections: [
      {
        title: "问题",
        body: "联网搜索产出的摘要不一定足够支撑能力晋升，需要明确哪些资料可以成为评审证据。",
      },
      {
        title: "能力缺口",
        body: "缺少一套区分资料线索、可引用证据和晋升证据的规则。",
      },
    ],
    checks: ["确认引用策略", "定义证据等级"],
  },
  {
    id: "hyp-truncation",
    stage: "hypothesis",
    tag: "候选",
    tagColor: "#1f5fe8",
    title: "长输出裁剪规则",
    meta: "Main Agent · 2h 前",
    experiment: "Tool Output Hygiene",
    creator: "Main Agent",
    updatedAt: "2h 前",
    evidence: "2",
    artifacts: "0",
    sections: [
      {
        title: "问题",
        body: "工具输出过长会污染上下文，让 Agent 后续判断被低价值日志淹没。",
      },
      {
        title: "假说",
        body: "为不同工具定义统一裁剪规则，可以减少上下文膨胀，同时保留可审计原始输出引用。",
      },
    ],
    checks: ["read / bash / grep 分别验证", "保留 raw output ref"],
  },
  {
    id: "hyp-search-skill",
    stage: "hypothesis",
    tag: "草稿",
    tagColor: "#6b7280",
    title: "沉淀多模型搜索经验",
    meta: "User · 今天",
    experiment: "Hybrid Search",
    creator: "User",
    updatedAt: "今天",
    evidence: "0",
    artifacts: "0",
    sections: [
      {
        title: "问题",
        body: "DeepSeek 主模型和 Kimi 辅助搜索的边界需要更稳定地沉淀，避免每次临时解释。",
      },
    ],
    checks: ["区分搜索和阅读", "说明何时需要官方来源"],
  },
  {
    id: "ver-cli",
    stage: "verification",
    tag: "验证中",
    tagColor: "#d99a20",
    title: "3 组样例验证",
    meta: "证据 5 · 1 次失败",
    experiment: "Agent CLI Forge",
    creator: "Main Agent",
    updatedAt: "8m 前",
    evidence: "5",
    artifacts: "0",
    sections: [
      {
        title: "验证方案",
        body: "准备三组日志和文件结构样例，验证 CLI 是否能输出稳定 JSON，并在参数错误时返回可读错误信息。",
      },
      {
        title: "观察结果",
        body: "前两组样例通过，第三组因路径包含空格导致解析失败，已记录为参数边界问题。",
      },
    ],
    checks: ["命令记录 5 条", "stdout 已裁剪", "失败原因已归档"],
  },
  {
    id: "ver-skill",
    stage: "verification",
    tag: "通过",
    tagColor: "#16a36a",
    title: "复盘验证记录",
    meta: "证据 7",
    experiment: "Frontend Verification",
    creator: "Kairos",
    updatedAt: "昨天",
    evidence: "7",
    artifacts: "0",
    sections: [
      {
        title: "观察结果",
        body: "四次 UI 任务中有三次需要重新补浏览器或 Electron 验收，重复失败模式成立。",
      },
    ],
    checks: ["证据 7 条", "引用 2 条", "结论通过"],
  },
  {
    id: "ver-truncation",
    stage: "verification",
    tag: "验证",
    tagColor: "#d99a20",
    title: "对比 6 类工具输出",
    meta: "证据 10 · 失败 0",
    experiment: "Tool Output Hygiene",
    creator: "Main Agent",
    updatedAt: "1h 前",
    evidence: "10",
    artifacts: "0",
    sections: [
      {
        title: "验证方案",
        body: "对 read_file、bash、grep、glob、write_file、edit_file 六类输出分别验证裁剪前后模型可读性。",
      },
    ],
    checks: ["六类工具均命中", "没有丢失关键错误原因"],
  },
  {
    id: "forge-cli",
    stage: "forge",
    tag: "CLI",
    tagColor: "#287783",
    title: "act-log-scan",
    meta: "已验证 · 2 子命令",
    experiment: "Agent CLI Forge",
    creator: "Main Agent",
    updatedAt: "6m 前",
    evidence: "5",
    artifacts: "1",
    sections: [
      {
        title: "产物类型",
        body: "Rust CLI 原型，提供 scan 和 explain 两个子命令。",
      },
      {
        title: "使用契约",
        body: "主 Agent 通过 bash 调用 CLI，输入为 workspace 内文件路径，输出为稳定 JSON 摘要。",
      },
    ],
    checks: ["cargo test 通过", "错误输出已定义", "不默认启用"],
  },
  {
    id: "forge-skill",
    stage: "forge",
    tag: "skill",
    tagColor: "#287783",
    title: "frontend 验证 skill",
    meta: "草稿 · 待补充",
    experiment: "Frontend Verification",
    creator: "Main Agent",
    updatedAt: "昨天",
    evidence: "7",
    artifacts: "1",
    sections: [
      {
        title: "产物类型",
        body: "SKILL.md 草稿，覆盖浏览器 mock、桌面端 Electron 验收和日志检查。",
      },
    ],
    checks: ["补触发描述", "补反例", "补验证命令"],
  },
  {
    id: "review-cli",
    stage: "promotion",
    tag: "待评审",
    tagColor: "#946400",
    title: "候选 CLI 晋升",
    meta: "高风险 · 4 检查",
    experiment: "Agent CLI Forge",
    creator: "User",
    updatedAt: "刚刚",
    evidence: "5",
    artifacts: "1",
    sections: [
      {
        title: "评审结论",
        body: "CLI 原型已具备候选价值，但属于可执行产物，建议先作为候选能力保留，不默认进入主 Agent 能力池。",
      },
      {
        title: "风险等级",
        body: "高。需要确认路径边界、错误输出、测试覆盖和回滚方式。",
      },
    ],
    checks: ["测试通过", "权限边界待确认", "错误输出通过", "需要人工批准"],
  },
];

export const initialCompletedExperiments: LabCompletedExperimentView[] = [
  {
    id: "done-cli",
    title: "让 Agent 锻造 Rust CLI",
    result: "已晋升",
    resultColor: "#16a36a",
    filter: "promoted",
    artifact: "CLI",
    date: "今天",
    summary: "CLI 候选产物已进入人工评审通过列表。",
  },
  {
    id: "done-skill",
    title: "失败任务沉淀为 skill",
    result: "已晋升",
    resultColor: "#16a36a",
    filter: "promoted",
    artifact: "skill",
    date: "昨天",
    summary: "前端验证经验已沉淀为 skill 候选。",
  },
  {
    id: "done-search",
    title: "web_search 证据质量评估",
    result: "已拒绝",
    resultColor: "#d94d5c",
    filter: "rejected",
    artifact: "learning",
    date: "5月27日",
    summary: "证据质量不足，暂不作为能力晋升依据。",
  },
  {
    id: "done-truncation",
    title: "长输出裁剪规则",
    result: "已晋升",
    resultColor: "#16a36a",
    filter: "promoted",
    artifact: "doc",
    date: "5月27日",
    summary: "工具输出裁剪规则已整理入文档。",
  },
  {
    id: "done-hybrid-search",
    title: "多模型搜索经验沉淀",
    result: "已废弃",
    resultColor: "#6b7280",
    filter: "abandoned",
    artifact: "none",
    date: "5月26日",
    summary: "方向暂不成立，保留为历史记录。",
  },
];
