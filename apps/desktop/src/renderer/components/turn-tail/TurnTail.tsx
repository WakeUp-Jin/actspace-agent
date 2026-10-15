import { useMemo, useRef, useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { TurnOutputArtifacts } from "../messages/TurnOutputArtifacts";
import { useRightPanel } from "../right-panel/RightPanelContext";
import { useRunTargetContext } from "../../target/run-target-context";
import { showTurnFileMenu } from "./open-turn-file";
import { TurnChangesCard } from "./TurnChangesCard";
import { TurnDeliverables } from "./TurnDeliverables";
import { collectPresentedFiles, collectTurnChanges, type TurnChangedFile } from "./turn-tail-data";
import { useShowTurnCodeChanges } from "./useShowTurnCodeChanges";

/**
 * 轮尾：本轮代码改动卡 →「present」交付卡 → 生成的图片，排在最终回复之后、回复操作之前。
 * 改动卡可在设置「显示本轮代码改动」里关掉；交付卡和图片不受影响。
 */
export function TurnTail({ turnId, turnNumber, messages, sessionId, workspaceRoot }: {
  turnId: string;
  /** 从 1 开始的轮次；历史没加载全时为空，Review 标签改叫「本轮改动」。 */
  turnNumber?: number;
  messages: MessageBlock[];
  sessionId: string | null;
  workspaceRoot?: string | null;
}) {
  const { openTab } = useRightPanel();
  const showChanges = useShowTurnCodeChanges();
  const changes = useMemo(() => collectTurnChanges(messages), [messages]);
  const presented = useMemo(() => collectPresentedFiles(messages), [messages]);
  const remote = useRunTargetContext().target.kind === "remote";
  const revision = useRef(0);
  const [menuError, setMenuError] = useState<string | null>(null);
  const visibleChanges = showChanges ? changes : null;

  function openReview(index: number) {
    if (!changes) return;
    revision.current += 1;
    openTab({
      id: `turn-review:${sessionId ?? "local"}:${turnId}`,
      kind: "turnReview",
      title: turnNumber ? `第 ${turnNumber} 轮改动` : "本轮改动",
      changes,
      index,
      revision: revision.current,
      sessionId,
      ...(workspaceRoot ? { workspaceRoot } : {}),
    });
  }

  async function showFileMenu(file: TurnChangedFile) {
    setMenuError(null);
    setMenuError(await showTurnFileMenu({ sessionId, workspaceRoot, relativePath: file.path, remote, openTab }));
  }

  if (!visibleChanges && presented.length === 0) {
    return <TurnOutputArtifacts messages={messages} sessionId={sessionId} />;
  }
  return (
    <>
      <div className="mx-[var(--conversation-text-inset)] mt-3 flex min-w-0 flex-col gap-2.5" data-turn-tail>
        {visibleChanges ? <TurnChangesCard changes={visibleChanges} onOpenReview={openReview} onFileContextMenu={(file) => void showFileMenu(file)} /> : null}
        {menuError ? <p className="m-0 text-act-xs leading-4 text-danger" role="alert">{menuError}</p> : null}
        <TurnDeliverables files={presented} sessionId={sessionId} workspaceRoot={workspaceRoot} />
      </div>
      <TurnOutputArtifacts messages={messages} sessionId={sessionId} />
    </>
  );
}
