import { once } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
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

  async function run(command: string, options: { readonly network?: SandboxRequest["network"]; readonly env?: NodeJS.ProcessEnv; readonly purpose?: SandboxRequest["purpose"]; readonly started?: (execution: ReturnType<typeof startExecution>) => void } = {}) {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "nono-ws-")));
    const scratch = await realpath(await mkdtemp(join(tmpdir(), "nono-scratch-")));
    await mkdir(join(workspace, ".git", "hooks"), { recursive: true });
    const host = { ...createNodeSandboxHostPort({ nonoPath }), homeDir: home };
    const registry = new BackendRegistry();
    registry.register(createNonoBackend(host));
    // Linux has no write-deny, so it runs the tool template without the git protection the manager would require.
    const purpose = options.purpose ?? "tool";
    const base = sandboxTemplate(purpose, { homeDir: home, platform: host.platform })!;
    const template = host.platform === "darwin" ? base : { ...base, denyWriteWithinWritable: [], requiredCapabilities: base.requiredCapabilities.filter(cap => cap !== "filesystem.write-deny") };
    const execution = startExecution({
      request: { purpose, isolation: "sandboxed", argv: ["/bin/sh", "-c", command], cwd: workspace, env: { ...process.env, HOME: home, TMPDIR: scratch, ...options.env }, scratchDir: scratch, filesystem: { readWrite: [workspace, scratch] }, ...options.network ? { network: options.network } : {} },
      mode: "sandboxed", host, registry, template, timing: DEFAULT_EXECUTION_TIMING,
    });
    let output = "";
    execution.onOutput(chunk => { output += chunk.text; });
    options.started?.(execution);
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

  describe("allowlist (nono run)", () => {
    const servers: Server[] = [];
    afterAll(() => { for (const server of servers) server.close(); });
    async function listen(server: Server): Promise<number> {
      servers.push(server);
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      return (server.address() as { port: number }).port;
    }
    const fetchScript = (url: string) => `${process.execPath} -e "fetch('${url}',{signal:AbortSignal.timeout(5000)}).then(r=>r.text()).then(t=>console.log('ok',t),e=>console.log('fail'))" 2>/dev/null`;
    const last = (output: string) => output.trim().split("\n").at(-1);

    it("reaches opened local ports only, with the evaluation template", async () => {
      const open = await listen(createServer((_, res) => res.end("model")));
      const closed = await listen(createServer((_, res) => res.end("other")));
      const network = { mode: "allowlist" as const, domains: ["example.com"], localPorts: [open] };
      const allowed = await run(fetchScript(`http://127.0.0.1:${open}/`), { purpose: "evaluation", network, env: { HTTPS_PROXY: "http://127.0.0.1:1", NO_PROXY: "*" } });
      expect(allowed.result.outcome).toEqual({ status: "exited", exitCode: 0, signal: null });
      expect(last(allowed.output)).toBe("ok model");
      expect(last((await run(fetchScript(`http://127.0.0.1:${closed}/`), { purpose: "evaluation", network })).output)).toBe("fail");
      // The workspace copy stays writable; everything else does not.
      const write = await run(`touch inside && touch ${join(home, "escape")} 2>/dev/null; ls inside`, { purpose: "evaluation", network });
      expect(write.output.trim()).toBe("inside");
      await expect(readFile(join(home, "escape"))).rejects.toThrow(/ENOENT/);
    });

    it("keeps the network closed apart from local ports when no domain is allowed", async () => {
      const open = await listen(createServer((_, res) => res.end("model")));
      const result = await run(`${fetchScript(`http://127.0.0.1:${open}/`)}; ${fetchScript("https://example.com/")}`, { purpose: "evaluation", network: { mode: "allowlist", domains: [], localPorts: [open] } });
      expect(result.output.trim().split("\n").filter(line => /^(ok|fail)/.test(line))).toEqual(["ok model", "fail"]);
    });

    it("does not let an evaluation write other temp directories", async () => {
      const sibling = await realpath(await mkdtemp(join(tmpdir(), "nono-sibling-")));
      const probe = `touch ${sibling}/x 2>/dev/null && echo sibling-written; touch /tmp/nono-eval-$$ 2>/dev/null && echo tmp-written; touch inside && echo inside-written`;
      expect((await run(probe, { purpose: "evaluation", network: { mode: "allowlist", domains: ["example.com"] } })).output.trim()).toBe("inside-written");
      // The tool sandbox keeps nono's system temp grants.
      expect((await run(probe)).output.trim()).toContain("sibling-written");
    });

    it("sends only allowlisted domains to the upstream proxy", async () => {
      const seen: string[] = [];
      const upstream = createServer();
      upstream.on("connect", (req, socket) => { seen.push(req.url ?? ""); socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"); });
      const port = await listen(upstream);
      const network = { mode: "allowlist" as const, domains: ["example.com"], upstreamProxy: `127.0.0.1:${port}` };
      await run(`${fetchScript("https://example.com/")}; ${fetchScript("https://github.com/")}`, { purpose: "evaluation", network });
      expect(seen).toEqual(["example.com:443"]);
    });

    it("terminates the supervisor's whole group without residue", async () => {
      let stop: (() => void) | undefined;
      const pending = run("sleep 301 & sleep 302 & wait", { purpose: "evaluation", network: { mode: "allowlist", domains: ["example.com"] }, started: execution => { stop = () => execution.terminate(); } });
      await new Promise(resolve => setTimeout(resolve, 1_500));
      stop!();
      expect((await pending).result.outcome).toMatchObject({ status: "cancelled", residual: false });
    });
  });
});
