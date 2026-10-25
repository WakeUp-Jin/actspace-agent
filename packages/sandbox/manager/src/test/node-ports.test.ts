import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeSandboxHostPort, findBundledNono, repoNonoPath, spawnHostProcess } from "../node-ports.js";

describe.skipIf(process.platform === "win32")("node sandbox host port", () => {
  it("streams output and reports exit", async () => {
    const child = spawnHostProcess({ command: "/bin/sh", args: ["-c", "printf 'a\\n'; printf 'b' >&2; exit 4"], cwd: process.cwd(), env: process.env });
    const chunks: string[] = [];
    child.onOutput(chunk => chunks.push(`${chunk.stream}:${chunk.text}`));
    expect(await child.exited).toEqual({ exitCode: 4, signal: null });
    expect(chunks.sort()).toEqual(["stderr:b", "stdout:a\n"]);
  });

  it("signals the whole process group, including descendants", async () => {
    const child = spawnHostProcess({ command: "/bin/sh", args: ["-c", "sleep 30 & sleep 30 & wait"], cwd: process.cwd(), env: process.env });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(child.groupAlive()).toBe(true);
    child.signalGroup("SIGKILL");
    expect((await child.exited).signal).toBe("SIGKILL");
    for (let i = 0; i < 20 && child.groupAlive(); i++) await new Promise(resolve => setTimeout(resolve, 50));
    expect(child.groupAlive()).toBe(false);
  });

  it("bounds probe runs", async () => {
    const port = createNodeSandboxHostPort({ nonoPath: "/opt/nono" });
    expect(port.resources).toEqual({ nonoPath: "/opt/nono" });
    expect(await port.run({ command: "/bin/sh", args: ["-c", "echo ok"], cwd: process.cwd(), env: process.env, timeoutMs: 2_000 })).toEqual({ exitCode: 0, stdout: "ok\n", stderr: "" });
    expect((await port.run({ command: "/bin/sh", args: ["-c", "sleep 5"], cwd: process.cwd(), env: process.env, timeoutMs: 50 })).error).toMatch(/timed out/);
    expect((await port.run({ command: "/nonexistent/binary", args: [], cwd: process.cwd(), env: process.env, timeoutMs: 1_000 })).error).toMatch(/ENOENT/);
  });

  it("finds only an absolute, executable bundled nono", async () => {
    const dir = await mkdtemp(join(tmpdir(), "find-nono-"));
    try {
      const plain = join(dir, "plain"); const executable = join(dir, "nono");
      await writeFile(plain, ""); await writeFile(executable, ""); await chmod(executable, 0o755); await mkdir(join(dir, "folder"));
      expect(findBundledNono([undefined, join(dir, "missing"), plain, join(dir, "folder"), "nono", executable])).toBe(executable);
      expect(findBundledNono([undefined, plain])).toBeUndefined();
      expect(repoNonoPath("/repo", "linux", "arm64")).toBe("/repo/dist/sandbox-components/linux-arm64/nono");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
