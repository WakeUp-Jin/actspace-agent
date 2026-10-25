import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BackendRegistry, createNodeSandboxHostPort, DEFAULT_EXECUTION_TIMING, sandboxTemplate, startExecution, type SandboxRequest } from "@actspace/sandbox";
import { createNonoBackend } from "../backend.js";

const nonoPath = process.env.ACTSPACE_NONO_PATH;
// Not under the OS temp dir: on macOS that is /private/var, which nono's system read group grants as a parent of the fake HOME's nono state.
const homeParent = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", ".cache");

/** Runs against the real bundled nono with a throwaway HOME, so credential checks never touch the user's files. */
describe.skipIf(!nonoPath)("nono enforcement", () => {
  let home: string;
  beforeAll(async () => {
    await mkdir(homeParent, { recursive: true });
    home = await realpath(await mkdtemp(join(homeParent, "nono-home-")));
    await mkdir(join(home, ".ssh"));
    await writeFile(join(home, ".ssh", "id_test"), "secret");
    await writeFile(join(home, "notes.txt"), "visible");
  });

  async function run(command: string, options: { readonly network?: SandboxRequest["network"]; readonly env?: NodeJS.ProcessEnv } = {}) {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "nono-ws-")));
    const scratch = await realpath(await mkdtemp(join(tmpdir(), "nono-scratch-")));
    await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
    const host = { ...createNodeSandboxHostPort({ nonoPath }), homeDir: home };
    const registry = new BackendRegistry();
    registry.register(createNonoBackend(host));
    // Linux has no write-deny, so it runs the tool template without the git protection the manager would require.
    const base = sandboxTemplate("tool", { homeDir: home, platform: host.platform })!;
    const template = host.platform === "darwin" ? base : { ...base, denyWriteWithinWritable: [], requiredCapabilities: base.requiredCapabilities.filter(cap => cap !== "filesystem.write-deny") };
    const execution = startExecution({
      request: { purpose: "tool", isolation: "sandboxed", argv: ["/bin/sh", "-c", command], cwd: workspace, env: { ...process.env, HOME: home, TMPDIR: scratch, ...options.env }, scratchDir: scratch, filesystem: { readWrite: [workspace, scratch] }, ...options.network ? { network: options.network } : {} },
      mode: "sandboxed", host, registry, template, timing: DEFAULT_EXECUTION_TIMING,
    });
    let output = "";
    execution.onOutput(chunk => { output += chunk.text; });
    return { result: await execution.result, output, workspace };
  }

  it("allows workspace writes and denies writes elsewhere", async () => {
    const ok = await run("echo hi > a.txt && cat a.txt && echo err >&2 && echo tty > /dev/null");
    expect(ok.output).toContain("hi\n");
    expect(ok.result.outcome).toEqual({ status: "exited", exitCode: 0, signal: null });
    expect(ok.result.facts).toMatchObject({ isolation: "sandboxed", backend: { id: "nono", version: "0.80.0" }, cleanup: "ok" });
    expect(await readFile(join(ok.workspace, "a.txt"), "utf8")).toBe("hi\n");
    const outside = await run(`echo x > ${join(home, "outside.txt")}`);
    expect(outside.result.outcome.status === "exited" && outside.result.outcome.exitCode).not.toBe(0);
    await expect(readFile(join(home, "outside.txt"))).rejects.toThrow(/ENOENT/);
  });

  it.skipIf(process.platform !== "darwin")("denies writes to git hooks and config inside the workspace", async () => {
    expect((await run("echo x > .git/hooks/pre-commit")).result.outcome).toMatchObject({ status: "exited", exitCode: 1 });
    expect((await run("echo x >> .git/config")).result.outcome).toMatchObject({ status: "exited", exitCode: 1 });
  });

  it("denies credential reads, keeps the rest readable, and ignores NONO_ variables", async () => {
    const probe = `cat ${join(home, ".ssh", "id_test")} >/dev/null 2>&1 && echo leaked || echo denied`;
    expect((await run(probe)).output.trim()).toBe("denied");
    expect((await run(probe, { env: { NONO_ALLOW: home, NONO_PROFILE: "default" } })).output.trim()).toBe("denied");
    expect((await run(`cat /etc/hosts >/dev/null && cat ${join(home, "notes.txt")}`)).output.trim()).toBe("visible");
  });

  it("blocks the network when requested", async () => {
    const script = `${process.execPath} -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>console.log('online'),()=>console.log('offline'))"`;
    expect((await run(script, { network: { mode: "blocked" } })).output.trim().split("\n").at(-1)).toBe("offline");
  });
});
