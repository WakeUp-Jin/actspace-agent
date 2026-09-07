import type { ApprovalBroker } from "./approval-port.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("tools.approval", Object.freeze({} as { readonly ApprovalBroker?: ApprovalBroker }));
}

export function activate() {
  return { services: { "tools.approval": Object.freeze({} as { readonly ApprovalBroker?: ApprovalBroker }) }, dispose: () => undefined };
}
