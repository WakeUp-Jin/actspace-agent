import {
  freezeRuntimeV2Json,
  isRuntimeV2JsonValue,
  narrowRuntimeV2CapabilityCeiling,
  type RuntimeV2HostDescriptor,
} from "../index";

describe("runtime-v2 Host DTO boundaries", () => {
  it("accepts JSON-safe values and rejects executable or host-owned values", () => {
    expect(
      isRuntimeV2JsonValue({
        host: "desktop",
        capabilities: ["filesystem.read", "approval"],
        details: { count: 2, enabled: true, empty: null },
      }),
    ).toBe(true);
    expect(isRuntimeV2JsonValue(new Date())).toBe(false);
    expect(isRuntimeV2JsonValue(() => undefined)).toBe(false);
    expect(isRuntimeV2JsonValue(Number.NaN)).toBe(false);
    expect(isRuntimeV2JsonValue(Symbol("runtime"))).toBe(false);
  });

  it("round-trips every host kind without runtime objects", () => {
    const descriptors = (["desktop", "cli-run"] as const).map(
      (hostKind, index) =>
        ({
          hostKind,
          capabilityCeiling: ["filesystem.read", "network"],
          runtimeContract: "actspace-runtime-v2",
          invocationId: `invocation-${index + 1}`,
          workspaceRef: "workspace-1",
        }) satisfies RuntimeV2HostDescriptor,
    );

    const frozen = freezeRuntimeV2Json(descriptors);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen[0]?.capabilityCeiling)).toBe(true);
    expect(JSON.parse(JSON.stringify(frozen))).toEqual(descriptors);
    expect(() => freezeRuntimeV2Json(new Date())).toThrow(TypeError);
  });

  it("allows a capability ceiling to stay equal or become narrower", () => {
    const current = ["filesystem.read", "network", "approval"] as const;

    expect(narrowRuntimeV2CapabilityCeiling(current, current)).toEqual(current);
    expect(
      narrowRuntimeV2CapabilityCeiling(current, ["filesystem.read", "approval"]),
    ).toEqual(["filesystem.read", "approval"]);
    expect(() =>
      narrowRuntimeV2CapabilityCeiling(current, ["filesystem.write"]),
    ).toThrow("cannot add filesystem.write");
  });

  it("keeps diagnostic details scalar and serializable", () => {
    const diagnostic = {
      code: "HOST_CAPABILITY_MISMATCH" as const,
      severity: "warning" as const,
      message: "Browser capability is unavailable.",
      origin: "test",
      details: { capability: "browser", required: true, retryable: false },
    };

    expect(isRuntimeV2JsonValue(diagnostic.details)).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain("Authorization");
    expect(JSON.stringify(diagnostic)).not.toContain("apiKey");
  });
});
