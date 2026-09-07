import { createHash } from "node:crypto";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { ContributorRegistry } from "./registry.js";
import type { AssemblyInput, PromptContributor } from "./contributor.js";
import { freezeRequest, type LogicalRequestCandidate, type LogicalRequestSnapshot, type PreparedRequestMetadata } from "./request-snapshot.js";

export type RequestAssemblerOptions = {
  readonly registry?: ContributorRegistry;
  readonly prepare: (candidate: LogicalRequestCandidate) => PreparedRequestMetadata | Promise<PreparedRequestMetadata>;
};

export class RequestAssembler {
  readonly #registry: ContributorRegistry;
  constructor(private readonly options: RequestAssemblerOptions) { this.#registry = options.registry ?? new ContributorRegistry(); }

  async assemble(input: AssemblyInput, tools: readonly RuntimeV2JsonValue[], requestOptions: RuntimeV2JsonValue, compositionDigest: string, hostCapabilityDigest: string): Promise<LogicalRequestSnapshot> {
    const candidate = await this.assembleCandidate(input, tools, requestOptions);
    const prepared = await this.options.prepare(candidate);
    return this.finalize(candidate, prepared, compositionDigest, hostCapabilityDigest);
  }

  async assembleCandidate(input: AssemblyInput, tools: readonly RuntimeV2JsonValue[], requestOptions: RuntimeV2JsonValue): Promise<LogicalRequestCandidate> {
    input.scope.assertActive();
    const outputs: Array<{ readonly contributor: PromptContributor; readonly output?: RuntimeV2JsonValue; readonly provenance: RuntimeV2JsonValue }> = [];
    for (const contributor of this.#registry.visible(input.scope)) {
      try {
        const resolved = await contributor.resolve(input);
        const output = freezeRequest(resolved.value);
        const provenance = freezeRequest(resolved.provenance ?? { contributorId: contributor.id, ownerPluginId: contributor.ownerPluginId, layer: contributor.layer, order: contributor.order });
        outputs.push({ contributor, output, provenance });
      } catch (error) {
        if (contributor.criticality === "required") throw new Error(`Required contributor ${contributor.id} failed.`, { cause: error });
        outputs.push({ contributor, provenance: { contributorId: contributor.id, ownerPluginId: contributor.ownerPluginId, skipped: true, reason: "resolve-failed" } });
      }
    }
    const systemSections = outputs.flatMap((item) => item.contributor.kind === "prompt-section" && item.output !== undefined ? [item.output] : []);
    const facts = [{ host: input.hostFacts }, ...outputs.flatMap((item) => item.contributor.kind === "request-fact" && item.output !== undefined ? [item.output] : [])];
    return freezeRequest({
      sessionId: input.sessionId,
      turnId: input.turnId,
      stepId: input.stepId,
      messages: input.surface,
      systemSections,
      facts,
      renderedSystemPrompt: renderSystemPrompt(systemSections, facts),
      tools,
      contributorProvenance: outputs.map((item) => item.provenance),
      requestOptions,
    }) as LogicalRequestCandidate;
  }

  finalize(candidate: LogicalRequestCandidate, prepared: PreparedRequestMetadata, compositionDigest: string, hostCapabilityDigest: string): LogicalRequestSnapshot {
    return freezeRequest({ ...candidate, schemaVersion: 1, compositionDigest, hostCapabilityDigest, prepared }) as LogicalRequestSnapshot;
  }
}

export function renderSystemPrompt(systemSections: readonly RuntimeV2JsonValue[], facts: readonly RuntimeV2JsonValue[]): string {
  const sections = systemSections.map(renderSection).filter((section) => section.length > 0);
  if (facts.length > 0) sections.push(`<runtime_facts>\n${JSON.stringify(facts)}\n</runtime_facts>`);
  return sections.join("\n\n");
}

function renderSection(value: RuntimeV2JsonValue): string {
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

export function digestJson(value: RuntimeV2JsonValue): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
