import { describe, expect, it, vi } from "vitest";
import { snapshotSessionJson, validateEventEnvelopeShape, validateSessionJson } from "../event-envelope.js";

const outcome = (run: () => unknown) => { try { run(); return "ok"; } catch (error) { return `${(error as { code?: string }).code ?? (error as Error).name}: ${(error as Error).message}`; } };

const cyclic: Record<string, unknown> = { a: 1 }; cyclic.self = cyclic;
const cyclicArray: unknown[] = [1]; cyclicArray.push(cyclicArray);
const nest = (depth: number) => { let value: unknown = "leaf"; for (let i = 0; i < depth; i++) value = { child: value }; return value; };
class Custom { x = 1; }
const withGetter = { get value() { return 1; } };
const nullProto = Object.assign(Object.create(null), { a: 1 });
const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
const MiB = 1024 * 1024;

const cases: ReadonlyArray<readonly [string, unknown]> = [
  ["undefined", undefined], ["function", () => 1], ["symbol", Symbol("s")], ["bigint", 1n], ["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY], ["-Infinity", Number.NEGATIVE_INFINITY],
  ["nested NaN", { a: [1, { b: Number.NaN }] }], ["nested undefined", { a: undefined }], ["undefined in array", [1, undefined]], ["nested function", { a: () => 1 }], ["nested symbol", { a: Symbol("x") }],
  ["Date", new Date(0)], ["Map", new Map()], ["Set", new Set()], ["class instance", new Custom()], ["nested class instance", { a: new Custom() }], ["Uint8Array", new Uint8Array(2)], ["RegExp", /x/], ["Error", new Error("x")],
  ["cycle object", cyclic], ["cycle array", cyclicArray], ["depth 32 ok", nest(31)], ["depth 33", nest(33)], ["depth 40", nest(40)], ["sparse array", sparse],
  ["secret apiKey", { apiKey: "k" }], ["secret nested Authorization", { a: { Authorization: "x" } }], ["secret in array", [{ password: "p" }]], ["secret cookie", { cookie: "c" }], ["secret refreshToken", { refreshToken: "t" }], ["near-secret ok", { apiKeys: 1, tokens: 2 }],
  ["getter property", withGetter], ["null prototype", nullProto],
  ["null", null], ["string", "x"], ["empty object", {}], ["empty array", []], ["plain record", { a: 1, b: "two", c: [true, null, 1.5, -0, 1e300] }],
  ["unicode", { t: "中文🌱\u0000\n\"\\" }],
  ["string just under 1MiB", "a".repeat(MiB - 2)], ["string exactly 1MiB", "a".repeat(MiB - 1)], ["string over 1MiB", "a".repeat(MiB)],
  ["CJK under limit", "中".repeat(349_000)], ["CJK over limit", "中".repeat(350_000)],
  ["control chars over limit (6 bytes each)", "\u0001".repeat(180_000)], ["control chars under limit", "\u0001".repeat(170_000)],
  ["emoji over limit", "🌱".repeat(270_000)], ["lone surrogates over limit", "\ud800".repeat(180_000)],
  ["many keys over limit", Object.fromEntries(Array.from({ length: 60_000 }, (_, i) => [`key-${i}`, i]))],
  ["many numbers over limit", Array.from({ length: 200_000 }, (_, i) => i * 1.1)],
  ["many small numbers near limit", Array.from({ length: 400_000 }, () => 1)],
  ["large but under limit (bound above limit)", { text: "x".repeat(300_000), more: "y".repeat(300_000) }],
  ["nested big strings over limit", { a: { b: ["z".repeat(600_000), "w".repeat(500_000)] } }],
];

describe("validateSessionJson is the validate-only twin of snapshotSessionJson", () => {
  it.each(cases)("%s: identical verdict and error", (_name, value) => {
    expect(outcome(() => validateSessionJson(value))).toBe(outcome(() => snapshotSessionJson(value)));
  });

  it("the table covers both accepted and rejected inputs", () => {
    const verdicts = new Set(cases.map(([, value]) => outcome(() => snapshotSessionJson(value)).startsWith("ok")));
    expect(verdicts).toEqual(new Set([true, false]));
    const messages = new Set(cases.map(([, value]) => outcome(() => snapshotSessionJson(value))));
    for (const needle of ["plain JSON values", "finite", "nesting depth", "forbidden secret field", "1 MiB"]) expect([...messages].some(m => m.includes(needle))).toBe(true);
  });

  it("does not serialize values that cannot reach the size limit, and does when they might", () => {
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      validateSessionJson({ a: "small", b: [1, 2, 3] });
      expect(stringify).not.toHaveBeenCalled();
      validateSessionJson({ text: "x".repeat(300_000), more: "y".repeat(300_000) });
      expect(stringify).toHaveBeenCalledTimes(1);
    } finally { stringify.mockRestore(); }
  });
});

describe("validateEventEnvelopeShape", () => {
  const envelope = (data: unknown) => ({ recordKind: "event", seq: 0, type: "x/y", eventVersion: 1, criticality: "required", time: "2026-11-04T00:00:00Z", source: { ownerPluginId: "p" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } });
  it.each([["ok", { a: 1 }], ["secret", { token: 1, password: "x" }], ["NaN", { a: Number.NaN }], ["cycle", cyclic], ["too large", { a: "x".repeat(MiB) }], ["class", new Custom()]] as const)("%s: same verdict as the snapshot path", (_name, data) => {
    expect(outcome(() => validateEventEnvelopeShape(envelope(data)))).toBe(outcome(() => snapshotSessionJson(envelope(data))).replace(/^ok$/, "ok"));
  });
});
