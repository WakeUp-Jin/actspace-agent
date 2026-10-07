import { decodeSessionLocator } from "@actspace/shared/session-locator";

/** 会话在哪里：本机、远端 Host，或 key 损坏（以 `host:` 开头但解不开）。 */
export type SessionLocation =
  | { readonly kind: "local" }
  | { readonly kind: "remote"; readonly hostId: string; readonly sessionId: string }
  | { readonly kind: "invalid"; readonly key: string };

const LOCAL: SessionLocation = { kind: "local" };

/** 不抛错：损坏的 key 返回 `invalid`，由 UI 显示错误态，避免渲染中抛错白屏。 */
export function locateSession(key: string | null | undefined): SessionLocation {
  if (!key) return LOCAL;
  try {
    const ref = decodeSessionLocator(key);
    return ref ? { kind: "remote", hostId: ref.hostId, sessionId: ref.sessionId } : LOCAL;
  } catch {
    return { kind: "invalid", key };
  }
}

/** 损坏的 key 也不按本机处理：本机专属的能力（worktree、本地文件、本地队列持久化）都不能用在它身上。 */
export function isLocalSession(key: string | null | undefined): boolean {
  return locateSession(key).kind === "local";
}
