import { useEffect, useState } from "react";
import type { AgentSystemPromptFile } from "@actspace/shared";
import { SettingGroup, SettingLinkRow, SettingEditor, useSettingsSaveNotice } from "../SettingsPrimitives";
import { settingsApi } from "../../../api/settings";
import { type SectionProps, SETTINGS_TEXTAREA_CLASS } from "./shared";

const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;

export function AgentInstructionsSection({ settings }: SectionProps) {
  const notifySaved = useSettingsSaveNotice();
  const [promptFile, setPromptFile] = useState<AgentSystemPromptFile | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPrompt() {
      setPromptError(null);
      try {
        const next = await settingsApi.readSystemPrompt();
        if (cancelled) return;
        setPromptFile(next);
        setDraftPrompt(next.content);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load agent system prompt", error);
        setPromptFile(null);
        setDraftPrompt("");
        setPromptError("读取系统提示词文件失败。");
      }
    }

    void loadPrompt();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = Boolean(promptFile && draftPrompt !== promptFile.content);
  const closeEditor = () => {
    setDraftPrompt(promptFile?.content ?? "");
    if (promptFile) setPromptError(null);
    setEditorOpen(false);
  };
  const savePrompt = async () => {
    if (!promptFile) {
      setPromptError("系统提示词文件接口不可用。");
      return;
    }
    setSaving(true);
    setPromptError(null);
    try {
      const next = await settingsApi.writeSystemPrompt({ content: draftPrompt });
      setPromptFile(next);
      setDraftPrompt(next.content);
      setEditorOpen(false);
      notifySaved();
    } catch (error) {
      console.error("Failed to save agent system prompt", error);
      setPromptError("保存系统提示词文件失败，内容已保留。");
    } finally {
      setSaving(false);
    }
  };

  const path = promptFile?.path ?? settings.agent.systemPromptPath;
  return (
    <SettingGroup title="Agent 指令" headingLevel={3}>
      <SettingLinkRow
        title="系统提示词"
        description={promptError && !editorOpen ? <span className="font-sans text-act-xs text-on-danger">{promptError}</span> : path}
        monoDescription
        value={promptFile ? `${promptFile.content.length.toLocaleString("zh-CN")} 字` : undefined}
        ariaLabel={editorOpen ? "收起 Agent 指令" : "编辑 Agent 指令"}
        expanded={editorOpen}
        controlsId="agent-system-prompt-editor"
        disabled={!promptFile}
        onClick={() => (editorOpen ? closeEditor() : setEditorOpen(true))}
      />
      {editorOpen ? (
        <SettingEditor
          id="agent-system-prompt-editor"
          hint={`保存后从下一次请求生效 · ${draftPrompt.length.toLocaleString("zh-CN")} / ${AGENT_SYSTEM_PROMPT_MAX_CHARS.toLocaleString("zh-CN")}`}
          error={promptError}
          saving={saving}
          saveDisabled={!dirty}
          onCancel={closeEditor}
          onSave={() => void savePrompt()}
        >
          <textarea
            id="agent-system-prompt"
            value={draftPrompt}
            maxLength={AGENT_SYSTEM_PROMPT_MAX_CHARS}
            onChange={(event) => setDraftPrompt(event.target.value)}
            className={`${SETTINGS_TEXTAREA_CLASS} min-h-[180px] font-mono`}
            spellCheck={false}
            autoFocus
            aria-label="主 Agent 自定义系统提示词"
          />
        </SettingEditor>
      ) : null}
    </SettingGroup>
  );
}
