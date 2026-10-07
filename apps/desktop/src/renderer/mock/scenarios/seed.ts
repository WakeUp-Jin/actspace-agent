import { appendMockMessage, createMockSession, type MockDb, type MockSession } from "../mock-db";

type SeedSession = {
  readonly title: string;
  /** 距种子时间的分钟数，决定侧栏排序。 */
  readonly minutesAgo: number;
  /** 每项是一轮 [用户, 助手]；助手为 null 表示这一轮还没有回复。 */
  readonly turns: readonly (readonly [string, string | null])[];
  readonly hostId?: string;
  readonly pinned?: boolean;
};

const SEED_NOW = Date.parse("2026-10-06T09:00:00.000Z");

/** 场景数据：按「轮」写入消息，时间戳固定，截图稳定。 */
export function seedSession(db: MockDb, seed: SeedSession): MockSession {
  const updatedAt = new Date(SEED_NOW - seed.minutesAgo * 60_000).toISOString();
  const session = createMockSession(db, { title: seed.title, hostId: seed.hostId, updatedAt });
  for (const [user, assistant] of seed.turns) {
    const agentRunId = db.nextId("seed-run");
    appendMockMessage(db, session, "user", user, agentRunId);
    if (assistant !== null) appendMockMessage(db, session, "assistant", assistant, agentRunId);
  }
  session.updatedAt = updatedAt;
  session.pinned = seed.pinned ?? false;
  return session;
}

/** 当前轮的 agentRunId（最后一条消息所属的运行）。 */
export function lastRunId(session: MockSession): string {
  const last = session.messages[session.messages.length - 1];
  if (!last) throw new Error(`Seed session has no messages: ${session.id}`);
  return last.agentRunId;
}
