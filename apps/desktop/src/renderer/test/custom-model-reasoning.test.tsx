import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import type { CustomModelReasoning } from "@actspace/shared";
import { CustomModelReasoningFields } from "../components/settings/CustomModelReasoningFields";
import { setupBridge } from "./helpers/bridge";

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

it("prefills exact matches, permits manual efforts and clears a deselected default", async () => {
  function Fixture() { const [value, setValue] = useState<CustomModelReasoning>({ mode: "auto" }); return <><CustomModelReasoningFields apiModel="gpt-6-astra" value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>; }
  render(<Fixture />);
  expect(screen.getByText(/目录匹配：gpt-6-astra/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "high" })).not.toBeInTheDocument();
  await choose("能力来源", "手动配置");
  await userEvent.click(screen.getByRole("checkbox", { name: "high" }));
  await choose("默认强度", "high");
  expect(screen.getByRole("status")).toHaveTextContent('"defaultEffort":"high"');
  await choose("默认强度", "自动（不指定强度）");
  expect(screen.getByRole("status")).not.toHaveTextContent("defaultEffort");
  await choose("默认强度", "high");
  await userEvent.click(screen.getByRole("checkbox", { name: "high" }));
  expect(screen.getByRole("combobox", { name: "默认强度" })).toHaveTextContent("自动（不指定强度）");
  await choose("推理支持", "未知");
  expect(screen.queryByRole("combobox", { name: "默认强度" })).not.toBeInTheDocument();
});

it("edits an existing model through models:update without recreating its connection", async () => {
  const { ModelSettings } = await import("../components/settings/ModelSettings");
  const { vi } = await import("vitest");
  const model = { definition: { key: "openrouter:connection/relay/alias", provider: "openrouter", api: "openai-completions", apiModel: "alias", source: "custom", label: "Relay model", contextWindow: null, capabilities: { input: ["text"], toolUse: "declared", reasoning: false, thinkingToggle: false } }, settings: { enabled: true, connectionId: "relay" }, unavailableReasons: {} };
  const updateModel = vi.fn(async () => ({ ok: true, model }));
  setupBridge({ "models.listInstalled": async () => ({ models: [model] }), "models.update": updateModel });
  render(<ModelSettings settings={{ providers: {} } as never} connectionFilter="relay" embedded />);
  await userEvent.click(await screen.findByRole("button", { name: "选择启用模型" }));
  await userEvent.click(await screen.findByRole("button", { name: "配置推理能力：Relay model" }));
  await choose("能力来源", "手动配置");
  await choose("推理支持", "支持");
  await userEvent.click(screen.getByRole("checkbox", { name: "high" }));
  await userEvent.click(screen.getByRole("button", { name: "保存推理配置" }));
  expect(updateModel).toHaveBeenCalledWith({ modelKey: model.definition.key, reasoningConfig: { mode: "manual", support: "supported", efforts: ["high"], allowOff: false, defaultEffort: undefined } });
});
