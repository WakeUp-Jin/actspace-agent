/**
 * `fixtures/surface-derived/old-format.jsonl` 的读取与旧格式 → 新格式转换，
 * 供 surface-derived 与 context-trusted 两个等价性测试共用。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import {
  SessionJournal,
  createCoreCodecRegistry,
  type EventCodec,
  type SessionEventEnvelopeV1,
  type SessionHeaderV1,
} from "@actspace/session-journal";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";

export const SURFACE_FIXTURES = join(__dirname, "fixtures", "surface-derived");

export type OldEvent = Omit<SessionEventEnvelopeV1, "surface" | "data"> & {
  data: Record<string, RuntimeJsonValue>;
  surface: (Record<string, RuntimeJsonValue> & { node?: Record<string, RuntimeJsonValue> }) | null;
};

/** 旧格式 → 新格式：节点内容搬进 data 对应字段，surface 只留标记（与 T6 转换脚本同一套规则）。 */
export function convert(event: OldEvent): SessionEventEnvelopeV1 {
  if (!event.surface?.node) return event as unknown as SessionEventEnvelopeV1;
  const { node, ...marker } = event.surface;
  const data = { ...event.data };
  switch (event.type) {
    case "user/message":
    case "assistant/message":
    case "agent/inbox/spliced":
    case "tool/recovery-outcome":
      data.content = node.content;
      break;
    case "tool/result":
      // 旧格式里 node.content 就是 modelOutput，isError 就是 status !== "completed"：转换时不搬，只核对。
      expect(node.content).toEqual(data.modelOutput);
      expect(node.isError).toBe(data.status !== "completed");
      break;
    case "surface/replaced":
      data.node = node;
      break;
    default:
      throw new Error(`unexpected surface on ${event.type}`);
  }
  return { ...event, data, surface: marker } as unknown as SessionEventEnvelopeV1;
}

export function readOldFixture(): { header: SessionHeaderV1; oldEvents: OldEvent[] } {
  const [headerLine, ...lines] = readFileSync(join(SURFACE_FIXTURES, "old-format.jsonl"), "utf8").trim().split("\n");
  return {
    header: JSON.parse(headerLine) as SessionHeaderV1,
    oldEvents: lines.map((line) => JSON.parse(line) as OldEvent),
  };
}

/** 插件事件（agent-service task/run、context supplement）与 surface 无关，用宽松 codec 登记，只为回放。 */
export function fixtureRegistry(events: readonly SessionEventEnvelopeV1[]) {
  const known = createCoreCodecRegistry();
  const pluginCodecs = [
    ...new Map(
      events
        .filter((event) => known.get(event.type) === undefined)
        .map((event) => [
          event.type,
          {
            type: event.type,
            ownerPluginId: event.source.ownerPluginId,
            currentVersion: event.eventVersion,
            criticality: event.criticality,
            validate: () => undefined,
          } as EventCodec,
        ]),
    ).values(),
  ];
  return createCoreCodecRegistry(pluginCodecs);
}

export function seedJournal(events: readonly SessionEventEnvelopeV1[], now?: () => string): SessionJournal {
  return new SessionJournal({ registry: fixtureRegistry(events), seed: events, ...(now ? { now } : {}) });
}
