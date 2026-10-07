import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { desktopBridgeContract } from "@actspace/shared/desktop-bridge";
import type { SessionCreateInput, SessionWorktreeContext } from "@actspace/shared";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel), on: vi.fn(), removeListener: vi.fn(),
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";
import { trustedWindow } from "./ipc-sender-fixture";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); handlers.clear(); });
async function fixture(fail = false) {
  const root = await mkdtemp(join(tmpdir(), "create-worktree-"));
  const workspace = join(root, "repo");
  await mkdir(workspace);
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const git = async (args: string[], cwd = workspace) => (await promisify(execFile)("git", args, { cwd })).stdout.trim();
  await git(["init", "-b", "main"]);
  await writeFile(join(workspace, "sample.txt"), "main\n");
  await git(["add", "."]);
  await git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
  await git(["branch", "feature/base"]);
  let created: { sessionId: string; workspaceRoot: string; worktree?: SessionWorktreeContext } | undefined;
  const createSession = vi.fn(async (_id: string | undefined, workspaceRoot: string, _form: string | undefined, worktree?: SessionWorktreeContext) => {
    if (fail) throw new Error("session storage unavailable");
    created = { sessionId: "new", workspaceRoot, worktree }; return created;
  });
  const trusted = trustedWindow();
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: join(root, "data"), workspaceRoot: workspace, defaultWorkspaceRoot: workspace },
    registry: { subscribe: () => () => {}, subscribeRendererStream: () => () => {}, createSession, readSessionProjection: async () => created },
    settings: { subscribeV4Changes: () => () => {} }, getMainWindow: () => trusted.window,
  } as unknown as FixedRendererIpcOptions);
  cleanup.push(async () => registration.dispose());
  const create = (input: SessionCreateInput) => Promise.resolve().then(() => handlers.get(desktopBridgeContract.sessions.create.channel)!(trusted.event, input));
  return { workspace, git, create, createSession };
}
it("creates the selected base in a real worktree before binding the Session, keeping the original checkout", async () => {
  const f = await fixture();
  const result = await f.create({ workspaceRoot: f.workspace, runLocation: "worktree", branch: "feature/base", agentForm: "agent" });
  expect(result.workspaceRoot).not.toBe(f.workspace);
  expect(result.worktree).toMatchObject({ kind: "worktree", sourceWorkspaceRoot: f.workspace, workspaceRoot: result.workspaceRoot, baseBranch: "feature/base" });
  expect(await f.git(["rev-parse", "HEAD"], result.workspaceRoot)).toBe(await f.git(["rev-parse", "feature/base"]));
  expect(await f.git(["branch", "--show-current"], result.workspaceRoot)).toBe(result.worktree.branch);
  expect(await f.git(["branch", "--show-current"])).toBe("main");
  expect(await f.git(["worktree", "list", "--porcelain"])).toContain(result.workspaceRoot);
});
it("rolls back only the newly prepared worktree when Session creation fails", async () => {
  const f = await fixture(true);
  const before = await f.git(["worktree", "list", "--porcelain"]);
  const branches = await f.git(["branch", "--format=%(refname:short)"]);
  await expect(f.create({ workspaceRoot: f.workspace, runLocation: "worktree", branch: "main" })).rejects.toThrow("session storage unavailable");
  expect(await f.git(["worktree", "list", "--porcelain"])).toBe(before);
  expect(await f.git(["branch", "--format=%(refname:short)"])).toBe(branches);
});
it("rejects invalid execution choices and missing base branches without creating a Session", async () => {
  const f = await fixture();
  await expect(f.create({ runLocation: "invalid" } as never)).rejects.toThrow("Invalid run location");
  await expect(f.create({ hostId: "remote", runLocation: "worktree" })).rejects.toThrow("Remote worktree");
  await expect(f.create({ runLocation: "worktree", branch: "absent" })).rejects.toThrow();
  expect(f.createSession).not.toHaveBeenCalled();
});
