import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useWide } from "../../app/use-wide";
import { useHostDescription } from "../../connection/use-connection";
import { primaryAction, type QueuedMessage } from "../../sessions/composer-state";
import { effortLabel, modelShortName } from "../../sessions/model-options";
import type { useComposer } from "../../sessions/use-composer";
import type { SessionObservation } from "../../sessions/use-session-observation";
import { ComposerBox } from "./ComposerBox";
import { ModelSheet } from "./ModelSheet";
import { isAgentMode } from "./PlusSheet";
import { QueueTray } from "./QueueTray";
import { StatusLine } from "./StatusLine";

type Props = {
  readonly observation: SessionObservation;
  readonly composer: ReturnType<typeof useComposer>;
  readonly awaitingApproval: boolean;
  readonly queued: readonly QueuedMessage[];
  /** 拒绝审批后：改占位提示、保持聚焦样式；focusSignal 每次拒绝加一，用来聚焦输入框。 */
  readonly denied: boolean;
  readonly focusSignal: number;
};

const PLACEHOLDERS = { agent: "继续追问…", plan: "描述要规划的改动…", chat: "问点什么…" } as const;

/** 输入坞：状态行、排队托盘、玻璃输入框。 */
export function Composer({ observation, composer, awaitingApproval, queued, denied, focusSignal }: Props) {
  const wide = useWide();
  const models = useHostDescription()?.models ?? [];
  const area = useRef<HTMLTextAreaElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const { draft, setDraft, connected, maintenance } = composer;
  const action = primaryAction({ hasText: draft.trim().length > 0, running: observation.running, awaitingApproval, connected, maintenance });
  const mode = isAgentMode(observation.agentMode) ? observation.agentMode : "agent";

  useEffect(() => { if (focusSignal > 0) area.current?.focus(); }, [focusSignal]);

  const submit = () => { if (action === "send") void composer.send(); else if (action === "stop") void composer.stop(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (wide && !event.shiftKey) { event.preventDefault(); if (action === "send") void composer.send(); }
  };

  const placeholder = denied ? "告诉 Agent 应该怎么做…" : !connected ? "已断开，正在重连…" : maintenance ? "服务器维护中，暂时不能发送" : PLACEHOLDERS[mode];
  const modelLabel = `${modelShortName(composer.model, models)}${composer.effort ? ` · ${effortLabel(composer.effort)}` : ""}`;

  return (
    <div>
      <StatusLine awaitingApproval={awaitingApproval} running={observation.running} connected={connected} maintenance={maintenance} runStartedAt={observation.runStartedAt} contextPercent={observation.contextPercent} />
      <QueueTray items={queued} paused={observation.tasks?.paused === true} resumeDisabled={!connected || maintenance || composer.resuming} onResume={() => void composer.resume()} onCancel={taskId => void composer.cancelQueued(taskId)} />
      <ComposerBox
        value={draft}
        onChange={value => { setDraft(value); if (composer.error) composer.clearError(); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ariaLabel="消息"
        textareaRef={area}
        disabled={!connected}
        enterKeyHint={wide ? "send" : "enter"}
        mode={mode}
        onModeChange={next => void composer.setMode(next)}
        modelLabel={modelLabel}
        onModelClick={() => setModelOpen(true)}
        modelDisabled={!connected}
        action={action}
        onSubmit={submit}
        attention={denied}
      />
      {composer.error ? <p role="alert" className="m-0 px-3 pt-1.5 text-act-sm text-danger">{composer.error}</p> : null}
      <ModelSheet open={modelOpen} onOpenChange={setModelOpen} models={models} model={composer.model} effort={composer.effort} effortOptions={composer.effortOptions} onPick={next => void composer.configure(next)} />
    </div>
  );
}
