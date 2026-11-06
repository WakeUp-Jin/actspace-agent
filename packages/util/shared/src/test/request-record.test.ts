import { describe, expect, it } from "vitest";
import { effectiveRequestRecord, indexRequestRecords } from "../request-record";

const events = [
  { seq: 1, type: "request/header", data: {} },
  { seq: 2, type: "request/system-prompt", data: { digest: "p1" } },
  { seq: 3, type: "request/tools", data: { digest: "t1" } },
  { seq: 4, type: "request/context", data: {} },
  { seq: 5, type: "request/header", data: {} },
  { seq: 6, type: "request/system-prompt", data: { digest: "p2" } },
  { seq: 7, type: "request/context", data: {} },
];

describe("effective request record", () => {
  it("takes the latest prompt and tools at or before the request context", () => {
    expect(effectiveRequestRecord(events, 4)).toMatchObject({ systemPrompt: { seq: 2, data: { digest: "p1" } }, tools: { seq: 3, data: { digest: "t1" } } });
    expect(effectiveRequestRecord(events, 7)).toMatchObject({ systemPrompt: { seq: 6, data: { digest: "p2" } }, tools: { seq: 3 } });
    expect(effectiveRequestRecord(events)).toMatchObject({ systemPrompt: { seq: 6 } });
    expect(effectiveRequestRecord(events, 1)).toEqual({});
  });

  it("answers the same through the index", () => {
    const at = indexRequestRecords(events);
    for (const seq of [0, 1, 2, 3, 4, 5, 6, 7, 100]) expect(at(seq)).toEqual(effectiveRequestRecord(events, seq));
  });
});
