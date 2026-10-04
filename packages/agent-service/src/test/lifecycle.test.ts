import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { manifest } from "../manifest.js";
import { codecs } from "../codec.js";
import { activate } from "../plugin.js";

describe("agent service plugin", () => {
  it("declares pure codecs and owns a single session manager across concurrent opens", async () => {
    expect(manifest.codecs[0].eventTypes).toEqual(codecs.map(codec => codec.type));
    const registry = createCoreCodecRegistry(); codecs.forEach(codec => registry.register(codec));
    const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "test", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
    let opens = 0; let acquisitions = 0;
    const plugin = activate({ openSession: async () => { opens++; return session; }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { acquisitions++; throw new Error("not needed"); } });
    const service = plugin.services["agent.service"];
    await Promise.all([service.snapshot("test"), service.snapshot("test")]);
    expect(opens).toBe(1); expect(acquisitions).toBe(0);
    await plugin.dispose(); await plugin.dispose();
    await expect(service.snapshot("test")).rejects.toThrow("closed");
    expect(session.durabilityState).toBe("healthy");
    await session.close();
  });
});

it("drains without reopening a Session whose ownership acquisition failed", async () => {
  let opens = 0;
  const plugin = activate({ openSession: async () => { opens++; throw new Error("SESSION_WRITER_LOCKED"); }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { throw new Error("must not acquire"); } });
  const service = plugin.services["agent.service"];
  await expect(service.snapshot("foreign")).rejects.toThrow("SESSION_WRITER_LOCKED");
  service.beginDrain();
  await expect(service.waitForOwnedRuns()).resolves.toBeUndefined();
  expect(opens).toBe(1);
  await plugin.dispose();
});
