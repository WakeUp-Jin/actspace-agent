import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_HOST_PORT_ID } from "@actspace/tool-document";
import { createNodeToolHostServices, createUnavailableToolHostServices } from "../node-ports/tool-host-services.js";

afterEach(() => { vi.unstubAllEnvs(); });

function port() {
  return createNodeToolHostServices({ workspaceRoot: "/fixture", tmpRoot: "/fixture/tmp", model: "default", readArtifact: vi.fn() })[DOCUMENT_HOST_PORT_ID];
}

describe("CLI and remote Host document port", () => {
  it.each([
    ["1", "fixture-ds", true],
    ["1", "", false],
    ["0", "fixture-ds", false],
    ["", "", false],
  ])("ACTSPACE_DEEPSEEK_DOCUMENT=%j with key %j → available %s", async (flag, key, expected) => {
    vi.stubEnv("ACTSPACE_DEEPSEEK_DOCUMENT", flag);
    vi.stubEnv("DEEPSEEK_API_KEY", key);
    const host = port();
    expect(host.available()).toBe(expected);
    if (!expected) expect(await (await host.createPorts()).read_document!({ path: "a.pdf" }, { signal: new AbortController().signal, reportProgress: () => {} } as never)).toMatchObject({ failure: { code: "DOCUMENT_UNAVAILABLE" } });
  });

  it("is not provided by the unavailable tool services", () => {
    expect(createUnavailableToolHostServices()).not.toHaveProperty(DOCUMENT_HOST_PORT_ID);
  });
});
