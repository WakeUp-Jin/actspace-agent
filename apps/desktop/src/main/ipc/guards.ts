import { desktopBridgeContract as contract, type InvokeSpec } from "@actspace/shared/desktop-bridge";
import { HOST_METHODS, isRecord } from "@actspace/shared/host-protocol";

/**
 * IPC 入参 guard：只校验类型和形状，不校验业务规则（路径是否注册、会话是否存在等仍由 handler 负责）。
 * 返回 `null` 表示通过，返回字符串表示拒绝原因；注册器会把原因和 channel 一起抛给 renderer。
 */
export type IpcGuard = (input: unknown) => string | null;

type Field = "string" | "string?" | "boolean" | "boolean?" | "number" | "record";

function check(input: unknown, fields: Readonly<Record<string, Field>>, reason: string): string | null {
  if (!isRecord(input)) return reason;
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key];
    const optional = field.endsWith("?");
    // 可选字段放行 null：handler 一律用 `??` 兜底，renderer 偶尔会传 null。
    if (optional && (value === undefined || value === null)) continue;
    const ok = field === "record" ? isRecord(value)
      : field.startsWith("number") ? typeof value === "number" && Number.isFinite(value)
      : typeof value === field.replace("?", "");
    if (!ok) return reason;
  }
  return null;
}

const shape = (fields: Readonly<Record<string, Field>>, reason: string): IpcGuard => (input) => check(input, fields, reason);
const optionalShape = (fields: Readonly<Record<string, Field>>, reason: string): IpcGuard => (input) => input === undefined ? null : check(input, fields, reason);
const connectionId: IpcGuard = (input) => typeof input === "string" ? null : "Invalid connection id";
const artifactRef = shape({ hostId: "string", sessionId: "string", artifactId: "string" }, "Invalid artifact reference");
/** 握手和配对只能由 main 自己发起，renderer 不能通过 `hosts.call` 调用。 */
const MAIN_ONLY_HOST_METHODS: readonly string[] = ["host.hello", "auth.pair", "auth.resume"];

const GUARDS: ReadonlyArray<readonly [InvokeSpec<unknown, unknown>, IpcGuard]> = [
  // 工作区文件读取
  [contract.workspaces.readFile, shape({ workspaceRoot: "string?", relativePath: "string" }, "Invalid workspace file")],
  [contract.workspaces.statFile, shape({ workspaceRoot: "string?", relativePath: "string" }, "Invalid workspace file")],
  [contract.workspaces.listDir, shape({ workspaceRoot: "string?", relativePath: "string?" }, "Invalid workspace directory")],
  [contract.sessions.readArtifact, shape({ sessionId: "string", artifactPath: "string" }, "Invalid session artifact")],
  // 工作区路径
  [contract.workspaces.createFolder, shape({ parentRoot: "string", name: "string" }, "Invalid workspace folder")],
  [contract.workspaces.openInIde, shape({ workspaceId: "string" }, "Invalid workspace")],
  [contract.workspaces.setVisibility, shape({ workspaceId: "string", hidden: "boolean" }, "Invalid workspace visibility")],
  [contract.workspaces.getGitContext, optionalShape({ workspaceRoot: "string?" }, "Invalid workspace")],
  [contract.sessions.setWorkspace, shape({ sessionId: "string", workspaceId: "string?", workspaceRoot: "string?" }, "Invalid session workspace")],
  [contract.dialogs.selectWorkspaceDirectory, optionalShape({ registerWorkspace: "boolean?" }, "Invalid directory request")],
  // 终端
  [contract.terminal.create, shape({ sessionId: "string", cols: "number", rows: "number" }, "Invalid terminal request")],
  [contract.terminal.write, shape({ terminalId: "string", data: "string" }, "Invalid terminal input")],
  // 设置写入
  [contract.settings.update, shape({}, "Invalid settings update")],
  [contract.settings.updateV4, shape({ expectedRevision: "string", namespace: "string", patch: "record" }, "Invalid settings update")],
  [contract.settings.writeSystemPrompt, shape({ content: "string" }, "Invalid system prompt")],
  // Host 配对与调用
  [contract.hosts.add, shape({ name: "string", code: "string", endpoint: "record" }, "Invalid Host connection")],
  [contract.hosts.remove, connectionId],
  [contract.hosts.reconnect, connectionId],
  [contract.hosts.activate, (input) => input === null || typeof input === "string" ? null : "Invalid Session identity"],
  [contract.hosts.preview, artifactRef],
  [contract.hosts.download, artifactRef],
  [contract.hosts.call, (input) => {
    const invalid = check(input, { hostId: "string", method: "string", params: "record" }, "Invalid Host operation");
    if (invalid) return invalid;
    const method = (input as { method: string }).method;
    return (HOST_METHODS as readonly string[]).includes(method) && !MAIN_ONLY_HOST_METHODS.includes(method) ? null : "Invalid Host operation";
  }],
];

/** channel → guard。注册器按 channel 自动套用，迁移到哪个文件注册都不会漏。 */
export const IPC_INPUT_GUARDS: ReadonlyMap<string, IpcGuard> = new Map(
  GUARDS.map(([spec, guard]) => [spec.channel, guard]),
);
