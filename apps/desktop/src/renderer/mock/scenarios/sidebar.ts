import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { MOCK_WORKSPACE_ROOT } from "../fixtures";
import { seedSession } from "./seed";

const HARNESS_ROOT = "/Users/mock/code/agent-harness-dev";
const NOTES_ROOT = "/Users/mock/notes";
const HOUR = 60;
const DAY = 24 * HOUR;

type SidebarSeed = { title: string; minutesAgo: number; root?: string; pinned?: boolean; archived?: boolean };

// 时间相对真实的「现在」，按时间分组时今天、昨天、近 7 天、本月更早、往月、往年都有会话。
const SEEDS: readonly SidebarSeed[] = [
  { title: "侧栏改版：拖拽排序", minutesAgo: 4 },
  { title: "排查 IPC 预算回归", minutesAgo: 38, root: HARNESS_ROOT },
  { title: "周报草稿", minutesAgo: 3 * HOUR, root: NOTES_ROOT, pinned: true },
  { title: "Composer 队列边界情况", minutesAgo: 6 * HOUR },
  { title: "Loop 工具调度重构", minutesAgo: DAY + 2 * HOUR, root: HARNESS_ROOT },
  { title: "设置页文案统一", minutesAgo: DAY + 5 * HOUR },
  { title: "上下文压缩时间线", minutesAgo: 2 * DAY + HOUR },
  { title: "读书笔记：设计心理学", minutesAgo: 3 * DAY, root: NOTES_ROOT },
  { title: "Bash 工具权限前缀", minutesAgo: 4 * DAY, root: HARNESS_ROOT, pinned: true },
  { title: "主题色板对比度", minutesAgo: 5 * DAY },
  { title: "审批卡片 Cursor 风格", minutesAgo: 6 * DAY },
  { title: "Mermaid 图渲染", minutesAgo: 9 * DAY },
  { title: "旧版会话迁移脚本", minutesAgo: 12 * DAY, root: HARNESS_ROOT },
  { title: "模型连接向导", minutesAgo: 40 * DAY },
  { title: "年度计划", minutesAgo: 300 * DAY, root: NOTES_ROOT },
  { title: "已归档：临时调试", minutesAgo: 2 * HOUR, archived: true },
  { title: "已归档：发布清单", minutesAgo: 20 * DAY, root: HARNESS_ROOT, archived: true },
];

/** 侧栏：三个工作区、分散在各时间段的会话、两个置顶、两个已归档，验证按工作区 / 单列表 / 按时间、手动排序和归档筛选。 */
export function sidebarScenario({ db }: MockClock): MockHandlers | void {
  const now = new Date().toISOString();
  db.workspaces = {
    ...db.workspaces,
    items: [
      ...db.workspaces.items,
      { id: "ws_harness", kind: "folder", label: "agent-harness-dev", path: HARNESS_ROOT, order: 1, createdAt: now, updatedAt: now },
      { id: "ws_notes", kind: "folder", label: "notes", path: NOTES_ROOT, order: 2, createdAt: now, updatedAt: now },
    ],
  };
  for (const seed of SEEDS) {
    const session = seedSession(db, { title: seed.title, minutesAgo: 0, pinned: seed.pinned, turns: [[seed.title, "好的，已经整理好了。"]] });
    session.workspaceRoot = seed.root ?? MOCK_WORKSPACE_ROOT;
    session.updatedAt = new Date(Date.now() - seed.minutesAgo * 60_000).toISOString();
    session.archived = seed.archived ?? false;
  }
}
