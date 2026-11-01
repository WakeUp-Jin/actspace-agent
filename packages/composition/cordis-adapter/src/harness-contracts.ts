/** Contract versions describe semantics, including parameters/results, not package releases. */
export type HarnessEventMode = "emit" | "waterfall" | "parallel" | "serial" | "bail";
export interface HarnessContract {
  readonly id: string;
  readonly version: number;
  readonly mode?: HarnessEventMode;
  readonly optional?: boolean;
  readonly fallback?: string;
}
export interface HarnessBehaviorContracts {
  readonly services: { readonly provides: readonly HarnessContract[]; readonly requires: readonly HarnessContract[] };
  readonly events: { readonly provides: readonly HarnessContract[]; readonly requires: readonly HarnessContract[] };
  /** A pure ESM entry exporting validate(config), loaded before behavior. */
  readonly configValidator?: string;
}
export function validateHarnessContracts(value: HarnessBehaviorContracts): void {
  for (const kind of ["services", "events"] as const) for (const direction of ["provides", "requires"] as const) {
    const seen = new Set<string>();
    if (!Array.isArray(value[kind]?.[direction])) throw new Error(`Missing ${kind}/${direction} contracts`);
    for (const contract of value[kind][direction]) {
      if (!contract.id || !Number.isSafeInteger(contract.version) || contract.version < 1 || seen.has(contract.id)) throw new Error(`Invalid ${kind} contract ${contract.id}`);
      seen.add(contract.id);
      if (kind === "events" && !["emit", "waterfall", "parallel", "serial", "bail"].includes(contract.mode ?? "")) throw new Error(`Invalid event mode ${contract.id}`);
      if (kind === "services" && contract.mode !== undefined) throw new Error(`Service cannot declare event mode ${contract.id}`);
      if (contract.optional && (direction !== "requires" || !contract.fallback?.trim())) throw new Error(`Optional contract requires fallback ${contract.id}`);
    }
  }
  if (value.configValidator !== undefined && (!value.configValidator.startsWith("./") || value.configValidator.split("/").includes("..") || !/\.(mjs|js)$/.test(value.configValidator))) throw new Error("Invalid config validator entry");
}
