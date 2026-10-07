// Space 演示的数据类型。按设计文档 §9 拆成名册 Actor、Space、成员三类实体，
// 以后接后端时只换数据源，不改组件。

export type MemberStatus = "wait" | "fail" | "run" | "result" | "idle";

/** 名册里的 Actor（含 Space 里新起、还没留下的）。`nascent` 为 true 表示只属于某个 Space */
export interface RosterActor {
  id: string;
  name: string;
  /** 角色图序号 1..9；新起的 Actor 在留下之前没有 */
  img?: number;
  nascent?: boolean;
  /** 留下后换成的角色图序号 */
  growImg?: number;
  scene: string;
  abilities: string[];
  /** 自己的记忆条数 */
  memN?: number;
  /** 名册卡片底部的「今天聊过」 */
  last?: string;
  /** 在几个 Space 里 */
  spaces?: number;
}

/** 对话块：Actor 标签页里的一条连续对话 */
export type ActorBlock =
  | { k: "task"; t: string; at: string }
  | { k: "done"; t: string; at: string }
  | { k: "brief"; t: string }
  | { k: "line"; k1: string; t: string; diff?: [number, number] }
  | { k: "sync"; t: string }
  | { k: "text"; t: string }
  | { k: "approval" };

export interface MemberApproval {
  cmd: string;
  why: string;
}

/** Actor 在一个 Space 里的位置：状态、任务、目录、对话 */
export interface SpaceMember {
  id: string;
  status: MemberStatus;
  /** 当前任务（工作中、等你决定、有结果） */
  task?: string | null;
  /** 等你决定、出错时它在等什么 */
  ask?: string | null;
  todo?: [number, number];
  time?: string;
  dir: string;
  /** 隔离用的工作树 */
  tree?: string;
  approval?: MemberApproval;
  transcript: ActorBlock[];
  unread?: boolean;
  /** 上一件事（空闲时显示「上次：…」） */
  last?: string | null;
  /** 空闲时的备注，优先于「上次」 */
  note?: string | null;
  denied?: boolean;
}

export type KeepState = "ask" | "growing" | "kept" | "declined";

/** 协调 Agent 的消息流 */
export type CoordinatorMessage =
  | { k: "div"; t: string }
  | { k: "user"; t: string }
  | {
      k: "coord";
      /** 带 [[actorId]] 引用的正文 */
      t: string;
      /** 去掉引用后的纯文本，流式时按它截取 */
      plain: string;
      typing?: boolean;
      /** 流式已显示的字数；结束后为 null */
      shown?: number | null;
    }
  | { k: "mem"; mid: string; t: string; undone?: boolean }
  | { k: "keep"; aid: string; state: KeepState };

export interface MemoryItem {
  id: string;
  t: string;
  src: string;
}

export interface LibraryFile {
  id: string;
  name: string;
  kind: "artifact" | "added";
  src?: string;
  date: string;
}

export interface Space {
  id: string;
  name: string;
  /** Space 头像底色，SPACE_COLORS 之一 */
  img: string;
  goal: string;
  dirs: string[];
  instructions: string;
  members: SpaceMember[];
  msgs: CoordinatorMessage[];
  memory: MemoryItem[];
  library: LibraryFile[];
  /** 打开的 Actor 标签，按打开顺序，协调 Agent 标签固定不在里面 */
  openTabs: string[];
  /** 离开时选中的标签：`coord` 或 Actor id */
  activeTab: string;
}

/** 一对一对话的消息 */
export type SoloMessage =
  | { k: "user"; t: string }
  | { k: "actor"; t: string; plain: string; typing?: boolean; shown?: number | null };

/** 右栏标签种类。`file` 是从文件树打开的单个文件，带 path */
export type PanelKind =
  | "actors"
  | "library"
  | "memory"
  | "files"
  | "terminal"
  | "subagents"
  | "review"
  | "context"
  | "reply"
  | "file";

export interface PanelTab {
  /** 种类即 id；单个文件是 `file:<path>` */
  id: string;
  kind: PanelKind;
  path?: string;
  label?: string;
}

export interface PanelState {
  tabs: PanelTab[];
  /** 没有标签时为 null，显示启动页 */
  active: string | null;
}

/** 右栏上下文：协调 Agent、Space 里的 Actor、一对一对话 */
export type PanelContext = "coord" | "actor" | "solo";

export type SpaceView = "space" | "roster" | "chat";

export interface SpaceNotice {
  id: string;
  text: string;
}

/** 刚长成的 Actor，UI 据此播放弹出动画；`revision` 每次递增 */
export interface GrownMark {
  id: string;
  revision: number;
}

export interface SpaceDemoState {
  view: SpaceView;
  spaceId: string;
  actors: Record<string, RosterActor>;
  spaces: Space[];
  /** 右栏：按上下文 key 记标签，key 见 `panelKey()` */
  panels: Record<string, PanelState>;
  panelOpen: boolean;
  /** 右栏 Actor 标签里折叠的分组 */
  collapsed: Partial<Record<MemberStatus, boolean>>;
  /** 文件树展开的目录（所有上下文共用） */
  ftOpen: string[];
  ftQuery: string;
  ftSelected: string | null;
  trayOpen: boolean;
  trayIdx: number;
  /** 一对一对话的对象 */
  chatWith: string | null;
  chats: Record<string, SoloMessage[]>;
  /** 左栏一对一对话，最近的在前 */
  soloChats: string[];
  rosterQuery: string;
  notice: SpaceNotice | null;
  /** 名册里要描边的卡片 */
  freshCard: string | null;
  justGrown: GrownMark | null;
  /** 要闪一下的行 id */
  litRows: string[];
  /** 分组变化一次加一，UI 据此做 FLIP */
  rowsRevision: number;
  /** 新审批到达一次加一，胶囊据此跳动 */
  approvalPulse: number;
}

/* ---------- store 接口 ---------- */

export interface SpaceDemoClock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CreateSpaceInput {
  name: string;
  goal: string;
  dirs: string[];
  /** 选中的名册 Actor id */
  crew: string[];
}

export interface SpaceDemoActions {
  send(text: string): void;
  sendSolo(text: string): void;
  approve(id: string): void;
  deny(id: string): void;
  openActorTab(id: string): void;
  selectTab(id: string): void;
  closeTab(id: string): void;
  closeOtherTabs(): void;
  switchSpace(id: string): void;
  goRoster(): void;
  openSoloChat(id: string): void;
  keepActor(id: string): void;
  declineActor(id: string): void;
  undoMemory(mid: string): void;
  forgetMemory(id: string): void;
  createSpace(input: CreateSpaceInput): string;
  toggleGroup(status: MemberStatus): void;
  openPanelTab(kind: PanelKind, extra?: { path?: string; label?: string }): void;
  selectPanelTab(id: string): void;
  closePanelTab(id: string): void;
  togglePanel(): void;
  setPanelOpen(open: boolean): void;
  /** 点非琥珀胶囊：回协调 Agent 并打开右栏的 Actor 标签 */
  showActorsPanel(): void;
  toggleTray(): void;
  closeTray(): void;
  trayPrev(): void;
  trayNext(): void;
  trayView(id: string): void;
  toggleFileDir(path: string): void;
  setFileQuery(query: string): void;
  openFile(path: string): void;
  setRosterQuery(query: string): void;
  showNotice(text: string): void;
  dismissNotice(): void;
  clearFreshCard(): void;
  clearJustGrown(): void;
  reset(): void;
}

export interface SpaceDemoStore {
  subscribe(listener: () => void): () => void;
  /** 状态不变时返回同一个引用 */
  getSnapshot(): SpaceDemoState;
  actions: SpaceDemoActions;
  /** 当前上下文的右栏 key；名册页为 null */
  panelKey(): string | null;
  /** 当前右栏是否打开（名册页恒为 false） */
  panelOpen(): boolean;
  /** 清掉所有挂起的定时器，测试和卸载时用 */
  dispose(): void;
}

