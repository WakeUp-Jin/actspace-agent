import { describe, expect, it } from "vitest";
import {
  desktopBridgeContract,
  type BridgeSpec,
} from "../desktop-bridge";
import { ENGLISH_LEARNING_CHANNELS } from "../english-learning";
import { HOST_IPC } from "../host-protocol";
import { PERFORMANCE_CHANNELS } from "../performance";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "../runtime-v2";

function entries(): Array<{ path: string; spec: BridgeSpec }> {
  return Object.entries(desktopBridgeContract).flatMap(([domain, members]) =>
    Object.entries(members as Record<string, BridgeSpec>).map(([member, spec]) => ({ path: `${domain}.${member}`, spec })),
  );
}

function channels(): Array<{ path: string; channel: string }> {
  return entries().flatMap(({ path, spec }) => (spec.kind === "local" ? [] : [{ path, channel: spec.channel }]));
}

describe("desktop bridge contract", () => {
  it("never maps two members to the same channel", () => {
    const seen = new Map<string, string>();
    for (const { path, channel } of channels()) {
      expect(seen.get(channel), `${path} reuses ${channel}`).toBeUndefined();
      seen.set(channel, path);
    }
  });

  it("uses exactly the existing renderer channel constants", () => {
    const known = [
      ...Object.values(RUNTIME_V2_FIXED_RENDERER_CHANNELS),
      ...Object.values(PERFORMANCE_CHANNELS),
      ...Object.values(ENGLISH_LEARNING_CHANNELS),
      ...Object.values(HOST_IPC),
    ];
    expect(channels().map(({ channel }) => channel).sort()).toEqual([...known].sort());
  });

  it("keeps only preload-implemented members as local", () => {
    expect(entries().filter(({ spec }) => spec.kind === "local").map(({ path }) => path).sort()).toEqual([
      "appearance.setUiZoom",
      "dialogs.getPathForFile",
    ]);
  });

  it("keeps the argument defaults the preload used to apply", () => {
    const defaults = entries().flatMap(({ path, spec }) => (spec.kind === "invoke" && "defaultInput" in spec ? [[path, spec.defaultInput]] : []));
    expect(Object.fromEntries(defaults)).toEqual({
      "approvals.listPending": {},
      "sessions.listPage": {},
      "sessions.list": {},
      "sessions.create": {},
      "skills.list": {},
    });
    expect(desktopBridgeContract.events.shuttingDown.defaultPayload).toEqual({ reason: "normal" });
  });
});
