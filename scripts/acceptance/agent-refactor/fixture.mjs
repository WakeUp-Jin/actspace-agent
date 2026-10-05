import { createRequire } from "node:module";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { createServer as netServer } from "node:net";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { mkdir, readFile, writeFile, open, stat } from "node:fs/promises";
import { resolve, join, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { startAgentProvider } from "../../test/fixtures/agent-provider.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(join(repo, "packages/agent-host/package.json"));
const exec = promisify(execFile);
const [command, ...args] = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
const rootArg = args.includes("--root") ? value("--root") : undefined;
if (!rootArg || !isAbsolute(rootArg)) throw new Error("Use start|resume|control|stop --root <isolated absolute path>");
const root = resolve(rootArg), statePath = join(root, "fixture.json");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const readState = async () => JSON.parse(await readFile(statePath, "utf8"));
const request = async (state, action) => {
  const response = await fetch(`http://127.0.0.1:${state.controlPort}/${action}`, { method: "POST", headers: { "x-fixture-id": state.instanceId } });
  if (!response.ok) throw new Error(`Fixture control ${response.status}`);
  return response.json();
};
const json = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";

if (command === "start" || command === "resume") {
  try { console.log(await request(await readState(), "status")); process.exit(0); } catch { /* a fresh root is required below */ }
  if (command === "resume" && !(await readState()).stopped) throw new Error("Resume requires a stopped fixture; stop it first.");
  if (command === "start" && await stat(root).catch(() => null)) throw new Error("Start requires a new directory, or a running fixture root. Preserve prior evidence in its existing root.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const log = await open(join(root, "fixture.log"), "a", 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), command === "resume" ? "serve-resume" : "serve", "--root", root], { cwd: repo, detached: true, stdio: ["ignore", log.fd, log.fd] });
  child.unref(); await log.close();
  let ready;
  for (let i = 0; i < 300; i++) {
    ready = await readState().catch(() => undefined);
    if (ready && !ready.stopped && ready.pid === child.pid) break;
    ready = undefined;
    if (child.exitCode !== null) break;
    await pause(100);
  }
  if (!ready) throw new Error(`Fixture startup failed; inspect ${join(root, "fixture.log")}`);
  console.log(JSON.stringify(ready, null, 2));
} else if (command === "control") {
  console.log(await request(await readState(), value("--action")));
} else if (command === "stop") {
  const state = await readState();
  if (state.stopped) console.log("Already stopped");
  else { console.log(await request(state, "stop")); for (let i = 0; i < 100 && !(await readState()).stopped; i++) await pause(100); if (!(await readState()).stopped) throw new Error("Fixture has not stopped yet"); }
} else if (command === "serve" || command === "serve-resume") {
  await serve(command === "serve-resume" ? await readState() : undefined);
} else throw new Error("Use start|resume|control|stop");

async function port() { const server = netServer(); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function serve(previous) {
  if (previous && !previous.stopped) throw new Error("Cannot resume an active fixture");
  const instanceId = randomUUID(), children = [], peers = new Set();
  let provider, proxy, control, stopping = false, state;
  const stop = async () => {
    if (stopping) return; stopping = true;
    for (const peer of peers) { peer.front.terminate(); peer.back.terminate(); }
    for (const child of children) if (child.exitCode === null) { const done = once(child, "exit"); child.kill("SIGTERM"); await Promise.race([done, pause(5000)]); if (child.exitCode === null) { child.kill("SIGKILL"); await done; } }
    await provider?.close(); proxy?.close(); control?.close();
    if (state) await json(statePath, { ...state, stopped: true });
  };
  process.once("SIGTERM", () => void stop()); process.once("SIGINT", () => void stop());
  try {
    const workspace = join(root, "workspace"), remoteWorkspace = join(root, "remote-workspace"), desktopData = join(root, "desktop-data");
    for (const path of [workspace, remoteWorkspace, desktopData]) await mkdir(path, { recursive: true });
    const logPath = join(root, "provider-requests.jsonl");
    const priorRequests = previous ? (await readFile(logPath, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; })).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
    provider = await startAgentProvider({ logPath, port: previous ? Number(new URL(previous.providerUrl).port) : 0, initialRequestId: Math.max(0, ...priorRequests.map(item => item.id)) });
    if (!previous) {
    const { build } = createRequire(join(repo, "apps/desktop/package.json"))("esbuild");
    const seed = join(root, "seed-settings.cjs");
    await build({ entryPoints: [join(repo, "scripts/acceptance/agent-refactor/seed-settings.ts")], outfile: seed, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
    await createRequire(pathToFileURL(seed))(seed).seedSettings(desktopData, provider.baseUrl);
    const skill = join(desktopData, "skills", "acceptance-fixture"); await mkdir(skill, { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: acceptance-fixture\ndescription: ACTSPACE_FIXTURE_SKILL isolated acceptance marker\n---\nInclude ACTSPACE_FIXTURE_SKILL_BODY in the response when this skill is selected.\n");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAQklEQVR4nGP4ulMXK5LruYQVkaqeYdSCUQuGgAXUMgiX+lELRi0YChZQyyBc6kctGLVgKFhALYNwqR+1YNSCIWABAHOvrluV+BNZAAAAAElFTkSuQmCC", "base64");
    await writeFile(join(root, "valid.png"), png); const large = await open(join(root, "oversized.png"), "w"); await large.write(png); await large.truncate(21 * 1024 * 1024); await large.close();
    }
    const cert = join(root, "cert.pem"), key = join(root, "key.pem");
    if (!previous) await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"]);
    const hostPort = previous?.hostPort ?? await port(), hostConfig = join(root, "host.json");
    if (!previous) await json(hostConfig, { schemaVersion: 1, dataRoot: join(root, "host-data"), listen: { address: "127.0.0.1", port: hostPort }, tls: { cert, key }, allowedOrigins: [], workspaces: [{ id: "fixture", name: "Fixture Remote", path: remoteWorkspace }], providers: [{ id: "fixture", type: "openai-completions", baseUrl: provider.baseUrl, keyEnv: "ACTSPACE_FIXTURE_KEY", models: ["fixture-main", "fixture-alternate"] }], defaultModel: "fixture/fixture-main" });
    const previousHostLog = await readFile(join(root, "host.log")).catch(() => Buffer.alloc(0));
    const hostLog = await open(join(root, "host.log"), "a", 0o600);
    const host = spawn(process.execPath, [join(repo, "apps/cli/dist/cli.js"), "host", "serve", "--config", hostConfig], { cwd: repo, env: { ...process.env, ACTSPACE_FIXTURE_KEY: "synthetic-host-credential" }, stdio: ["ignore", hostLog.fd, hostLog.fd] }); children.push(host); await hostLog.close();
    let ready = false;
    for (let i = 0; i < 150; i++) { if (host.exitCode !== null) throw new Error("Host exited; inspect host.log"); if ((await readFile(join(root, "host.log"))).subarray(previousHostLog.length).toString().includes('"state":"ready"')) { ready = true; break; } await pause(100); }
    if (!ready) throw new Error("Host readiness timed out");
    const { WebSocket, WebSocketServer } = require("ws");
    const ca = await readFile(cert);
    proxy = httpsServer({ cert: ca, key: await readFile(key) });
    const wss = new WebSocketServer({ server: proxy }); let online = true, uploadError = false;
    wss.on("connection", front => {
      if (!online) { front.close(); return; }
      const back = new WebSocket(`wss://127.0.0.1:${hostPort}/rpc`, { ca }); const peer = { front, back }; peers.add(peer); const queue = [];
      const close = () => { peers.delete(peer); front.close(); if (back.readyState === 0) back.terminate(); else back.close(); };
      front.on("error", close); back.on("error", close); front.on("close", close); back.on("close", close);
      back.on("open", () => { for (const bytes of queue.splice(0)) back.send(bytes, { binary: false }); });
      front.on("message", bytes => {
        const msg = JSON.parse(String(bytes));
        if (uploadError && msg.method === "uploads.begin") { front.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "Fixture temporary upload failure", data: { kind: "INTERNAL_ERROR", retryable: true } } })); return; }
        if (back.readyState === 1) back.send(bytes, { binary: false }); else queue.push(bytes);
      });
      back.on("message", bytes => { if (front.readyState === 1) front.send(bytes, { binary: false }); });
    });
    proxy.listen(previous ? Number(new URL(previous.wssUrl).port) : 0, "127.0.0.1"); await once(proxy, "listening");
    control = httpServer(async (req, res) => {
      if (req.method !== "POST" || req.headers["x-fixture-id"] !== instanceId) { res.writeHead(403); res.end(); return; }
      try {
        const action = req.url.slice(1);
        if (action === "offline") { online = false; for (const peer of peers) { peer.front.close(1011, "Fixture offline"); peer.back.close(); } }
        else if (action === "online") online = true;
        else if (action === "upload-error") uploadError = true;
        else if (action === "upload-ok") uploadError = false;
        else if (action === "stop") { res.end(JSON.stringify({ stopping: true })); await stop(); return; }
        else if (action !== "status") provider.control(action);
        res.end(JSON.stringify({ instanceId, online, uploadError, requests: provider.requests.length }));
      } catch { res.writeHead(400); res.end(JSON.stringify({ error: "Unknown control action" })); }
    });
    control.listen(previous?.controlPort ?? 0, "127.0.0.1"); await once(control, "listening");
    const desktopCommand = `ACTSPACE_DATA_DIR=${quote(desktopData)} ACTSPACE_WORKSPACE_ROOT=${quote(workspace)} NODE_EXTRA_CA_CERTS=${quote(cert)} pnpm dev:log`;
    state = { instanceId, pid: process.pid, hostPid: host.pid, root, workspace, remoteWorkspace, desktopData, providerUrl: provider.baseUrl, hostPort, wssUrl: `wss://127.0.0.1:${proxy.address().port}/rpc`, controlPort: control.address().port, cert, desktopCommand, pairCommand: `node apps/cli/dist/cli.js host pair --config ${quote(hostConfig)}` };
    await writeFile(join(root, "start-desktop.sh"), `#!/bin/sh\ncd ${quote(repo)}\n${desktopCommand}\n`, { mode: 0o700 });
    await json(statePath, state);
  } catch (error) { await stop(); throw error; }
}
