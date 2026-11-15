import { afterEach, describe, expect, it, vi } from "vitest";
import { DEEP_SEARCH_HOST_PORT_ID } from "@actspace/tool-deep-search";
import { createNodeToolHostServices, createUnavailableToolHostServices } from "../node-ports/tool-host-services.js";

afterEach(() => { vi.unstubAllEnvs(); });

function port() {
  return createNodeToolHostServices({ workspaceRoot: "/fixture", tmpRoot: "/fixture/tmp", model: "default", readArtifact: vi.fn() })[DEEP_SEARCH_HOST_PORT_ID];
}

describe("CLI and remote Host deep search port", () => {
  it.each([
    ["1", "fixture-ds", true],
    ["1", "", false],
    ["0", "fixture-ds", false],
    ["", "", false],
  ])("ACTSPACE_DEEPSEEK_DEEP_SEARCH=%j with key %j → available %s", async (flag, key, expected) => {
    vi.stubEnv("ACTSPACE_DEEPSEEK_DEEP_SEARCH", flag);
    vi.stubEnv("DEEPSEEK_API_KEY", key);
    const host = port();
    expect(host.available()).toBe(expected);
    if (!expected) expect(await (await host.createPorts()).deep_search!({ question: "q" }, { signal: new AbortController().signal, reportProgress: () => {} } as never)).toMatchObject({ failure: { code: "DEEP_SEARCH_UNAVAILABLE" } });
  });

  it("is not provided by the unavailable tool services", () => {
    expect(createUnavailableToolHostServices()).not.toHaveProperty(DEEP_SEARCH_HOST_PORT_ID);
  });
});
