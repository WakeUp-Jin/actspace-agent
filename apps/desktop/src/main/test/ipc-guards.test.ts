import { describe, expect, it } from "vitest";
import { desktopBridgeContract as contract, type InvokeSpec } from "@actspace/shared/desktop-bridge";
import { IPC_INPUT_GUARDS } from "../ipc/guards";

type Case = { spec: InvokeSpec<unknown, unknown>; valid: unknown[]; invalid: unknown[] };

const CASES: Record<string, Case> = {
  "workspaces.readFile": { spec: contract.workspaces.readFile, valid: [{ relativePath: "a.ts" }, { workspaceRoot: "/w", relativePath: "a.ts" }], invalid: [undefined, { workspaceRoot: "/w" }, { relativePath: 1 }] },
  "workspaces.statFile": { spec: contract.workspaces.statFile, valid: [{ workspaceRoot: null, relativePath: "a.ts" }], invalid: [{ relativePath: ["a"] }] },
  "workspaces.listDir": { spec: contract.workspaces.listDir, valid: [{}, { workspaceRoot: "/w", relativePath: "" }], invalid: [null, { relativePath: 0 }] },
  "sessions.readArtifact": { spec: contract.sessions.readArtifact, valid: [{ sessionId: "s", artifactPath: "out.png" }], invalid: [{ sessionId: "s" }] },
  "workspaces.createFolder": { spec: contract.workspaces.createFolder, valid: [{ parentRoot: "/w", name: "new" }], invalid: [{ parentRoot: "/w" }, "new"] },
  "workspaces.openInIde": { spec: contract.workspaces.openInIde, valid: [{ workspaceId: "w1" }], invalid: [{ workspaceId: 1 }] },
  "workspaces.setVisibility": { spec: contract.workspaces.setVisibility, valid: [{ workspaceId: "w1", hidden: true }], invalid: [{ workspaceId: "w1", hidden: "yes" }] },
  "workspaces.getGitContext": { spec: contract.workspaces.getGitContext, valid: [undefined, {}, { workspaceRoot: "/w" }], invalid: [{ workspaceRoot: 1 }, "x"] },
  "sessions.setWorkspace": { spec: contract.sessions.setWorkspace, valid: [{ sessionId: "s", workspaceRoot: "/w" }, { sessionId: "s", workspaceId: "w1" }], invalid: [{ workspaceRoot: "/w" }] },
  "dialogs.selectWorkspaceDirectory": { spec: contract.dialogs.selectWorkspaceDirectory, valid: [undefined, { registerWorkspace: true }], invalid: [{ registerWorkspace: "true" }] },
  "terminal.create": { spec: contract.terminal.create, valid: [{ sessionId: "s", cols: 80, rows: 24 }], invalid: [{ sessionId: "s", cols: Number.NaN, rows: 24 }, { sessionId: "s", cols: "80", rows: 24 }] },
  "terminal.write": { spec: contract.terminal.write, valid: [{ terminalId: "t", data: "ls\r" }], invalid: [{ terminalId: "t", data: 1 }] },
  "settings.update": { spec: contract.settings.update, valid: [{}, { defaultModelId: null }], invalid: [null, [], "x"] },
  "settings.updateV4": { spec: contract.settings.updateV4, valid: [{ expectedRevision: "r1", namespace: "general", patch: {} }], invalid: [{ expectedRevision: "r1", namespace: "general" }, { expectedRevision: 1, namespace: "general", patch: {} }] },
  "settings.writeSystemPrompt": { spec: contract.settings.writeSystemPrompt, valid: [{ content: "" }], invalid: [{ content: null }] },
  "hosts.add": { spec: contract.hosts.add, valid: [{ name: "box", code: "123456", endpoint: { kind: "wss", url: "wss://h" } }], invalid: [{ name: "box", code: "123456" }, { name: "box", code: 123456, endpoint: {} }] },
  "hosts.remove": { spec: contract.hosts.remove, valid: ["c1"], invalid: [{ id: "c1" }] },
  "hosts.reconnect": { spec: contract.hosts.reconnect, valid: ["c1"], invalid: [1] },
  "hosts.activate": { spec: contract.hosts.activate, valid: [null, "host:s1"], invalid: [undefined, 1] },
  "hosts.preview": { spec: contract.hosts.preview, valid: [{ hostId: "h", sessionId: "s", artifactId: "a" }], invalid: [{ hostId: "h", sessionId: "s" }] },
  "hosts.download": { spec: contract.hosts.download, valid: [{ hostId: "h", sessionId: "s", artifactId: "a" }], invalid: [{ hostId: "h", sessionId: 1, artifactId: "a" }] },
  "hosts.call": { spec: contract.hosts.call, valid: [{ hostId: "h", method: "host.describe", params: {} }], invalid: [{ hostId: "h", method: "auth.pair", params: {} }, { hostId: "h", method: "nope", params: {} }, { hostId: "h", method: "host.describe", params: null }] },
};

describe("IPC input guards", () => {
  it("has a case for every guarded channel", () => {
    expect(Object.values(CASES).map(({ spec }) => spec.channel).sort()).toEqual([...IPC_INPUT_GUARDS.keys()].sort());
  });

  for (const [name, { spec, valid, invalid }] of Object.entries(CASES)) {
    it(`${name} accepts well-formed input and rejects malformed input`, () => {
      const guard = IPC_INPUT_GUARDS.get(spec.channel)!;
      for (const input of valid) expect(guard(input), JSON.stringify(input)).toBeNull();
      for (const input of invalid) expect(guard(input), JSON.stringify(input) ?? "undefined").toEqual(expect.any(String));
    });
  }
});
