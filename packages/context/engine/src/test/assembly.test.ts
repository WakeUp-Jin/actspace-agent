import { describe, expect, it } from "vitest";
import { ContextAssembler } from "../assembly.js";

describe("ContextAssembler", () => {
  it("orders contributions and drops optional failures", async () => {
    const assembler = new ContextAssembler();
    assembler.register({ id: "b", ownerPluginId: "test", order: 20, criticality: "required", resolve: () => "b" });
    assembler.register({ id: "optional", ownerPluginId: "test", order: 10, criticality: "optional", resolve: () => { throw new Error("ignored"); } });
    assembler.register({ id: "a", ownerPluginId: "test", order: 0, criticality: "required", resolve: () => "a" });
    await expect(assembler.assemble({ sessionId: "s", turnId: "t", stepId: "p", surface: [], hostFacts: {} })).resolves.toEqual({
      values: ["a", "b"],
      provenance: [
        { contributorId: "a", ownerPluginId: "test", order: 0 },
        { contributorId: "optional", ownerPluginId: "test", skipped: true },
        { contributorId: "b", ownerPluginId: "test", order: 20 },
      ],
    });
  });
});
