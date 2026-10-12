import { decodeSessionLocator, type SessionLocatorRef } from "@actspace/shared/session-locator";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import type { IpcMiddleware } from "./ipc/registry";
import type { RemoteDesktopAdapter } from "./remote-hosts/desktop-adapter";

export type SessionGatewayRemote = Pick<RemoteDesktopAdapter, "create" | "decide" | "handle" | "mergeList">;

/**
 * 15 S7：会话请求按 locator 决定走本机还是远端（01 §P1-3、03 §2.6）。
 * - 带 `hostId` 的新建、带 `hostId` 的审批、`host:` 会话 key 转给 remote adapter；
 * - 其余走本机 handler，列表类结果再合并远端条目；
 * - `host:` 开头但无法解析的 key 抛 `InvalidSessionLocatorError`，不会落到本机。
 * 没有 remote adapter 时（远端功能未启用）全部走本机。
 */
const isHostId = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export function createSessionGateway(remote: SessionGatewayRemote | undefined): IpcMiddleware {
  return async ({ channel, input: raw }, next) => {
    if (!remote) return next();
    const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    if (channel === RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSessionPage && typeof input.search === "string" && input.search.trim()) return next();
    if (channel === RUNTIME_V2_FIXED_RENDERER_CHANNELS.createSession && input.hostId) return remote.create(input);
    // 审批按 hostId 路由（15 T10/T11），不看 requestId 的格式。
    if (channel === RUNTIME_V2_FIXED_RENDERER_CHANNELS.submitApproval && isHostId(input.hostId)) return remote.decide(input);
    const ref: SessionLocatorRef | null = typeof input.sessionId === "string" ? decodeSessionLocator(input.sessionId) : null;
    if (ref) return remote.handle(channel, input, ref);
    return remote.mergeList(channel, input, await next());
  };
}
