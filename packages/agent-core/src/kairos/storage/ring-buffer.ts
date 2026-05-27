import type { SessionEvent } from "@actspace/shared";

/**
 * 用循环数组实现的环形缓冲，给 Kairos 提供"最近 N 条 SessionEvent"快速访问。
 *
 * - 默认容量 200，足够 KairosPage 首屏渲染（与 jsonl 落盘解耦）。
 * - 内部用数组 + head 指针；不持久化，进程退出即丢，由 ShortMemoryStore 兜底。
 * - 不引入并发锁：Node 单线程，整个 Kairos 域只有 controller 调用 push。
 */
export class SessionEventRingBuffer {
  private readonly capacity: number;
  private buffer: SessionEvent[] = [];
  private head = 0;
  private filled = 0;

  constructor(capacity = 200) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error(`SessionEventRingBuffer capacity must be positive, got ${capacity}`);
    }
    this.capacity = Math.floor(capacity);
  }

  push(event: SessionEvent): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(event);
      this.filled = this.buffer.length;
      this.head = this.filled % this.capacity;
      return;
    }
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
  }

  size(): number {
    return this.filled;
  }

  clear(): void {
    this.buffer = [];
    this.head = 0;
    this.filled = 0;
  }

  /** 返回最近 N 条事件，时间升序；外部修改不会影响内部。 */
  tail(n: number): SessionEvent[] {
    if (n <= 0 || this.filled === 0) return [];
    const wanted = Math.min(n, this.filled);
    if (this.filled < this.capacity) {
      // 还没回绕：直接切片
      return this.buffer.slice(this.filled - wanted, this.filled);
    }
    const result: SessionEvent[] = [];
    // 已回绕：从 head 开始是"最旧"，最近的 wanted 条在 (head + capacity - wanted) 处开始。
    const startOffset = (this.head + this.capacity - wanted) % this.capacity;
    for (let i = 0; i < wanted; i++) {
      result.push(this.buffer[(startOffset + i) % this.capacity]);
    }
    return result;
  }

  /** 返回所有当前存在的事件，时间升序（debug/test 用）。 */
  snapshot(): SessionEvent[] {
    return this.tail(this.filled);
  }
}
