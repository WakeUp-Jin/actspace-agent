import { describe, expect, it } from "vitest";
import { createRuntimeHostServices, RUNTIME_HOST_SERVICES_ID } from "./host-services.js";

describe("Runtime Host service contract", () => {
  it("snapshots host capabilities and keeps extension services separate from domain services", () => {
    const capabilities = new Set(["filesystem.read", "credential"]);
    const capabilitySet = { ids: ["credential"], has: (id: string) => id === "credential", get: <T>(_id: string) => ({}) as T };
    const descriptor = { hostKind: "cli-run" as const, capabilityCeiling: ["filesystem.read" as const], runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" };
    const services = createRuntimeHostServices({
      descriptor,
      dataRoot: "/tmp/data",
      workspaceRoot: "/tmp/workspace",
      toolEnvironment: { hostCapabilities: capabilities, capabilitySet },
      services: { "host.approval": { ready: true } },
    });

    capabilities.add("network");
    expect([...services.capabilityCeiling]).toEqual(["filesystem.read", "credential"]);
    expect(services.descriptor).toBe(descriptor);
    expect(services.services).toEqual({ "host.approval": { ready: true } });
    expect(RUNTIME_HOST_SERVICES_ID).toBe("actspace.host.services");
  });
});
