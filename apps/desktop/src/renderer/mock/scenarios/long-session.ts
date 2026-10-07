import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { seedSession } from "./seed";

const TOPICS = ["会话列表分页", "工作区切换", "审批恢复", "终端主题", "设置中心导航", "Review 面板", "消息队列", "上下文压缩"];

/** 长会话：40 轮问答，检查滚动、分组和历史加载。 */
export function longSessionScenario({ db }: MockClock): MockHandlers | void {
  seedSession(db, { title: "整理 renderer 状态层", minutesAgo: 90, turns: [["列出 App.tsx 里的全局状态。", "共有 6 组：会话、工作区、设置、远端目标、审批和流式运行。"]] });
  seedSession(db, {
    title: "排查 Desktop 前端重构遗留问题",
    minutesAgo: 3,
    turns: Array.from({ length: 40 }, (_, index) => {
      const topic = TOPICS[index % TOPICS.length];
      return [
        `第 ${index + 1} 轮：检查「${topic}」还有哪些直接访问 window.actspace 的地方？`,
        [`「${topic}」相关的检查结果：`, "", `1. 组件里直接调用 bridge 的位置有 ${index % 5 + 1} 处。`, "2. 可以改成从 `renderer/api` 导入。", "", "```ts", `// ${topic}`, "const page = await sessionsApi.listPage({});", "```"].join("\n"),
      ] as const;
    }),
  });
}
