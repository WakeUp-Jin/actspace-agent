import { expect, it, vi } from "vitest";
import { AgentApplication } from "../application.js";

it("revokes process grants atomically with workspace changes but preserves them on mode downgrade", async () => {
  const process = { grantId: "process", agentId: "main:s", selector: { kind: "command_prefix", prefix: ["pnpm"], cwdRoot: "/work" } };
  const file = { grantId: "file", agentId: "main:s", selector: { kind: "exact", canonicalPath: "/outside/a" } };
  // 工作区里面的授权在降级时保留：工作区本身，以及名字以两个点开头的目录里的文件。
  const inside = { grantId: "inside", agentId: "main:s", selector: { kind: "exact", canonicalPath: "/work/..cache/a" } };
  const whole = { grantId: "whole", agentId: "main:s", selector: { kind: "subtree", canonicalRoot: "/work" } };
  const snapshot = { workspaceRoot: "/work", permissionMode: "full-access", sessionGrants: [process, file, inside, whole] };
  const session = { header: {}, appendMany: vi.fn(async (_events: unknown[]) => {}), flush: vi.fn(async () => {}) };
  const exclusive = vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn());
  const services: Record<string, unknown> = {
    "session.runtime": { resume: async () => session, snapshot: () => snapshot },
    "agent.runtime": { runs: { service: { exclusive } } },
  };
  const app = new AgentApplication({ get: (key: string) => services[key] } as never);
  await app.updateSessionPermissionMode("s", "default");
  expect(session.appendMany.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ type: "permission/grant-revoked", data: expect.objectContaining({ grantId: "file" }) })]));
  expect(JSON.stringify(session.appendMany.mock.calls[0])).not.toContain('"grantId":"process"');
  expect(JSON.stringify(session.appendMany.mock.calls[0])).not.toContain('"grantId":"inside"');
  expect(JSON.stringify(session.appendMany.mock.calls[0])).not.toContain('"grantId":"whole"');
  session.appendMany.mockClear();
  await app.updateSessionWorkspace("s", "/next");
  expect(exclusive).toHaveBeenCalledOnce();
  expect(session.appendMany).toHaveBeenCalledOnce();
  expect(session.appendMany.mock.calls[0]?.[0]).toEqual([
    expect.objectContaining({ type: "permission/grant-revoked", data: expect.objectContaining({ grantId: "process", reason: "workspace-changed" }) }),
    expect.objectContaining({ type: "session/workspace-set", data: { workspaceRoot: "/next" } }),
  ]);
});
