import type { BackendProbe, CapabilityLevels, SandboxBackend, SandboxCapability } from "./types.js";

export type BackendSelection =
  | { readonly ok: true; readonly backend: SandboxBackend; readonly version: string; readonly capabilities: CapabilityLevels }
  | { readonly ok: false; readonly reasons: readonly string[] };

/** Ordered by priority; a backend qualifies only when every required capability is `full`. */
export class BackendRegistry {
  readonly #backends: SandboxBackend[] = [];
  readonly #probes = new Map<SandboxBackend, Promise<BackendProbe>>();

  register(backend: SandboxBackend): () => void {
    if (this.#backends.some(item => item.id === backend.id)) throw new Error(`Sandbox backend already registered: ${backend.id}`);
    this.#backends.push(backend);
    this.#backends.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.#backends.splice(this.#backends.indexOf(backend), 1);
      this.#probes.delete(backend);
    };
  }

  async select(required: readonly SandboxCapability[]): Promise<BackendSelection> {
    if (this.#backends.length === 0) return { ok: false, reasons: ["No sandbox backend is registered."] };
    const reasons: string[] = [];
    for (const backend of [...this.#backends]) {
      const probe = await this.#probe(backend);
      if (!probe.available) { reasons.push(`${backend.id}: ${probe.reason}`); continue; }
      const missing = required.filter(capability => probe.capabilities[capability] !== "full");
      if (missing.length) { reasons.push(`${backend.id} ${probe.version}: ${missing.map(capability => `${capability}=${probe.capabilities[capability] ?? "unsupported"}`).join(", ")}`); continue; }
      return { ok: true, backend, version: probe.version, capabilities: probe.capabilities };
    }
    return { ok: false, reasons };
  }

  #probe(backend: SandboxBackend): Promise<BackendProbe> {
    let probe = this.#probes.get(backend);
    if (!probe) {
      probe = backend.probe().catch((error: unknown) => ({ available: false as const, reason: `probe failed: ${error instanceof Error ? error.message : String(error)}` }));
      this.#probes.set(backend, probe);
    }
    return probe;
  }
}
