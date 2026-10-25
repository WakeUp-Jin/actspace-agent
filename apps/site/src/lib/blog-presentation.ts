/** 列表封面与文章头部的展示信息：分类、角色插画编号、封面上的英文关键词。 */
export const blogPresentation: Record<
  string,
  { category: string; cover: CoverId; key: string }
> = {
  "bash-tool-design": { category: "工具与扩展", cover: "06", key: "Bash" },
  "grep-and-glob": { category: "工具与扩展", cover: "04", key: "Grep / Glob" },
  "write-and-edit": { category: "工具与扩展", cover: "01", key: "Write / Edit" },
  "tool-scheduling-and-permissions": { category: "工具与扩展", cover: "03", key: "调度与权限" },
  "context-is-an-interface": { category: "上下文工程", cover: "01", key: "Context" },
  "actspace-agent-evaluation": { category: "评估与质量", cover: "02", key: "Eval" },
  "agent-team-and-agent-room": { category: "多智能体", cover: "07", key: "Team & Room" },
  "browser-use-integration": { category: "工具与扩展", cover: "04", key: "Browser Use" },
  "bash-background-and-sandbox": { category: "工具与扩展", cover: "05", key: "Bash 后台" },
  "pi-llm-runtime-design": { category: "模型与运行时", cover: "03", key: "Pi · LLM" },
  "agent-skill-system": { category: "工具与扩展", cover: "08", key: "Skills" },
};

/** 每张角色插画自带的底色（取自 PNG 角落像素）、压在上面的文字色；浅色底需要描边。 */
export const coverColors = {
  "01": { bg: "#fddfcf", ink: "#3a2a22", light: false },
  "02": { bg: "#6d91cd", ink: "#fbfaf7", light: false },
  "03": { bg: "#4a775d", ink: "#f6f2e6", light: false },
  "04": { bg: "#516889", ink: "#f2f5f0", light: false },
  "05": { bg: "#fdf5b7", ink: "#1f2a6b", light: false },
  "06": { bg: "#fbfaf7", ink: "#3d2a1e", light: true },
  "07": { bg: "#faf8f2", ink: "#24233a", light: true },
  "08": { bg: "#fefaf0", ink: "#1f2347", light: true },
} as const;
export type CoverId = keyof typeof coverColors;

export const presentationFor = (id: string) =>
  blogPresentation[id.replace(/\.(md|mdx)$/, "")];
