import type { SessionListItem } from "@actspace/shared";

// 侧栏视图选项、手动顺序、时间分桶和相对时间的纯函数。状态放在 sidebar-view-store.ts。

export type SidebarGroupBy = "workspace" | "flat" | "time";
export type SidebarSort = "manual" | "updated";
export type SidebarArchivedFilter = "hide" | "all" | "only";

export type SidebarViewOptions = {
  groupBy: SidebarGroupBy;
  sort: SidebarSort;
  archived: SidebarArchivedFilter;
};

/** 手动排序的「账本」：工作区分组 key、置顶区、单列表，以及工作区分组自己的顺序。 */
export const PINNED_ORDER_ACCOUNT = "pinned";
export const FLAT_ORDER_ACCOUNT = "flat";
export const GROUPS_ORDER_ACCOUNT = "groups";

export type SidebarViewState = {
  options: SidebarViewOptions;
  /** 手动排序时每个账本保存的 id 顺序；切到「最近更新」时清空。 */
  orders: Record<string, string[]>;
  /** 分区（"pinned" / "sessions"）是否收起。 */
  sectionCollapsed: Record<string, boolean>;
  /** 工作区分组是否收起，按分组 key 记录；没有记录的默认展开。 */
  groupCollapsed: Record<string, boolean>;
  /** 按时间分组时各时间段是否收起。 */
  timeCollapsed: Record<string, boolean>;
};

export const DEFAULT_SIDEBAR_VIEW_OPTIONS: SidebarViewOptions = Object.freeze({ groupBy: "workspace", sort: "updated", archived: "hide" });

export function defaultSidebarViewState(): SidebarViewState {
  return { options: { ...DEFAULT_SIDEBAR_VIEW_OPTIONS }, orders: {}, sectionCollapsed: {}, groupCollapsed: {}, timeCollapsed: {} };
}

const GROUP_BY_VALUES: readonly SidebarGroupBy[] = ["workspace", "flat", "time"];
const SORT_VALUES: readonly SidebarSort[] = ["manual", "updated"];
const ARCHIVED_VALUES: readonly SidebarArchivedFilter[] = ["hide", "all", "only"];
/** 每个账本最多记这么多 id，免得删掉的会话一直堆在 localStorage 里。 */
const MAX_ORDER_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function parseFlags(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  const flags: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(value)) if (flag === true) flags[key] = true;
  return flags;
}

function parseOrders(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  const orders: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(value)) {
    if (Array.isArray(ids)) orders[key] = ids.filter((id): id is string => typeof id === "string").slice(0, MAX_ORDER_LENGTH);
  }
  return orders;
}

/** 读 localStorage 里的值：坏数据、缺字段都回落默认值。 */
export function parseSidebarViewState(raw: unknown): SidebarViewState {
  if (!isRecord(raw)) return defaultSidebarViewState();
  const options = isRecord(raw.options) ? raw.options : {};
  return {
    options: {
      groupBy: pick(options.groupBy, GROUP_BY_VALUES, DEFAULT_SIDEBAR_VIEW_OPTIONS.groupBy),
      sort: pick(options.sort, SORT_VALUES, DEFAULT_SIDEBAR_VIEW_OPTIONS.sort),
      archived: pick(options.archived, ARCHIVED_VALUES, DEFAULT_SIDEBAR_VIEW_OPTIONS.archived),
    },
    orders: parseOrders(raw.orders),
    sectionCollapsed: parseFlags(raw.sectionCollapsed),
    groupCollapsed: parseFlags(raw.groupCollapsed),
    timeCollapsed: parseFlags(raw.timeCollapsed),
  };
}

export function isDefaultViewOptions(options: SidebarViewOptions): boolean {
  return options.groupBy === DEFAULT_SIDEBAR_VIEW_OPTIONS.groupBy &&
    options.sort === DEFAULT_SIDEBAR_VIEW_OPTIONS.sort &&
    options.archived === DEFAULT_SIDEBAR_VIEW_OPTIONS.archived;
}

/** 按时间分组时只按时间排，手动顺序不生效。 */
export function isManualOrder(options: SidebarViewOptions): boolean {
  return options.sort === "manual" && options.groupBy !== "time";
}

export function passesArchivedFilter(session: SessionListItem, filter: SidebarArchivedFilter): boolean {
  if (filter === "only") return Boolean(session.archived);
  if (filter === "hide") return !session.archived;
  return true;
}

function compareRecency(a: SessionListItem, b: SessionListItem): number {
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.id.localeCompare(b.id);
}

/** 最近更新在前，已归档的放最后。 */
export function sortByRecency(sessions: readonly SessionListItem[]): SessionListItem[] {
  const live = sessions.filter((session) => !session.archived).sort(compareRecency);
  const archived = sessions.filter((session) => session.archived).sort(compareRecency);
  return [...live, ...archived];
}

/**
 * 一个账本里的会话顺序（照 DSH reconcileManualOrder）。没有保存顺序时按最近更新；
 * 有保存顺序时：还没进过顺序的新会话放最上面，然后是保存的顺序，已归档的永远在最后。
 */
export function orderSessions(sessions: readonly SessionListItem[], savedOrder?: readonly string[]): SessionListItem[] {
  if (!savedOrder) return sortByRecency(sessions);
  const live = new Map(sessions.filter((session) => !session.archived).map((session) => [session.id, session]));
  const ordered: SessionListItem[] = [];
  for (const id of savedOrder) {
    const session = live.get(id);
    if (session) { ordered.push(session); live.delete(id); }
  }
  const fresh = [...live.values()].sort(compareRecency);
  const archived = sessions.filter((session) => session.archived).sort(compareRecency);
  return [...fresh, ...ordered, ...archived];
}

/** 工作区分组的顺序：传入的分组已按最近活跃排好；有保存顺序时新分组在最上面，其余照保存的顺序。 */
export function orderGroups<T extends { key: string }>(groups: readonly T[], savedOrder?: readonly string[]): T[] {
  if (!savedOrder) return [...groups];
  const rank = new Map(savedOrder.map((key, index) => [key, index]));
  const fresh = groups.filter((group) => !rank.has(group.key));
  const saved = groups.filter((group) => rank.has(group.key)).sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
  return [...fresh, ...saved];
}

/** 把 `id` 挪到 `targetId` 前面（`after` 为真时挪到后面）。目标不在列表里时原样返回。 */
export function moveInOrder(order: readonly string[], id: string, targetId: string, after: boolean): string[] {
  if (id === targetId) return [...order];
  const rest = order.filter((value) => value !== id);
  const index = rest.indexOf(targetId);
  if (index < 0) return [...order];
  rest.splice(after ? index + 1 : index, 0, id);
  return rest;
}

export const SESSION_GROUP_LIMIT = 5;

/**
 * 一组会话里先显示多少条：前 `SESSION_GROUP_LIMIT + extra` 条，运行中或待审批的、当前会话不占名额且总是显示。
 * `hidden` 是被折起来的会话。
 */
export function limitGroupSessions(
  sessions: readonly SessionListItem[],
  extra: number,
  alwaysShown: (session: SessionListItem) => boolean,
): { visible: SessionListItem[]; hidden: SessionListItem[] } {
  const limit = SESSION_GROUP_LIMIT + extra;
  const visible: SessionListItem[] = [];
  const hidden: SessionListItem[] = [];
  let counted = 0;
  for (const session of sessions) {
    if (alwaysShown(session)) visible.push(session);
    else if (counted < limit) { visible.push(session); counted++; }
    else hidden.push(session);
  }
  return { visible, hidden };
}

/** 点一次「展开其余 N 个会话」多露出几条：剩不到 7 条时一次露完，不留一个孤零零的「展开其余 1 个」。 */
export function nextRevealCount(hiddenCount: number): number {
  return hiddenCount <= SESSION_GROUP_LIMIT + 1 ? hiddenCount : SESSION_GROUP_LIMIT;
}

export type TimeBucket = {
  key: string;
  label: string;
  /** 近 7 天的桶标星期几，旁边再显示日期。 */
  date?: string;
  /** 「需要处理」桶。 */
  attention?: boolean;
  sessions: SessionListItem[];
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 一个时间点落在哪个时间段：今天、昨天、近 7 天按星期、本月更早、今年按月、往年按年月。 */
export function timeBucketOf(updatedAt: string, now: Date): Omit<TimeBucket, "sessions"> {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return { key: "unknown", label: "更早" };
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return { key: "today", label: "今天" };
  if (days === 1) return { key: "yesterday", label: "昨天" };
  if (days < 7) return { key: `day-${days}`, label: WEEKDAYS[date.getDay()]!, date: `${date.getMonth() + 1}月${date.getDate()}日` };
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return { key: "month-earlier", label: "本月更早" };
  if (date.getFullYear() === now.getFullYear()) return { key: `month-${date.getMonth() + 1}`, label: `${date.getMonth() + 1}月` };
  return { key: `year-${date.getFullYear()}-${date.getMonth() + 1}`, label: `${date.getFullYear()}年${date.getMonth() + 1}月` };
}

/** 按时间分组：先把需要处理的会话收进最上面的「需要处理」，其余按最近更新落进各时间段。 */
export function bucketByTime(
  sessions: readonly SessionListItem[],
  now: Date,
  needsAttention: (session: SessionListItem) => boolean,
): TimeBucket[] {
  const sorted = sortByRecency(sessions);
  const attention = sorted.filter(needsAttention);
  const buckets: TimeBucket[] = attention.length ? [{ key: "attention", label: "需要处理", attention: true, sessions: attention }] : [];
  const byKey = new Map<string, TimeBucket>();
  for (const session of sorted) {
    if (needsAttention(session)) continue;
    const meta = timeBucketOf(session.updatedAt, now);
    let bucket = byKey.get(meta.key);
    if (!bucket) {
      bucket = { ...meta, sessions: [] };
      byKey.set(meta.key, bucket);
      buckets.push(bucket);
    }
    bucket.sessions.push(session);
  }
  return buckets;
}

/** 中文相对时间：刚刚、5分钟、3小时、2天、2个月、1年。 */
export function formatRelativeTimeZh(timestamp: string, now: number = Date.now()): string {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天`;
  if (days < 365) return `${Math.floor(days / 30)}个月`;
  return `${Math.floor(days / 365)}年`;
}
