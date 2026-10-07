import type { DesktopBridge } from "@actspace/shared/desktop-bridge";
import type { MockDb } from "./mock-db";

export type MockEventName = keyof DesktopBridge["events"];
export type MockEventPayload<E extends MockEventName> = Parameters<Parameters<DesktopBridge["events"][E]>[0]>[0];

/** mock 实现共用的数据库、事件出口和计时器；`dispose` 时统一清理计时器。 */
export type MockClock = {
  readonly db: MockDb;
  /** 合并覆盖之后的 bridge。一个成员要基于另一个成员时经它调用，测试覆盖了后者也能保持一致。 */
  readonly bridge: DesktopBridge;
  emit<E extends MockEventName>(event: E, payload: MockEventPayload<E>): void;
  schedule(callback: () => void, delayMs: number): () => void;
};

let liveSeq = 0;

/** App 只看 `sessionId` 和 `message`（`task-queue-updated`、`session-title-updated`）。 */
export function emitLiveMessage(clock: MockClock, sessionId: string, message: string): void {
  clock.emit("sessionLive", {
    emittedAt: new Date().toISOString(),
    event: { kind: "runtime-live", schemaVersion: 1, runtimeInstanceId: "mock-runtime", liveSeq: ++liveSeq, throughJournalSeq: -1, sessionId, message },
  });
}
