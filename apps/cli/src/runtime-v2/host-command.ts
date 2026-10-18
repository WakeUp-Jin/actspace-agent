import { writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { startRemoteHost } from "./host";
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@actspace/agent-host")>;
export async function runHostCommand(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv;
  if (!command || !["init", "check", "serve", "status", "pair", "devices", "revoke", "stop"].includes(command)) throw new Error("Usage: host init|check|serve|status|pair|devices|revoke|stop --config PATH [--device ID] [--force]");
  let configPath: string | undefined, deviceId: string | undefined, force = false, mock = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--config" || flag === "--device") { const value = args[++index]; if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`); if (flag === "--config") configPath = resolve(value); else deviceId = value; }
    else if (flag === "--force" && command === "stop") force = true;
    else if (flag === "--mock" && command === "serve") mock = true;
    else throw new Error(`Unknown Host option ${flag}`);
  }
  if (!configPath) throw new Error("--config PATH is required");
  const module = await dynamicImport("@actspace/agent-host");
  if (command === "init") {
    await writeFile(configPath, JSON.stringify({ schemaVersion: 1, dataRoot: "./host-data", listen: { address: "127.0.0.1", port: 4317 }, allowedOrigins: [], workspaces: [{ id: "main", name: "Main", path: "./workspace" }], providers: [{ id: "deepseek", type: "openai-completions", baseUrl: "https://api.deepseek.com", keyEnv: "DEEPSEEK_API_KEY", models: ["deepseek-chat"] }], defaultModel: "deepseek/deepseek-chat" }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    process.stdout.write(`Created ${configPath}\n`); return 0;
  }
  if (["status", "pair", "devices", "revoke", "stop"].includes(command)) {
    // Management must remain usable even if a provider credential is temporarily unavailable.
    const raw: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (!raw || typeof raw !== "object" || !("dataRoot" in raw) || typeof raw.dataRoot !== "string") throw new Error("Invalid Host dataRoot");
    const result = await module.requestHostAdmin(resolve(dirname(configPath), raw.dataRoot), command as import("@actspace/agent-host").AdminCommand, { ...(deviceId ? { deviceId } : {}), ...(force ? { force } : {}) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 0;
  }
  const config = await module.readHostConfig(configPath);
  if (command === "check") {
    process.stdout.write("Host configuration valid\n");
    if (config.webRoot && config.allowedOrigins.length === 0) process.stdout.write("Warning: webRoot is set but allowedOrigins is empty; only http://127.0.0.1 / localhost pages can connect to /rpc (and only without TLS). Add the HTTPS page origin (e.g. https://<mac>.<tailnet>.ts.net) to allowedOrigins for phones.\n");
    return 0;
  }
  const host = await startRemoteHost(config, { mock, forceExit: () => process.exit(1) });
  process.stdout.write(`${JSON.stringify({ hostId: host.hostId, address: config.listen.address, port: host.port, state: host.state() })}\n`);
  const stop = () => { void host.stop().catch(error => { process.stderr.write(`Host shutdown failed: ${String(error)}\n`); process.exitCode = 1; }); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  return 0;
}
