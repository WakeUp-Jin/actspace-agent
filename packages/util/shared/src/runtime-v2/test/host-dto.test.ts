import {
  freezeRuntimeJson,
  isRuntimeJsonValue,
  narrowRuntimeCapabilityCeiling,
  type RuntimeHostDescriptor,
} from "../index";

describe("runtime-v2 Host DTO boundaries", () => {
  it("accepts JSON-safe values and rejects executable or host-owned values", () => {
    expect(
      isRuntimeJsonValue({
        host: "desktop",
        capabilities: ["filesystem.read", "approval"],
        details: { count: 2, enabled: true, empty: null },
      }),
    ).toBe(true);
    expect(isRuntimeJsonValue(new Date())).toBe(false);
    expect(isRuntimeJsonValue(() => undefined)).toBe(false);
    expect(isRuntimeJsonValue(Number.NaN)).toBe(false);
    expect(isRuntimeJsonValue(Symbol("runtime"))).toBe(false);
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
        }) satisfies RuntimeHostDescriptor,
    );

    const frozen = freezeRuntimeJson(descriptors);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen[0]?.capabilityCeiling)).toBe(true);
    expect(JSON.parse(JSON.stringify(frozen))).toEqual(descriptors);
    expect(() => freezeRuntimeJson(new Date())).toThrow(TypeError);
  });

  it("allows a capability ceiling to stay equal or become narrower", () => {
    const current = ["filesystem.read", "network", "approval"] as const;

    expect(narrowRuntimeCapabilityCeiling(current, current)).toEqual(current);
    expect(
      narrowRuntimeCapabilityCeiling(current, ["filesystem.read", "approval"]),
    ).toEqual(["filesystem.read", "approval"]);
    expect(() =>
      narrowRuntimeCapabilityCeiling(current, ["filesystem.write"]),
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

    expect(isRuntimeJsonValue(diagnostic.details)).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain("Authorization");
    expect(JSON.stringify(diagnostic)).not.toContain("apiKey");
  });
});
