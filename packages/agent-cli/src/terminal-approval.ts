import {
  createApprovalGateForPermissionMode,
  type RuntimeApprovalBroker,
  type ToolApprovalDecision,
  type ToolApprovalDecisionKind,
  type ToolApprovalRequest,
} from "@actspace/agent-core";
import type { TerminalLineInput } from "./terminal-input";
import type { PermissionMode } from "./types";

type PendingApproval = {
  request: ToolApprovalRequest;
  sessionId: string;
  turnId: string;
  resolve: (decision: ToolApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class TerminalApprovalBroker implements RuntimeApprovalBroker {
  private readonly automaticGate;
  private readonly pending = new Map<string, PendingApproval>();
  private sessionId = "";
  private turnId = "";
  private disposed = false;
  private askQueue = Promise.resolve();
  private activeRequestId: string | undefined;

  constructor(
    mode: PermissionMode,
    workspaceRoot: string,
    private readonly input: TerminalLineInput,
    private readonly write: (text: string) => void,
    private readonly timeoutMs = 5 * 60 * 1000,
  ) {
    this.automaticGate = createApprovalGateForPermissionMode(mode, workspaceRoot);
  }

  setCurrentTurn(sessionId: string, turnId: string): void {
    this.sessionId = sessionId;
    this.turnId = turnId;
  }

  waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    if (this.automaticGate) return this.automaticGate.waitForDecision(request);
    if (this.disposed) return Promise.resolve(decisionFor(request, "abort"));
    return new Promise((resolve) => {
      const entry: PendingApproval = {
        request,
        sessionId: request.sessionId ?? this.sessionId,
        turnId: request.turnId ?? this.turnId,
        resolve,
        timer: setTimeout(() => this.resolve(request.id, "timeout"), this.timeoutMs),
      };
      this.pending.set(request.id, entry);
      this.askQueue = this.askQueue.then(() => this.ask(entry)).catch(() => {
        this.resolve(request.id, "abort");
      });
    });
  }

  abortTurn(sessionId: string, turnId: string): number {
    let count = 0;
    for (const [requestId, entry] of this.pending) {
      if (entry.sessionId !== sessionId || entry.turnId !== turnId) continue;
      this.resolve(requestId, "abort");
      count += 1;
    }
    if (count > 0) this.input.cancelCurrent();
    return count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const requestId of [...this.pending.keys()]) this.resolve(requestId, "abort");
    this.input.cancelCurrent();
  }

  private async ask(entry: PendingApproval): Promise<void> {
    const request = entry.request;
    if (!this.pending.has(request.id)) return;
    this.activeRequestId = request.id;
    this.write([
      "\nApproval required",
      `Tool: ${request.toolName}`,
      `Summary: ${request.summary}`,
      `Reason: ${request.reason}`,
      request.riskLevel ? `Risk: ${request.riskLevel}` : "",
      request.executionEnvironment ? `Environment: ${request.executionEnvironment}` : "",
      typeof request.args.command === "string" ? `Command: ${request.args.command}` : "",
    ].filter(Boolean).join("\n") + "\n");
    const allowSimilar = request.toolName !== "delete_file";
    const prompt = allowSimilar
      ? "Approve? [y] once / [a] similar / [n] deny: "
      : "Approve? [y] once / [n] deny: ";

    try {
      while (this.pending.has(request.id)) {
        const answer = await this.input.readLine(prompt);
        if (!this.pending.has(request.id)) return;
        const decision = parseDecision(answer, allowSimilar);
        if (decision) {
          this.resolve(request.id, decision);
          return;
        }
        this.write("Please enter y, a, or n.\n");
      }
    } finally {
      if (this.activeRequestId === request.id) this.activeRequestId = undefined;
    }
  }

  private resolve(requestId: string, decision: ToolApprovalDecisionKind): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(decisionFor(entry.request, decision));
    if (this.activeRequestId === requestId && decision !== "approve_once" && decision !== "allow_similar" && decision !== "deny") {
      this.input.cancelCurrent();
    }
  }
}

function parseDecision(answer: string | null, allowSimilar: boolean): ToolApprovalDecisionKind | null {
  if (answer === null) return "abort";
  switch (answer.trim().toLowerCase()) {
    case "y":
    case "yes":
      return "approve_once";
    case "a":
    case "always":
      return allowSimilar ? "allow_similar" : null;
    case "n":
    case "no":
      return "deny";
    default:
      return null;
  }
}

function decisionFor(
  request: ToolApprovalRequest,
  decision: ToolApprovalDecisionKind,
): ToolApprovalDecision {
  return { requestId: request.id, decision, decidedAt: Date.now() };
}
