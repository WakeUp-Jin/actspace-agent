import { createHash, randomUUID } from "node:crypto";
import type { AuthorizationDecision, HarnessAuthorizer } from "@actspace/harness-control";
import type { EvolutionAuthorization } from "@actspace/plugin-manager";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
import type { AgentRuntimeHostPort } from "./agent-host-port.js";
import type { RuntimeSessionController } from "../session/session-controller.js";

/** Only receipts issued by the Host approval broker can authorize an evolution selection. */
export class EvolutionApproval {
  readonly #receipts = new WeakMap<object, AuthorizationDecision>();
  constructor(private readonly host: AgentRuntimeHostPort, private readonly sessions: RuntimeSessionController) {}
  readonly authorize: HarnessAuthorizer = async (request, context) => {
    if (context && typeof context === "object" && this.#receipts.has(context)) {
      const receipt = this.#receipts.get(context)!;
      this.#receipts.delete(context);
      return receipt;
    }
    return await this.host.authorizeHarness?.(request, context) ?? null;
  };
  async request(input: EvolutionAuthorization, context: ToolExecutionContext): Promise<object> {
    context.signal.throwIfAborted();
    const requestApproval = context.requestApproval ?? this.host.toolEnvironment.approvalBroker?.requestApproval.bind(this.host.toolEnvironment.approvalBroker);
    if (!requestApproval) throw new Error("Harness changes require a Host approval broker");
    const requestId = randomUUID();
    const expiresAt = Date.now() + (this.host.toolEnvironment.approvalTimeoutMs ?? 600000);
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const request: ApprovalRequest = { schemaVersion: 1, requestId, callId: context.callId, sessionId: context.sessionId, agentRunId: context.agentRunId, agentId: `main:${context.sessionId}`, pluginId: "actspace.plugin-manager", toolName: "plugin_manager", definitionDigest: "evolution-v1", normalizedArgsDigest: digest,
      reasons: [{ code: "HARNESS_EVOLUTION", message: `${input.phase === "initialize" ? "加载并初始化候选插件（同进程可信代码）" : "为当前会话的后续消息启用新 Harness"}：${input.purpose}\n版本：${input.candidate?.executionDigest ?? input.artifactId ?? input.executionDigest ?? "historical selection"}`, risk: "high" }], resources: [], grantSuggestions: [], supportedLifetimes: ["once"], requestedAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString() };
    const session = this.sessions.getOpen(context.sessionId);
    if (!session) throw new Error("Evolution requires an active session");
    const append = async (type: string, data: unknown) => { await session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: JSON.parse(JSON.stringify(data)), surface: null } as never); await session.flush(); };
    await append("permission/asked", request);
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(Math.max(1, expiresAt - Date.now()))]);
    const decision = await requestApproval(request, signal).catch(async error => {
      await append("permission/decided", { requestId, kind: "deny", code: signal.aborted ? "aborted" : "broker-unavailable", decidedAt: new Date().toISOString() });
      throw error;
    });
    const valid = !signal.aborted && decision.requestId === requestId && decision.kind === "once" && Number.isFinite(Date.parse(decision.decidedAt)) && Date.parse(decision.decidedAt) <= expiresAt && Date.now() < expiresAt;
    await append("permission/decided", valid ? decision : { requestId, kind: "deny", decidedAt: new Date().toISOString(), code: "invalid-decision" });
    if (!valid) throw new Error("Host denied or expired Harness authorization");
    const token = Object.freeze({});
    if (input.candidate) this.#receipts.set(token, { ...input.candidate, actor: "Host/user", decisionId: requestId, expiresAt });
    return token;
  }
}
