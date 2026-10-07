import { afterEach, describe, expect, it, vi } from "vitest";
import { WEB_TOOLS_HOST_PORT_ID } from "@actspace/tools-web-tools";
import type { DesktopRuntimeV2ModelPort } from "../runtime-v2/model-port";
import { createDesktopToolHostServices } from "../runtime-v2/tool-host-services";

afterEach(() => vi.unstubAllGlobals());

describe("Desktop search credentials on a live tool port", () => {
  it("uses current credentials after disconnect, reconnect and key rotation", async () => {
    let searchCredentials: ReturnType<DesktopRuntimeV2ModelPort["getToolEnvironment"]>["searchCredentials"] = { zhipu: "test-old", tavily: "test-tavily" };
    const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => new Response(JSON.stringify(String(url).includes("bigmodel")
      ? { search_result: [{ title: "Domestic", link: "https://example.com/domestic", content: "result" }] }
      : { results: [{ title: "International", url: "https://example.com/international", content: "result" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const modelRuntime: DesktopRuntimeV2ModelPort = {
      resolveMainModel: () => ({ ok: false, message: "not needed" }),
      resolveImageInspectionModel: () => ({ ok: false, message: "not needed" }),
      getToolEnvironment: () => ({ searchCredentials }),
    };
    const services = createDesktopToolHostServices({ workspaceRoot: "/fixture", tmpRoot: "/fixture/tmp", modelRuntime, readArtifact: vi.fn() });
    const ports = services[WEB_TOOLS_HOST_PORT_ID].createPorts();
    const context = { signal: new AbortController().signal } as Parameters<NonNullable<typeof ports.web_search>>[1];
    try {
      await ports.web_search!({ query: "fixture" }, context);
      expect(fetch.mock.calls.some(([url]) => String(url).includes("bigmodel"))).toBe(true);
      searchCredentials = { tavily: "test-tavily" };
      fetch.mockClear();
      await ports.web!({ action: "search", query: "fixture" }, context);
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(["https://api.tavily.com/search"]);
      searchCredentials = { zhipu: "test-new" };
      fetch.mockClear();
      await ports.web_search!({ query: "fixture" }, context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Bearer test-new" });
      searchCredentials = {};
      fetch.mockClear();
      await ports.web_search!({ query: "fixture" }, context);
      expect(fetch).not.toHaveBeenCalled();
    } finally { await ports.dispose(); }
  });
});
