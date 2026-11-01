import type { ApprovalRequest } from "../runtime-v2/permission";
import type { HostHello } from "./index";
/** `host.observe` snapshot: the session-list channel. Per-session detail stays on `sessions.observe`. */
export type HostObserveSnapshot = { readonly approvals: readonly ApprovalRequest[]; readonly state: HostHello["state"]; readonly running: readonly string[] };
/** Published on the host topic only when a Session gains or loses its running Run. */
export type HostActivityEvent = { readonly kind: "activity"; readonly sessionId: string; readonly running: boolean };
