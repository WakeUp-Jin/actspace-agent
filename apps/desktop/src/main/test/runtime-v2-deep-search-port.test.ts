import { afterEach, describe, expect, it, vi } from "vitest";
import { DEEP_SEARCH_HOST_PORT_ID } from "@actspace/tool-deep-search";
import type { DesktopRuntimeModelPort } from "../runtime-v2/model-port";
import { createDesktopToolHostServices } from "../runtime-v2/tool-host-services";

afterEach(() => vi.unstubAllGlobals());

function setup(extra: Partial<DesktopRuntimeModelPort>) {
  const modelRuntime: DesktopRuntimeModelPort = {
    resolveMainModel: () => ({ ok: false, message: "not needed" }),
    resolveImageInspectionModel: () => ({ ok: false, message: "not needed" }),
    getToolEnvironment: () => ({ searchCredentials: {} }),
    ...extra,
  };
  return createDesktopToolHostServices({ workspaceRoot: "/fixture", tmpRoot: "/fixture/tmp", modelRuntime, readArtifact: vi.fn() })[DEEP_SEARCH_HOST_PORT_ID];
}
const context = () => ({ signal: new AbortController().signal, reportProgress: () => {} }) as never;
const done = 'data: {"choices":[{"index":0,"delta":{"content":"- fact"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

describe("Desktop deep search Host port", () => {
  it("follows the switch and key on every call", async () => {
    let enabled = false;
    let key: string | undefined = "fixture-ds-old";
    const fetch = vi.fn(async () => new Response(done, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const port = setup({ isDeepseekDeepSearchAvailable: () => enabled && key !== undefined, getDeepseekApiKey: () => key });
    expect(port.available()).toBe(false);
    enabled = true;
    expect(port.available()).toBe(true);
    const ports = await port.createPorts();
    await ports.deep_search!({ question: "q" }, context());
    key = "fixture-ds-new";
    await ports.deep_search!({ question: "q" }, context());
    expect(fetch.mock.calls.map(call => new Headers((call as unknown as [string, RequestInit])[1].headers).get("authorization"))).toEqual(["Bearer fixture-ds-old", "Bearer fixture-ds-new"]);
    key = undefined;
    expect(port.available()).toBe(false);
    expect(await ports.deep_search!({ question: "q" }, context())).toMatchObject({ failure: { code: "DEEP_SEARCH_UNAVAILABLE" } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("is unavailable when the model port lacks the optional members", async () => {
    const port = setup({});
    expect(port.available()).toBe(false);
    expect(await (await port.createPorts()).deep_search!({ question: "q" }, context())).toMatchObject({ failure: { code: "DEEP_SEARCH_UNAVAILABLE" } });
  });
});
