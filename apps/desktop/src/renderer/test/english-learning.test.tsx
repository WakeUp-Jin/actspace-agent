import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SPEECH_SETTINGS, type EnglishLearningState } from "@actspace/shared";
import { EnglishLearningCapability } from "../components/extensions/EnglishLearningCapability";
import { SpeechSettingsSection } from "../components/settings/SpeechSettingsSection";

const initial: EnglishLearningState = { enabled: false, targetSessionId: null, revision: 0, promptStatus: "off", speechStatus: "unconfigured", queuedSegments: 0, hasApiKey: false, error: null, notice: null };
afterEach(() => { delete (window as { actspace?: unknown }).actspace; });
function bridge() {
  const snapshot = { version: 4, revision: "one", settings: { general: {}, media: { speech: { ...DEFAULT_SPEECH_SETTINGS } } } };
  const api = {
    getEnglishLearningState: vi.fn(async () => initial),
    getSettingsV4: vi.fn(async () => snapshot),
    listSessions: vi.fn(async () => [
      { id: "old", title: "Old", updatedAt: "2026-09-01", agentRunCount: 0 },
      { id: "new", title: "New", updatedAt: "2026-09-06", agentRunCount: 0 },
      { id: "child", title: "Child", updatedAt: "2026-09-07", isChildSession: true, agentRunCount: 0 },
    ]),
    onEnglishLearningStateChanged: vi.fn(() => () => {}),
    setEnglishLearningTarget: vi.fn(async (input) => ({ ...initial, enabled: input.enabled, targetSessionId: input.enabled ? input.sessionId : null, revision: 1, promptStatus: input.enabled ? "active" : "off" })),
    updateSettingsV4: vi.fn(async () => ({ ok: true, snapshot })),
    setProviderKey: vi.fn(async () => ({ ok: true })), clearProviderKey: vi.fn(async () => ({ ok: true })),
  };
  window.actspace = api as unknown as typeof window.actspace;
  return api;
}

describe("English learning controls", () => {
  it("chooses the latest main session, enables it, and preserves state on failure", async () => {
    const api = bridge(); const user = userEvent.setup(); render(<EnglishLearningCapability />);
    const toggle = screen.getByRole("switch", { name: "开启英语辅助学习" });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    expect(api.setEnglishLearningTarget).toHaveBeenCalledWith({ enabled: true, sessionId: "new" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("option", { name: "Child" })).not.toBeInTheDocument();
    api.setEnglishLearningTarget.mockRejectedValueOnce(new Error("failed"));
    await user.selectOptions(screen.getByLabelText("英语学习目标会话"), "old");
    expect(await screen.findByRole("alert")).toHaveTextContent("无法更改");
    expect(screen.getByLabelText("英语学习目标会话")).toHaveValue("new");
  });
  it("saves speech preferences as they change and saves the key from its own editor", async () => {
    const api = bridge(); const user = userEvent.setup(); render(<SpeechSettingsSection />);
    const voice = screen.getByLabelText("语音音色");
    await waitFor(() => expect(voice).toBeEnabled());
    const modelSelect = screen.getByRole("button", { name: "语音模型" });
    expect(modelSelect).toHaveTextContent("speech-2.8-turbo");
    await user.click(modelSelect);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo", "speech-02-hd", "speech-02-turbo", "speech-01-hd", "speech-01-turbo"]);
    await user.click(screen.getByRole("option", { name: "speech-2.8-hd" }));
    await waitFor(() => expect(api.updateSettingsV4).toHaveBeenCalledWith(expect.objectContaining({ namespace: "media", patch: { speech: { ...DEFAULT_SPEECH_SETTINGS, model: "speech-2.8-hd" } } })));
    await user.clear(voice); await user.type(voice, "my-voice"); await user.tab();
    await waitFor(() => expect(api.updateSettingsV4).toHaveBeenLastCalledWith(expect.objectContaining({ namespace: "media", patch: { speech: { ...DEFAULT_SPEECH_SETTINGS, model: "speech-2.8-hd", voiceId: "my-voice" } } })));
    await user.click(screen.getByRole("button", { name: "设置 MiniMax Key" }));
    await user.type(screen.getByLabelText("MiniMax 语音 API Key"), "speech-canary");
    await user.click(screen.getByRole("button", { name: "保存 Key" }));
    await waitFor(() => expect(screen.queryByLabelText("MiniMax 语音 API Key")).not.toBeInTheDocument());
    expect(api.setProviderKey).toHaveBeenCalledWith({ provider: "speech-minimax", apiKey: "speech-canary" });
  });
});
