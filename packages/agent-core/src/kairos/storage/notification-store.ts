/**
 * Kairos 通知中心的持久化存储。
 *
 * 通知由 `notify_user` 工具产生（见 kairos/tools/notify.ts），是「强调版的最终回复」：
 * 带未读状态，用户点击已读后从 UI 消失。设计详见
 * docs/design-docs/kairos/agent-kairos-notifications.md。
 *
 * 为什么独立成 `memory/notifications.json` 而不进事件流：
 * `read` 是会被用户修改的可变状态，与 append-only 的 short-term / ring buffer 语义冲突；
 * 单独一个小 JSON 文件（滚动上限 MAX_ENTRIES）+ 原子写盘最简单。
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  KairosNotification,
  KairosNotificationLevel,
  KairosNotificationsRemoveRequest,
} from "@actspace/shared";

/** 滚动上限；超出时优先淘汰最旧的已读条目，全部未读时淘汰最旧的。 */
const MAX_ENTRIES = 200;

interface NotificationsSnapshot {
  schemaVersion: 1;
  entries: KairosNotification[];
}

export interface NotificationCreateInput {
  title: string;
  body: string | null;
  level: KairosNotificationLevel;
}

export class KairosNotificationStore {
  private readonly filePath: string;
  /** 内存中按旧→新存储；对外 list() 时反转为新→旧。 */
  private entries: KairosNotification[] = [];
  private pendingWrite: Promise<void> = Promise.resolve();
  private createdListeners: Array<(n: KairosNotification) => void> = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** 启动时调用。文件不存在 / 损坏 → 从空表开始（通知不是关键数据，不阻塞启动）。 */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<NotificationsSnapshot>;
      if (Array.isArray(parsed.entries)) {
        this.entries = parsed.entries.filter(isValidNotification);
      }
    } catch {
      this.entries = [];
    }
  }

  /** 新通知创建后回调（controller 借此对外 emit "notification"）。 */
  onCreated(listener: (n: KairosNotification) => void): void {
    this.createdListeners.push(listener);
  }

  /** 新建通知：入表、按上限淘汰、落盘、触发 onCreated。 */
  async add(input: NotificationCreateInput): Promise<KairosNotification> {
    const notification: KairosNotification = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      title: input.title,
      body: input.body,
      level: input.level,
      read: false,
    };
    this.entries.push(notification);
    this.evictIfNeeded();
    await this.persist();
    for (const listener of this.createdListeners) listener(notification);
    return notification;
  }

  /** 全量列表，新→旧。 */
  list(): KairosNotification[] {
    return [...this.entries].reverse();
  }

  unreadCount(): number {
    return this.entries.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
  }

  /**
   * 标记已读。`id` 省略 = 全部已读；`id` 不存在时静默忽略（可能已被滚动淘汰）。
   * 返回最新未读数。
   */
  async markRead(id?: string): Promise<number> {
    let changed = false;
    for (const n of this.entries) {
      if (n.read) continue;
      if (id === undefined || n.id === id) {
        n.read = true;
        changed = true;
        if (id !== undefined) break;
      }
    }
    if (changed) await this.persist();
    return this.unreadCount();
  }

  /**
   * 删除通知（纯用户侧操作，`notify_user` 工具不感知）：
   * - `{ id }`：删单条，id 不存在时静默忽略（可能已被滚动淘汰）；
   * - `{ scope: "read" }`：清除所有已读；
   * - `{ scope: "all" }`：清空全部。
   * 返回实际删除的条数。
   */
  async remove(req: KairosNotificationsRemoveRequest): Promise<number> {
    const before = this.entries.length;
    if ("id" in req) {
      this.entries = this.entries.filter((n) => n.id !== req.id);
    } else if (req.scope === "read") {
      this.entries = this.entries.filter((n) => !n.read);
    } else {
      this.entries = [];
    }
    const removed = before - this.entries.length;
    if (removed > 0) await this.persist();
    return removed;
  }

  // ─── Internal ────────────────────────────────────────────────────────

  private evictIfNeeded(): void {
    while (this.entries.length > MAX_ENTRIES) {
      const readIdx = this.entries.findIndex((n) => n.read);
      this.entries.splice(readIdx >= 0 ? readIdx : 0, 1);
    }
  }

  /** 写盘串行化（前一次没写完时排队），tmp + rename 原子替换。 */
  private persist(): Promise<void> {
    const snapshot: NotificationsSnapshot = {
      schemaVersion: 1,
      entries: this.entries.map((n) => ({ ...n })),
    };
    this.pendingWrite = this.pendingWrite
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
        await rename(tmp, this.filePath);
      });
    return this.pendingWrite;
  }
}

function isValidNotification(value: unknown): value is KairosNotification {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.timestamp === "string" &&
    typeof n.title === "string" &&
    (n.body === null || typeof n.body === "string") &&
    (n.level === "info" || n.level === "important") &&
    typeof n.read === "boolean"
  );
}
