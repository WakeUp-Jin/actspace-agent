import { DEFAULT_EXECUTION_TIMING, INHERITED_EVALUATION, startExecution, type ExecutionTiming } from "./execution.js";
import { sandboxTemplate, templateCapabilities } from "./policy.js";
import { BackendRegistry } from "./select.js";
import type { SandboxHostPort, SandboxPurpose, SandboxService } from "./types.js";

/**
 * Inherited mode is opened only by the Host port (an explicit launch flag, never environment variables or
 * plugin config): the process already runs inside an outer sandbox, such as an evaluation candidate.
 */
export function createSandboxService(options: { readonly host: SandboxHostPort; readonly timing?: ExecutionTiming }): SandboxService {
  const mode = options.host.inherited === true ? "inherited" : "sandboxed";
  const registry = new BackendRegistry();
  const template = (purpose: SandboxPurpose) => sandboxTemplate(purpose, { homeDir: options.host.homeDir, platform: options.host.platform });
  return Object.freeze({
    register: backend => registry.register(backend),
    status: async (purpose = "tool") => {
      if (mode === "inherited") return purpose === "evaluation" ? { available: false, isolation: "inherited", reasons: [INHERITED_EVALUATION] } : { available: true, isolation: "inherited", reasons: [] };
      const selected = template(purpose);
      if (!selected) return { available: false, isolation: "sandboxed", reasons: [`No sandbox template for purpose "${purpose}".`] };
      const selection = await registry.select(templateCapabilities(selected));
      return selection.ok
        ? { available: true, isolation: "sandboxed", backend: { id: selection.backend.id, version: selection.version }, reasons: [] }
        : { available: false, isolation: "sandboxed", reasons: selection.reasons };
    },
    run: request => startExecution({ request, mode, host: options.host, registry, template: template(request.purpose), timing: options.timing ?? DEFAULT_EXECUTION_TIMING }),
  } satisfies SandboxService);
}
