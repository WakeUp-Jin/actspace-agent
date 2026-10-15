import { Image as ImageIcon, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MessageBlock } from "@actspace/shared";
import { useRightPanel } from "../right-panel/RightPanelContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { dialogsApi } from "../../api/dialogs";
import { sessionsApi } from "../../api/sessions";

/** 本轮生成的图片列表。改过的文件和交付文件由轮尾的改动卡 / 交付卡展示（components/turn-tail）。 */
type TurnOutputImage = {
  id: string;
  name: string;
  displayPath: string;
  sourcePath: string;
};

const ARTIFACT_PANEL_CLASS =
  "mx-[var(--conversation-text-inset)] mt-3 overflow-hidden rounded-act-lg border border-line bg-surface-raised";
const ARTIFACT_HEADER_CLASS =
  "flex min-h-9 items-center justify-between gap-3 px-3 text-act-xs leading-4 font-semibold text-text-muted";
const ARTIFACT_ROW_CLASS =
  "flex min-h-9 w-full items-center gap-2 border-0 border-t border-line bg-transparent px-3 py-1.5 text-left transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:hover:bg-transparent";

function displayArtifactPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const marker = "/artifacts/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + marker.length);
  }
  return normalized;
}

function fileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized;
}

export function collectTurnOutputArtifacts(messages: MessageBlock[]): TurnOutputImage[] {
  const outputs = new Map<string, TurnOutputImage>();

  for (const message of messages) {
    if (!((message.kind === "image_generation" && (message.status === "completed" || message.status === "partial")) || (message.kind === "tool" && message.artifacts?.length))) continue;
    const images = message.kind === "image_generation" ? message.images : message.artifacts;
    for (const image of images ?? []) {
      if (image.type !== "image" || !image.path) continue;
      const key = `image:${image.path}`;
      if (outputs.has(key)) continue;
      outputs.set(key, {
        id: key,
        name: image.name || fileName(image.path),
        displayPath: message.kind === "tool" ? image.name || displayArtifactPath(image.path) : displayArtifactPath(image.path),
        sourcePath: image.path,
      });
    }
  }

  return [...outputs.values()];
}

function artifactReadError(error: string | undefined): string {
  if (error === "too_large") return "图片过大，无法预览。";
  if (error === "unsupported_format") return "图片格式不受支持。";
  if (error === "escapes_root" || error === "invalid_session") return "图片路径不属于当前会话。";
  return "图片读取失败。";
}

export function TurnOutputArtifacts({
  messages,
  sessionId,
}: {
  messages: MessageBlock[];
  sessionId: string | null;
}) {
  const outputs = useMemo(() => collectTurnOutputArtifacts(messages), [messages]);
  const { openTab } = useRightPanel();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (outputs.length === 0) return null;

  async function openArtifact(artifact: TurnOutputImage) {
    setLoadingId(artifact.id);
    setError(null);
    try {
      if (!sessionId) {
        setError("当前环境不支持会话图片预览。");
        return;
      }
      const result = await sessionsApi.readArtifact({
        sessionId,
        artifactPath: artifact.sourcePath,
      });
      if (result.error || !result.dataUrl) {
        setError(artifactReadError(result.error));
        return;
      }
      openTab({
        id: `session-artifact:${sessionId}:${result.relativePath}`,
        kind: "image",
        // The session-artifact IPC intentionally returns an opaque storage path;
        // keep the user-facing label from the tool projection instead of exposing
        // the UUID as a tab title.
        title: artifact.name,
        src: result.dataUrl,
      });
    } catch {
      setError("图片读取失败。");
    } finally {
      setLoadingId(null);
    }
  }

  async function showContextMenu(artifact: TurnOutputImage) {
    setError(null);
    if (!sessionId) return;
    try {
      const result = await dialogsApi.showArtifactContextMenu({ kind: "session_image", sessionId, artifactPath: artifact.sourcePath });
      if (!result.shown) setError("无法打开 Artifact 菜单。");
    } catch {
      setError("无法打开 Artifact 菜单。");
    }
  }

  const hasGeneratedImage = messages.some((message) => message.kind === "image_generation" && (message.status === "completed" || message.status === "partial"));
  const summaryLabel = `${hasGeneratedImage ? "Generated " : ""}${outputs.length} ${outputs.length === 1 ? "image" : "images"}`;

  return (
    <section className={ARTIFACT_PANEL_CLASS} aria-label="Turn output artifacts">
      <header className={ARTIFACT_HEADER_CLASS}>
        <span>{summaryLabel}</span>
      </header>
      <div>
        {outputs.map((artifact) => (
          <Tooltip key={artifact.id} delayDuration={400}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={ARTIFACT_ROW_CLASS}
                onClick={() => void openArtifact(artifact)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void showContextMenu(artifact);
                }}
                disabled={loadingId === artifact.id}
                aria-label={`Open ${artifact.name}`}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center text-text-faint" aria-hidden="true">
                  {loadingId === artifact.id ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-act-xs text-text-muted">
                  {artifact.displayPath}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-[420px] break-all font-normal">
              {artifact.sourcePath}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {error ? <div className="border-t border-line px-3 py-2 text-act-xs leading-4 text-danger">{error}</div> : null}
    </section>
  );
}
