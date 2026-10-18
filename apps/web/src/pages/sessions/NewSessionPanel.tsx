import { Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigate } from "../../app/router";
import { useWide } from "../../app/use-wide";
import { useConnection, useConnectionStore } from "../../connection/use-connection";
import { CreateSessionError, STEP_PROGRESS, createSession, readLastWorkspace, writeLastWorkspace, type CreateStep, type NewSessionMode } from "../../sessions/create-session";
import { modelShortName } from "../../sessions/model-options";
import { hostDisplayName } from "../../sessions/session-row-model";
import { Pressable } from "../../ui/Pressable";
import { Sheet } from "../../ui/Sheet";
import { cx } from "../../ui/cx";
import { ComposerBox } from "../session/ComposerBox";
import { ModelSheet } from "../session/ModelSheet";

/** 新建会话弹层（front-web-pwa客户端规范 §9.2）：工作区芯片 + 两层输入框；窄屏底部弹层，宽屏居中对话框。 */
export function NewSessionPanel({ onClose }: { readonly onClose: () => void }) {
  const store = useConnectionStore();
  const state = useConnection();
  const wide = useWide();
  const connection = state.connection;
  const workspaces = connection?.description.workspaces ?? [];
  const models = connection?.description.models ?? [];
  const defaultModel = connection?.description.defaultModel ?? "";

  const [workspaceId, setWorkspaceId] = useState<string | null>(() => readLastWorkspace());
  const [mode, setMode] = useState<NewSessionMode>("agent");
  const [model, setModel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [step, setStep] = useState<CreateStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const workspace = workspaces.find(item => item.id === workspaceId) ?? workspaces[0] ?? null;
  const modelId = model ?? defaultModel;
  const hostName = hostDisplayName(state.host?.url);
  const busy = step !== null;
  const canSend = !busy && !!connection && !state.maintenance && !!workspace && text.trim().length > 0;

  useEffect(() => { requestAnimationFrame(() => area.current?.focus()); }, []);

  const send = async () => {
    if (!canSend || !connection || !workspace) return;
    setError(null);
    try {
      const sessionId = await createSession(connection.client, { workspaceId: workspace.id, mode, content: text.trim(), ...(model && model !== defaultModel ? { model } : {}), onStep: setStep });
      writeLastWorkspace(workspace.id);
      navigate({ name: "session", sessionId });
      onClose();
    } catch (reason) {
      store.reportError(reason instanceof CreateSessionError ? reason.cause : reason);
      setError(reason instanceof Error ? reason.message : String(reason));
      setStep(null);
    }
  };

  const disabledReason = state.maintenance ? "服务器维护中，暂时不能发送" : !connection ? "已断开，正在重连…" : !workspace ? "服务器没有发布工作区" : null;

  return (
    <Sheet open onOpenChange={open => { if (!open && !busy) onClose(); }} title="新会话">
      <div className="pb-1 pt-1.5 text-act-xs font-medium text-text-faint">工作区</div>
      <div role="radiogroup" aria-label="工作区" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5">
        {workspaces.map(item => {
          const selected = item.id === workspace?.id;
          return (
            <Pressable key={item.id} role="radio" aria-checked={selected} title={item.path} disabled={busy} onClick={() => setWorkspaceId(item.id)} className={cx("inline-flex h-8 w-auto flex-none items-center gap-1.5 whitespace-nowrap rounded-act-pill px-3 text-act-sm font-medium", selected ? "bg-selected text-text-main" : "border border-line text-text-muted")}>
              <Folder size={14} aria-hidden />{item.name}
            </Pressable>
          );
        })}
        {workspaces.length === 0 ? <span className="text-act-sm text-text-faint">无可用工作区</span> : null}
      </div>
      <div className="mt-3.5">
        <ComposerBox
          textareaRef={area}
          stacked
          value={text}
          onChange={setText}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && wide && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
          placeholder="描述你要做的事…"
          ariaLabel="第一条消息"
          enterKeyHint={wide ? "send" : "enter"}
          disabled={busy}
          mode={mode}
          onModeChange={setMode}
          modelLabel={modelShortName(modelId, models)}
          modelDisabled={models.length === 0}
          onModelClick={() => setModelOpen(true)}
          action={canSend ? "send" : "disabled"}
          onSubmit={() => void send()}
          {...(busy ? { bar: <span className="flex h-9 items-center gap-2 px-2.5 text-act-md text-text-muted" role="status"><span className="spinner" aria-hidden />{STEP_PROGRESS[step](hostName)}</span> } : {})}
        />
      </div>
      {error || disabledReason ? <p role="alert" className={cx("m-0 mt-2.5 px-1 text-act-sm", error ? "text-danger" : "text-warning")}>{error ?? disabledReason}</p> : null}
      <p className="m-0 mb-1 mt-2.5 text-center text-act-xs text-text-faint">在 {hostName} 上运行 · 需要时会请你审批</p>
      <ModelSheet open={modelOpen} onOpenChange={setModelOpen} models={models} model={modelId} onPick={next => setModel(next.model)} />
    </Sheet>
  );
}
