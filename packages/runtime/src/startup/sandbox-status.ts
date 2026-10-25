import type { SandboxStatus } from "@actspace/sandbox/types";
import type { DiagnosticInput } from "../projection/diagnostics.js";

/** One startup line for the tool sandbox; anything short of a sandboxed backend is a warning. */
export function sandboxStatusDiagnostic(status: SandboxStatus | undefined): DiagnosticInput {
  const base = { source: "host", code: "SANDBOX_STATUS" } as const;
  if (!status) return { ...base, severity: "warning", message: "Tool sandbox plugin is not loaded; Bash requires approval.", details: { available: false } };
  if (status.isolation === "inherited") return { ...base, severity: "warning", message: "Tool sandbox is inherited (--sandbox-inherited); commands rely on the outer sandbox.", details: { available: true, isolation: "inherited" } };
  if (status.available && status.backend) return { ...base, severity: "info", message: `Tool sandbox: ${status.backend.id} ${status.backend.version}.`, details: { available: true, isolation: "sandboxed", backend: status.backend } };
  return { ...base, severity: "warning", message: `Tool sandbox unavailable; Bash requires approval. ${status.reasons.join(" ")}`.trim(), details: { available: false, isolation: "sandboxed", reasons: [...status.reasons] } };
}
