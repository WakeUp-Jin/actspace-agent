import { createSecureContext } from "node:tls";
import { readFile, realpath, stat, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { constants } from "node:fs";
import { isRecord } from "@actspace/shared/host-protocol";
export interface HostConfig {
  schemaVersion: 1; dataRoot: string; listen: { address: string; port: number };
  tls?: { cert: string; key: string }; allowedOrigins: string[]; webRoot?: string;
  workspaces: { id: string; name: string; path: string }[];
  providers: { id: string; type: "openai-completions" | "openai-responses" | "anthropic-messages"; baseUrl: string; keyEnv: string; models: string[] }[];
  defaultModel: string;
}
function keys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error("Invalid Host configuration fields");
}
function string(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > 4096) throw new Error("Invalid Host configuration string"); return value; }
function identifier(value: unknown): string {
  const id = string(value);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error("Invalid Host configuration identifier");
  return id;
}
export async function readHostConfig(file: string, env: NodeJS.ProcessEnv = process.env): Promise<HostConfig> {
  const raw: unknown = JSON.parse(await readFile(file, "utf8"));
  keys(raw, ["schemaVersion", "dataRoot", "listen", "tls", "allowedOrigins", "webRoot", "workspaces", "providers", "defaultModel"]);
  if (raw.schemaVersion !== 1) throw new Error("Unsupported Host configuration version");
  keys(raw.listen, ["address", "port"]);
  const address = string(raw.listen.address), port = raw.listen.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid listen port");
  const base = dirname(resolve(file)); let tls: HostConfig["tls"];
  if (raw.tls !== undefined) { keys(raw.tls, ["cert", "key"]); tls = { cert: resolve(base, string(raw.tls.cert)), key: resolve(base, string(raw.tls.key)) }; await access(tls.cert, constants.R_OK); await access(tls.key, constants.R_OK); createSecureContext({ cert: await readFile(tls.cert), key: await readFile(tls.key) }); }
  if (!tls && !["127.0.0.1", "::1"].includes(address)) throw new Error("Public Host binding requires TLS");
  if (!Array.isArray(raw.allowedOrigins) || raw.allowedOrigins.some(origin => typeof origin !== "string" || new URL(origin).origin !== origin || !origin.startsWith("https://"))) throw new Error("Origins must be exact HTTPS origins");
  let webRoot: string | undefined;
  if (raw.webRoot !== undefined) {
    try { webRoot = await realpath(resolve(base, string(raw.webRoot))); if (!(await stat(webRoot)).isDirectory()) throw new Error(); await access(webRoot, constants.R_OK | constants.X_OK); }
    catch { throw new Error("webRoot must be an existing directory"); }
  }
  if (!Array.isArray(raw.workspaces) || !raw.workspaces.length) throw new Error("At least one workspace required");
  const workspaces: HostConfig["workspaces"] = [];
  for (const item of raw.workspaces) {
    keys(item, ["id", "name", "path"]); const path = await realpath(resolve(base, string(item.path)));
    if (!(await stat(path)).isDirectory()) throw new Error("Workspace must exist and be a directory");
    await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
    workspaces.push({ id: identifier(item.id), name: string(item.name), path });
  }
  if (new Set(workspaces.map(w => w.id)).size !== workspaces.length) throw new Error("Duplicate workspace id");
  if (!Array.isArray(raw.providers) || !raw.providers.length) throw new Error("At least one provider required");
  const providers: HostConfig["providers"] = raw.providers.map(item => {
    keys(item, ["id", "type", "baseUrl", "keyEnv", "models"]);
    if (!["openai-completions", "openai-responses", "anthropic-messages"].includes(String(item.type))) throw new Error("Invalid provider type");
    const baseUrl = string(item.baseUrl), url = new URL(baseUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Provider requires HTTPS or loopback");
    const keyEnv = string(item.keyEnv);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(keyEnv) || !env[keyEnv]) throw new Error(`Missing provider credential environment variable: ${keyEnv}`);
    if (!Array.isArray(item.models) || !item.models.length) throw new Error("Provider models required");
    const models = item.models.map(string);
    if (models.some(model => model.length > 512) || new Set(models).size !== models.length) throw new Error("Invalid or duplicate provider model");
    return { id: identifier(item.id), type: item.type as HostConfig["providers"][number]["type"], baseUrl, keyEnv, models };
  });
  if (new Set(providers.map(p => p.id)).size !== providers.length) throw new Error("Duplicate provider id");
  const defaultModel = string(raw.defaultModel);
  if (!providers.some(p => p.models.some(m => `${p.id}/${m}` === defaultModel))) throw new Error("defaultModel must reference a configured provider/model");
  const dataRoot = resolve(base, string(raw.dataRoot));
  let parent = dataRoot;
  for (;;) {
    try { const info = await stat(parent); if (!info.isDirectory()) throw new Error("Host data path is not a directory"); await access(parent, constants.W_OK | constants.X_OK); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(parent) === parent) throw error; parent = dirname(parent); }
  }
  return { schemaVersion: 1, dataRoot: resolve(base, string(raw.dataRoot)), listen: { address, port }, ...(tls ? { tls } : {}), allowedOrigins: raw.allowedOrigins as string[], ...(webRoot ? { webRoot } : {}), workspaces, providers, defaultModel };
}
