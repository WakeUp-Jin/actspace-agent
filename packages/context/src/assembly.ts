import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { Service } from "@actspace/cordis-adapter";
import type { CordisServiceContext } from "@actspace/cordis-adapter";

export type ContextContribution = {
  readonly id: string;
  readonly ownerPluginId: string;
  readonly order: number;
  readonly criticality: "required" | "optional";
  readonly resolve: (input: ContextAssemblyInput) => RuntimeV2JsonValue | Promise<RuntimeV2JsonValue>;
};

export type ContextAssemblyInput = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly surface: readonly RuntimeV2JsonValue[];
  readonly hostFacts: RuntimeV2JsonValue;
};

export type ContextAssemblyResult = {
  readonly values: readonly RuntimeV2JsonValue[];
  readonly provenance: readonly RuntimeV2JsonValue[];
};

export class ContextAssembler {
  readonly #contributors: ContextContribution[] = [];

  register(contribution: ContextContribution): () => void {
    if (this.#contributors.some((candidate) => candidate.id === contribution.id)) {
      throw new Error(`Context contribution ${contribution.id} is already registered.`);
    }
    this.#contributors.push(contribution);
    this.#contributors.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    return () => {
      const index = this.#contributors.indexOf(contribution);
      if (index >= 0) this.#contributors.splice(index, 1);
    };
  }

  async assemble(input: ContextAssemblyInput): Promise<ContextAssemblyResult> {
    const values: RuntimeV2JsonValue[] = [];
    const provenance: RuntimeV2JsonValue[] = [];
    for (const contribution of this.#contributors) {
      try {
        values.push(await contribution.resolve(input));
        provenance.push({ contributorId: contribution.id, ownerPluginId: contribution.ownerPluginId, order: contribution.order });
      } catch (error) {
        if (contribution.criticality === "required") throw new Error(`Required context contribution ${contribution.id} failed.`, { cause: error });
        provenance.push({ contributorId: contribution.id, ownerPluginId: contribution.ownerPluginId, skipped: true });
      }
    }
    return Object.freeze({ values: Object.freeze(values), provenance: Object.freeze(provenance) });
  }
}

/** Cordis owner for context contributor registrations and assembly lifecycle. */
export class ContextAssemblerService extends Service {
  readonly assembler: ContextAssembler;

  constructor(ctx: CordisServiceContext) {
    super(ctx, "context.assembly");
    this.assembler = new ContextAssembler();
    ctx.effect(() => () => undefined, "context.assembly");
  }

  register(contribution: ContextContribution): () => void { return this.assembler.register(contribution); }
  assemble(input: ContextAssemblyInput): Promise<ContextAssemblyResult> { return this.assembler.assemble(input); }
}
