// 纯函数选择器：分组、胶囊、托盘、行说明、引用解析、右栏默认标签。不碰 store，不依赖 React。
import { createActors, createSpaces, DEFAULT_OPEN_DIRS } from "./fixtures";
import { contextUsage, type ContextUsage } from "./panel-fixtures";
import type {
  CoordinatorMessage, SoloMessage,
  MemberStatus, PanelContext, PanelKind, PanelState, PanelTab, RosterActor, Space, SpaceDemoState, SpaceMember,
} from "./types";

export const STATUS_LABEL: Record<MemberStatus, string> = {
  wait: "等你决定", fail: "出错", run: "工作中", result: "有结果", idle: "空闲",
};
/** 右栏分组顺序（D11） */
export const STATUS_ORDER: readonly MemberStatus[] = ["wait", "fail", "run", "result", "idle"];

export const COORD_TAB = "coord";

/* ---------- 基础查找 ---------- */

export function currentSpace(state: SpaceDemoState): Space {
  return state.spaces.find((s) => s.id === state.spaceId) ?? state.spaces[0];
}

/** 当前选中的标签：`coord` 或 Actor id（标签已被关掉时回到 coord） */
export function currentTab(state: SpaceDemoState): string {
  const space = currentSpace(state);
  return space.activeTab === COORD_TAB || space.openTabs.includes(space.activeTab) ? space.activeTab : COORD_TAB;
}

export const nameOf = (actors: Record<string, RosterActor>, id: string): string => actors[id]?.name ?? id;

export const findMember = (space: Space, id: string): SpaceMember | undefined => space.members.find((m) => m.id === id);

/** 名册里的 Actor（不含新起、还没留下的） */
export const rosterActors = (actors: Record<string, RosterActor>): RosterActor[] =>
  Object.values(actors).filter((a) => !a.nascent);

/** 名册搜索：名字 + 场景 + 能力 */
export function filterRoster(actors: Record<string, RosterActor>, query: string): RosterActor[] {
  const q = query.trim().toLowerCase();
  return rosterActors(actors).filter((a) => !q || (a.name + a.scene + a.abilities.join("")).toLowerCase().includes(q));
}

export const hasDiff = (m: SpaceMember | undefined): boolean => !!m && m.transcript.some((b) => b.k === "line" && !!b.diff);

/* ---------- 分组、胶囊、托盘 ---------- */

export interface MemberGroup {
  status: MemberStatus;
  members: SpaceMember[];
}

/** 按 wait → fail → run → result → idle 分组，空组去掉 */
export function groupMembers(members: readonly SpaceMember[]): MemberGroup[] {
  return STATUS_ORDER.map((status) => ({ status, members: members.filter((m) => m.status === status) }))
    .filter((g) => g.members.length > 0);
}

export const waitCount = (space: Space): number => space.members.filter((m) => m.status === "wait").length;

/** 胶囊数量：等你决定不算当前正在看的那个 Actor */
export function pillCounts(space: Space, tab: string): Record<MemberStatus, number> {
  const count = (st: MemberStatus) => space.members.filter((m) => m.status === st).length;
  return {
    wait: space.members.filter((m) => m.status === "wait" && m.id !== tab).length,
    fail: count("fail"), run: count("run"), result: count("result"), idle: count("idle"),
  };
}

/** 托盘里的审批：当前看的 Actor 已经在眼前，不重复 */
export const trayList = (space: Space, tab: string): SpaceMember[] =>
  space.members.filter((m) => m.status === "wait" && m.id !== tab);

/* ---------- 行说明 ---------- */

export interface MemberDescription {
  text: string;
  /** 悬停和无障碍用的完整说明（有结果时带「完成：」） */
  title: string;
  /** 有结果：文字前面画对勾 */
  check: boolean;
  /** 空闲：灰一点 */
  faint: boolean;
}

export function describeMember(m: SpaceMember): MemberDescription {
  if (m.status === "wait" || m.status === "fail") {
    const t = m.ask ?? "";
    return { text: t, title: t, check: false, faint: false };
  }
  if (m.status === "run") {
    const t = m.task ?? "";
    return { text: t, title: t, check: false, faint: false };
  }
  if (m.status === "result") {
    const t = m.task ?? "";
    return { text: t, title: "完成：" + t, check: true, faint: false };
  }
  const t = m.note || (m.last ? "上次：" + m.last : "还没有任务");
  return { text: t, title: t, check: false, faint: true };
}

/** 待办进度只在工作中、等你决定、有结果且有 todo 时显示 */
export const showTodo = (m: SpaceMember): boolean =>
  !!m.todo && (m.status === "run" || m.status === "wait" || m.status === "result");

/* ---------- [[id]] 引用 ---------- */

export type RefSegment = { type: "text"; text: string } | { type: "actor"; id: string };

/** 把 `[[id]]` 拆成片段；未知 id 原样保留在文字里 */
export function parseActorRefs(text: string, actors: Record<string, RosterActor>): RefSegment[] {
  const out: RefSegment[] = [];
  let last = 0;
  const push = (s: string) => {
    if (!s) return;
    const prev = out[out.length - 1];
    if (prev?.type === "text") prev.text += s;
    else out.push({ type: "text", text: s });
  };
  for (const m of text.matchAll(/\[\[(\w+)\]\]/g)) {
    push(text.slice(last, m.index));
    if (actors[m[1]]) out.push({ type: "actor", id: m[1] });
    else push(m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  push(text.slice(last));
  return out;
}

/** 去掉引用记号，流式输出按这个截取（未知 id 显示 id 本身） */
export const plainOf = (text: string, actors: Record<string, RosterActor>): string =>
  text.replace(/\[\[(\w+)\]\]/g, (_, id: string) => nameOf(actors, id));

/* ---------- 右栏 ---------- */

/** 协调 Agent 能开的标签（D26） */
export const COORD_PANEL_KINDS: readonly PanelKind[] = ["actors", "library", "memory", "files", "terminal"];
/** Actor 和一对一对话能开的标签：和普通会话一样（D27），顺序即启动页顺序 */
export const SESSION_PANEL_KINDS: readonly PanelKind[] = ["subagents", "files", "review", "context", "terminal", "reply"];

export const availablePanelKinds = (context: PanelContext): readonly PanelKind[] =>
  context === "coord" ? COORD_PANEL_KINDS : SESSION_PANEL_KINDS;

export interface PanelKindMeta {
  label: string;
  /** 「+」菜单里的名字，缺省用 label */
  menuLabel?: string;
  /** 启动页每行的说明（设计文档 §4.4） */
  desc: string;
}

export const PANEL_KIND_META: Record<PanelKind, PanelKindMeta> = {
  actors: { label: "Actor", desc: "Space 里每个 Actor 在做什么" },
  library: { label: "库", desc: "Actor 产出和你放进去的文件" },
  memory: { label: "记忆", desc: "指令和 Space 记忆" },
  files: { label: "文件", menuLabel: "工作区文件", desc: "浏览工作目录" },
  terminal: { label: "终端", desc: "在这个目录里开终端" },
  subagents: { label: "子 Agent", desc: "这次对话派出的一次性助手" },
  review: { label: "Review", desc: "这次的改动" },
  context: { label: "上下文", desc: "上下文用了多少" },
  reply: { label: "可视化回复", desc: "图表、页面形式的回复" },
  file: { label: "文件", desc: "" },
};

/** 「+」菜单顺序：Actor / 一对一用普通会话的顺序，协调 Agent 同启动页 */
export const SESSION_MENU_KINDS: readonly PanelKind[] = ["files", "review", "terminal", "reply", "context"];
export const menuKinds = (context: PanelContext): readonly PanelKind[] =>
  context === "coord" ? COORD_PANEL_KINDS : SESSION_MENU_KINDS;

const tab = (kind: PanelKind): PanelTab => ({ id: kind, kind });

/** 第一次进入某个上下文时右栏默认开什么（D28） */
export function panelDefaults(context: PanelContext, member?: SpaceMember): PanelState {
  if (context === "coord") return { tabs: [tab("actors"), tab("library"), tab("memory")], active: "actors" };
  if (context === "solo") return { tabs: [tab("files")], active: "files" };
  const first: PanelKind = hasDiff(member) ? "review" : "files";
  return { tabs: [tab(first), tab("terminal")], active: first };
}

/** 当前上下文的 key；名册页没有右栏 */
export function panelKey(state: SpaceDemoState): string | null {
  if (state.view === "chat") return state.chatWith ? `chat:${state.chatWith}` : null;
  if (state.view === "space") return `${state.spaceId}:${currentTab(state)}`;
  return null;
}

export function panelContextOf(state: SpaceDemoState): PanelContext | null {
  if (state.view === "chat") return state.chatWith ? "solo" : null;
  if (state.view === "space") return currentTab(state) === COORD_TAB ? "coord" : "actor";
  return null;
}

/** 当前上下文的右栏状态；还没记录过就按默认值算（不写回 store） */
export function panelFor(state: SpaceDemoState): PanelState | null {
  const key = panelKey(state);
  const ctx = panelContextOf(state);
  if (!key || !ctx) return null;
  const stored = state.panels[key];
  if (stored) return stored;
  const member = ctx === "actor" ? findMember(currentSpace(state), currentTab(state)) : undefined;
  return panelDefaults(ctx, member);
}

/** 文件、终端、Review 用的目录：协调 Agent 看 Space 的相关目录，Actor 看自己的目录或工作树 */
export interface PanelScope {
  roots: string[];
  dir: string;
  branch?: string;
  tree?: string;
  coord?: boolean;
  member?: SpaceMember;
}

export function panelScope(state: SpaceDemoState): PanelScope | null {
  if (state.view === "chat") return { roots: ["payments-api"], dir: "payments-api", branch: "main" };
  if (state.view !== "space") return null;
  const space = currentSpace(state);
  const tabId = currentTab(state);
  if (tabId === COORD_TAB) {
    const roots = space.dirs.length ? space.dirs : ["checkout-web"];
    return { roots, dir: roots[0], coord: true };
  }
  const m = findMember(space, tabId);
  if (!m) return null;
  return { roots: [m.dir], dir: m.dir, branch: m.tree || "main", tree: m.tree, member: m };
}

/** 输入区状态行和上下文页用的用量 */
export function contextUsageOf(state: SpaceDemoState): ContextUsage | null {
  const scope = panelScope(state);
  if (!scope) return null;
  const space = state.view === "space" ? currentSpace(state) : null;
  const m = scope.member;
  const messageCount = m ? m.transcript.length : scope.coord && space ? space.msgs.length : (state.chats[state.chatWith ?? ""] ?? []).length;
  return contextUsage({
    coord: !!scope.coord,
    inSpace: !!space,
    memoryCount: space ? space.memory.length : 0,
    messageCount,
    toolLines: m ? m.transcript.filter((b) => b.k === "line").length : 0,
    isMember: !!m,
  });
}

/** 新建 Space 弹窗里「相关目录」输入框：逗号、中文逗号、空白分隔 */
export const splitDirs = (text: string): string[] => text.split(/[,，\s]+/).filter(Boolean);

/* ---------- 初始状态与不可变更新的小工具（store 用） ---------- */

export function initialState(): SpaceDemoState {
  const spaces = createSpaces();
  return materialize({
    view: "space", spaceId: spaces[0].id, actors: createActors(), spaces,
    panels: {}, panelOpen: true, collapsed: {},
    ftOpen: [...DEFAULT_OPEN_DIRS], ftQuery: "", ftSelected: null,
    trayOpen: false, trayIdx: 0,
    chatWith: null, chats: {}, soloChats: [], rosterQuery: "",
    notice: null, freshCard: null, justGrown: null,
    litRows: [], rowsRevision: 0, approvalPulse: 0,
  });
}

/** 当前上下文第一次出现时，把默认标签写进 panels；已有的原样保留 */
export function materialize(s: SpaceDemoState): SpaceDemoState {
  const key = panelKey(s);
  if (!key || s.panels[key]) return s;
  const panel = panelFor(s);
  return panel ? { ...s, panels: { ...s.panels, [key]: panel } } : s;
}

export const mapSpace = (s: SpaceDemoState, id: string, fn: (sp: Space) => Space): Space[] =>
  s.spaces.map((sp) => (sp.id === id ? fn(sp) : sp));
export const mapMember = (sp: Space, id: string, fn: (m: SpaceMember) => SpaceMember): Space => ({
  ...sp, members: sp.members.map((m) => (m.id === id ? fn(m) : m)),
});
export const bumpRows = (s: SpaceDemoState, lit: string[]): Pick<SpaceDemoState, "litRows" | "rowsRevision"> => ({
  litRows: lit, rowsRevision: s.rowsRevision + 1,
});

/** 流式中的消息立刻收成完整文字（不触发后续动作），切走后不会卡在半截 */
export function settleStreams(s: SpaceDemoState): SpaceDemoState {
  const streaming = (m: { typing?: boolean; shown?: number | null }) => !!m.typing || (m.shown != null);
  let changed = false;
  const spaces = s.spaces.map((sp) => {
    if (!sp.msgs.some((m) => m.k === "coord" && streaming(m))) return sp;
    changed = true;
    return {
      ...sp,
      msgs: sp.msgs.map((m): CoordinatorMessage => (m.k === "coord" && streaming(m) ? { ...m, t: m.plain, typing: false, shown: null } : m)),
    };
  });
  const chats: Record<string, SoloMessage[]> = {};
  for (const [id, list] of Object.entries(s.chats)) {
    chats[id] = list.some((m) => m.k === "actor" && streaming(m))
      ? (changed = true, list.map((m): SoloMessage => (m.k === "actor" && streaming(m) ? { ...m, typing: false, shown: null } : m)))
      : list;
  }
  return changed ? { ...s, spaces, chats } : s;
}

