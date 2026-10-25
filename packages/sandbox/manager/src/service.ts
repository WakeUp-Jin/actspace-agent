import { DEFAULT_EXECUTION_TIMING, startExecution, type ExecutionTiming } from "./execution.js";
import { sandboxTemplate, templateCapabilities } from "./policy.js";
import { BackendRegistry } from "./select.js";
import type { SandboxHostPort, SandboxManagerConfig, SandboxPurpose, SandboxService } from "./types.js";

/** Inherited mode is opened only by explicit config (never by environment variables): the process already runs inside an outer sandbox. */
export function createSandboxService(options: { readonly host: SandboxHostPort; readonly config?: SandboxManagerConfig; readonly timing?: ExecutionTiming }): SandboxService {
  const mode = options.config?.mode ?? "sandboxed";
  if (mode !== "sandboxed" && mode !== "inherited") throw new Error(`Invalid sandbox mode: ${String(mode)}`);
  const registry = new BackendRegistry();
  const template = (purpose: SandboxPurpose) => sandboxTemplate(purpose, { homeDir: options.host.homeDir, platform: options.host.platform });
  return Object.freeze({
    register: backend => registry.register(backend),
    status: async (purpose = "tool") => {
      if (mode === "inherited") return { available: true, isolation: "inherited", reasons: [] };
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
