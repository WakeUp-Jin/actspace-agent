import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_HOST_PORT_ID } from "@actspace/tool-document";
import type { DesktopRuntimeModelPort } from "../runtime-v2/model-port";
import { createDesktopToolHostServices } from "../runtime-v2/tool-host-services";
import { DESKTOP_TRUSTED_GRANT_AUDIENCES } from "../runtime-v2/trusted-grant-audiences";

afterEach(() => vi.unstubAllGlobals());

const root = realpathSync(mkdtempSync(join(tmpdir(), "desktop-doc-")));
writeFileSync(join(root, "a.pdf"), "%PDF-1.7\nplaceholder\n");
writeFileSync(join(root, "b.pdf"), "%PDF-1.7\nother placeholder\n");

function setup(extra: Partial<DesktopRuntimeModelPort>) {
  const modelRuntime: DesktopRuntimeModelPort = {
    resolveMainModel: () => ({ ok: false, message: "not needed" }),
    resolveImageInspectionModel: () => ({ ok: false, message: "not needed" }),
    getToolEnvironment: () => ({ searchCredentials: {} }),
    ...extra,
  };
  return createDesktopToolHostServices({ workspaceRoot: root, tmpRoot: join(root, "tmp"), modelRuntime, readArtifact: vi.fn() })[DOCUMENT_HOST_PORT_ID];
}
const context = () => ({ sessionId: "s1", workspaceRoot: root, signal: new AbortController().signal, reportProgress: () => {} }) as never;
const ocr = () => new Response(JSON.stringify({ pages: [{ index: 0, text: "x", finish_reason: "stop" }] }), { status: 200, headers: { "content-type": "application/json" } });

describe("Desktop document Host port", () => {
  it("follows the switch and key on every call", async () => {
    let enabled = false;
    let key: string | undefined = "fixture-ds-old";
    const fetch = vi.fn(async () => ocr());
    vi.stubGlobal("fetch", fetch);
    const port = setup({ isDeepseekDocumentAvailable: () => enabled && key !== undefined, getDeepseekApiKey: () => key });
    expect(port.available()).toBe(false);
    enabled = true;
    expect(port.available()).toBe(true);
    const ports = await port.createPorts();
    expect(await ports.read_document!({ path: "a.pdf" }, context())).toMatchObject({ status: "completed" });
    key = "fixture-ds-new";
    expect(await ports.read_document!({ path: "b.pdf" }, context())).toMatchObject({ status: "completed" });
    expect(fetch.mock.calls.map(call => new Headers((call as unknown as [string, RequestInit])[1].headers).get("authorization"))).toEqual(["Bearer fixture-ds-old", "Bearer fixture-ds-new"]);
    key = undefined;
    expect(port.available()).toBe(false);
    expect(await ports.read_document!({ path: "a.pdf" }, context())).toMatchObject({ failure: { code: "DOCUMENT_UNAVAILABLE" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    await ports.dispose?.();
  });

  it("is unavailable when the model port lacks the optional members", async () => {
    const port = setup({});
    expect(port.available()).toBe(false);
    expect(await (await port.createPorts()).read_document!({ path: "a.pdf" }, context())).toMatchObject({ failure: { code: "DOCUMENT_UNAVAILABLE" } });
  });

  it("trusts the four existing grant audiences plus the document one", () => {
    expect([...DESKTOP_TRUSTED_GRANT_AUDIENCES].sort()).toEqual([
      "actspace.document\u0000document-read\u00001",
      "actspace.filesystem-read\u0000filesystem-read\u00001",
      "actspace.filesystem-search\u0000filesystem-search\u00001",
      "actspace.filesystem-write\u0000filesystem-write\u00001",
      "actspace.shell-tools\u0000bash\u00001",
    ]);
  });
});
