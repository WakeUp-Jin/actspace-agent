// @vitest-environment node
import { expect, it, vi } from "vitest";
import { EMPTY_LLM_USAGE, type LlmService } from "@actspace/llm-service";
import { IMAGE_INSPECTION_HOST_PORT_ID } from "@actspace/tools-image-inspection";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import { IMAGE_INSPECTION_CREDENTIAL_REF } from "../runtime-v2/credential-resolver";
import type { DesktopRuntimeV2ModelPort } from "../runtime-v2/model-port";
import { createDesktopToolHostServices } from "../runtime-v2/tool-host-services";

function fixture(initialModel?: string) {
  let model = initialModel;
  let phase = "create-ports";
  const resolutions: { phase: string; model: string | null }[] = [];
  const modelRuntime: DesktopRuntimeV2ModelPort = {
    resolveMainModel: () => ({ ok: false, message: "must not use the chat model" }),
    resolveImageInspectionModel: () => {
      resolutions.push({ phase, model: model ?? null });
      return model === undefined ? { ok: false, message: "not configured" } : {
        ok: true,
        model: { key: model, definition: { api: "openai-completions", provider: "fixture", apiModel: model, contextWindow: 64000 }, providerRuntime: {} },
      };
    },
    getToolEnvironment: () => ({ searchCredentials: {} }),
  };
  const readArtifact = vi.fn(async (_sessionId: string, _artifactId: string) => ({ bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), mediaType: "image/png" }));
  const finish = vi.fn(async () => {});
  const start = vi.fn(async () => ({ finish }));
  const release = vi.fn();
  let requestSerial = 0;
  const prepare = vi.fn((input: Parameters<LlmService["prepare"]>[0]) => ({
    request: { requestId: `request-${++requestSerial}`, routeId: input.routeId, model: input.model },
    release,
    dispatch: async function* () {
      yield { type: "done", content: [{ type: "text", text: "A small PNG." }], stopReason: "stop", usage: EMPTY_LLM_USAGE };
    },
  }));
  const services = createDesktopToolHostServices({ workspaceRoot: "/fixture", tmpRoot: "/fixture/tmp", modelRuntime, readArtifact });
  const ports = services[IMAGE_INSPECTION_HOST_PORT_ID].createPorts({ prepare } as unknown as LlmService, { start });
  const run = (label: string, sessionId = "same-session") => {
    phase = label;
    const context = { sessionId, agentRunId: "run", turnId: "turn", stepId: "step", callId: label, signal: new AbortController().signal } as ToolExecutionContext;
    return ports.inspect_image!({ artifact_id: "owned-image", question: "What is visible?" }, context);
  };
  return { run, setModel: (value?: string) => { model = value; }, resolutions, readArtifact, prepare, start, finish, release };
}

it("activates the first vision configuration without recreating the tool port or session", async () => {
  const f = fixture();
  expect(await f.run("unconfigured")).toMatchObject({ failure: { code: "IMAGE_INSPECTION_NOT_CONFIGURED" } });
  expect(f.readArtifact).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  f.setModel("vision-first");
  expect(await f.run("after-save"), JSON.stringify(f.resolutions)).toMatchObject({ status: "completed" });
  expect(await f.run("new-session", "new-session")).toMatchObject({ status: "completed" });
  expect(f.prepare.mock.calls.map(([input]) => input.model)).toEqual(["vision-first", "vision-first"]);
  expect(f.resolutions).toEqual([
    { phase: "unconfigured", model: null }, { phase: "after-save", model: "vision-first" }, { phase: "new-session", model: "vision-first" },
  ]);
  expect(f.start).toHaveBeenCalledTimes(2);
  expect(f.finish).toHaveBeenCalledTimes(2);
  expect(f.release).toHaveBeenCalledTimes(2);
});

it("disables a removed vision binding and permits reconnect on the same live port", async () => {
  const f = fixture("vision-first");
  expect(await f.run("initial")).toMatchObject({ status: "completed" });
  f.setModel();
  expect(await f.run("after-clear"), JSON.stringify(f.resolutions)).toMatchObject({ failure: { code: "IMAGE_INSPECTION_NOT_CONFIGURED" } });
  expect(f.readArtifact).toHaveBeenCalledTimes(1);
  expect(f.prepare).toHaveBeenCalledTimes(1);
  expect(f.start).toHaveBeenCalledTimes(1);
  f.setModel("vision-reconnected");
  expect(await f.run("reconnected")).toMatchObject({ status: "completed" });
  expect(f.prepare.mock.calls.map(([input]) => input.model)).toEqual(["vision-first", "vision-reconnected"]);
});

it("prepares each observation with the current vision model and fixed Host credential reference", async () => {
  const f = fixture("vision-first");
  expect(await f.run("before-change")).toMatchObject({ status: "completed" });
  f.setModel("vision-second");
  expect(await f.run("same-session")).toMatchObject({ status: "completed" });
  expect(await f.run("another-session", "another-session")).toMatchObject({ status: "completed" });
  expect(f.prepare.mock.calls.map(([input]) => ({ model: input.model, routeId: input.routeId, credentialRef: input.credentialRef }))).toEqual([
    { model: "vision-first", routeId: "default", credentialRef: IMAGE_INSPECTION_CREDENTIAL_REF },
    { model: "vision-second", routeId: "default", credentialRef: IMAGE_INSPECTION_CREDENTIAL_REF },
    { model: "vision-second", routeId: "default", credentialRef: IMAGE_INSPECTION_CREDENTIAL_REF },
  ]);
  expect(f.readArtifact.mock.calls.map(([sessionId]) => sessionId)).toEqual(["same-session", "same-session", "another-session"]);
});
