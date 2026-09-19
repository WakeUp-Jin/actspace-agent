export const blogPresentation: Record<
  string,
  { category: string; cover: string }
> = {
  "bash-tool-design": { category: "工具与扩展", cover: "06" },
  "grep-and-glob": { category: "工具与扩展", cover: "04" },
  "write-and-edit": { category: "工具与扩展", cover: "01" },
  "tool-scheduling-and-permissions": { category: "工具与扩展", cover: "03" },
  "context-is-an-interface": { category: "上下文工程", cover: "01" },
  "actspace-agent-evaluation": { category: "评估与质量", cover: "02" },
  "agent-team-and-agent-room": { category: "多智能体", cover: "07" },
  "browser-use-integration": { category: "工具与扩展", cover: "04" },
  "bash-background-and-sandbox": { category: "工具与扩展", cover: "05" },
  "pi-llm-runtime-design": { category: "模型与运行时", cover: "03" },
  "agent-skill-system": { category: "工具与扩展", cover: "08" },
};
export const presentationFor = (id: string) =>
  blogPresentation[id.replace(/\.(md|mdx)$/, "")];
