import { FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MessageBlock, WorkspaceReadFileResult } from "@actspace/shared";
import { useRightPanel, type RightPanelTab } from "../right-panel/RightPanelContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

type TurnOutputArtifact = {
  id: string;
  kind: "image" | "file";
  name: string;
  displayPath: string;
  sourcePath: string;
  workspaceRelativePath?: string;
};

const ARTIFACT_PANEL_CLASS =
  "mx-[var(--conversation-text-inset)] mt-3 overflow-hidden rounded-act-lg border border-line bg-surface-raised";
const ARTIFACT_HEADER_CLASS =
  "flex min-h-9 items-center justify-between gap-3 px-3 text-xs font-semibold text-text-muted";
const ARTIFACT_ROW_CLASS =
  "flex min-h-12 w-full items-center gap-2.5 border-0 border-t border-line bg-transparent px-3 py-2 text-left transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:hover:bg-transparent";

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

export function collectTurnOutputArtifacts(messages: MessageBlock[]): TurnOutputArtifact[] {
  const outputs: TurnOutputArtifact[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.kind === "image_generation" && (message.status === "completed" || message.status === "partial")) {
      for (const image of message.images ?? []) {
        if (image.type !== "image" || !image.path) continue;
        const key = `image:${image.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        outputs.push({
          id: key,
          kind: "image",
          name: image.name || fileName(image.path),
          displayPath: displayArtifactPath(image.path),
          sourcePath: image.path,
        });
      }
      continue;
    }

    if (
      (message.kind === "write_diff" || message.kind === "edit_diff")
      && message.status === "completed"
      && message.outputPath
    ) {
      const key = `file:${message.outputPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const relativePath = message.outputRelativePath && !/^(?:[A-Za-z]:)?[\\/]/.test(message.outputRelativePath)
        ? message.outputRelativePath.replace(/\\/g, "/")
        : undefined;
      outputs.push({
        id: key,
        kind: "file",
        name: message.filePath || fileName(message.outputPath),
        displayPath: relativePath ?? fileName(message.outputPath),
        sourcePath: message.outputPath,
        workspaceRelativePath: relativePath,
      });
    }
  }

  return outputs;
}

function workspaceTab(result: WorkspaceReadFileResult): RightPanelTab | null {
  if (result.error) return null;
  const id = `file:${result.relativePath}`;
  const title = fileName(result.relativePath);
  switch (result.renderKind) {
    case "markdown":
      return { id, kind: "markdown", title, source: result.content ?? "", relativePath: result.relativePath };
    case "html":
      return { id, kind: "html", title, html: result.content ?? "", trust: "file", relativePath: result.relativePath };
    case "image":
      return { id, kind: "image", title, src: result.dataUrl ?? "", relativePath: result.relativePath };
    case "text":
      return {
        id,
        kind: "text",
        title,
        content: result.content ?? "",
        language: result.language,
        relativePath: result.relativePath,
      };
  }
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
  workspaceRoot,
}: {
  messages: MessageBlock[];
  sessionId: string | null;
  workspaceRoot?: string | null;
}) {
  const outputs = useMemo(() => collectTurnOutputArtifacts(messages), [messages]);
  const { openTab } = useRightPanel();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (outputs.length === 0) return null;

  async function openArtifact(artifact: TurnOutputArtifact) {
    setLoadingId(artifact.id);
    setError(null);
    try {
      if (artifact.kind === "image") {
        if (!sessionId || !window.actspace?.readSessionArtifact) {
          setError("当前环境不支持会话图片预览。");
          return;
        }
        const result = await window.actspace.readSessionArtifact({
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
          title: result.name || artifact.name,
          src: result.dataUrl,
        });
        return;
      }

      if (!workspaceRoot || !artifact.workspaceRelativePath || !window.actspace?.readWorkspaceFile) {
        setError("该文件不在当前工作区内，暂时不能预览。");
        return;
      }
      const result = await window.actspace.readWorkspaceFile({
        workspaceRoot,
        relativePath: artifact.workspaceRelativePath,
      });
      const tab = workspaceTab(result);
      if (!tab) {
        setError("文件读取失败。");
        return;
      }
      openTab(tab);
    } catch {
      setError(artifact.kind === "image" ? "图片读取失败。" : "文件读取失败。");
    } finally {
      setLoadingId(null);
    }
  }

  async function showContextMenu(artifact: TurnOutputArtifact) {
    if (!window.actspace?.showArtifactContextMenu) return;
    setError(null);
    const input = artifact.kind === "image"
      ? sessionId
        ? { kind: "session_image" as const, sessionId, artifactPath: artifact.sourcePath }
        : null
      : workspaceRoot && artifact.workspaceRelativePath
        ? {
            kind: "workspace_file" as const,
            workspaceRoot,
            relativePath: artifact.workspaceRelativePath,
          }
        : null;
    if (!input) return;

    try {
      const result = await window.actspace.showArtifactContextMenu(input);
      if (!result.shown) setError("无法打开 Artifact 菜单。");
    } catch {
      setError("无法打开 Artifact 菜单。");
    }
  }

  return (
    <section className={ARTIFACT_PANEL_CLASS} aria-label="Turn output artifacts">
      <header className={ARTIFACT_HEADER_CLASS}>
        <span>{outputs.length} {outputs.length === 1 ? "Artifact" : "Artifacts"}</span>
        <span className="font-normal text-text-faint">Open in panel</span>
      </header>
      <div>
        {outputs.map((artifact) => {
          const canOpen = artifact.kind === "image" || Boolean(artifact.workspaceRelativePath);
          return (
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
                  disabled={!canOpen || loadingId === artifact.id}
                  aria-label={`Open ${artifact.name}`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-act-sm bg-surface-subtle text-text-muted" aria-hidden="true">
                    {loadingId === artifact.id
                      ? <Loader2 size={15} className="animate-spin" />
                      : artifact.kind === "image"
                        ? <ImageIcon size={15} />
                        : <FileText size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-main">{artifact.name}</span>
                    <span className="block truncate text-xs text-text-faint">{artifact.displayPath}</span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-[420px] break-all font-normal">
                {artifact.sourcePath}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {error ? <div className="border-t border-line px-3 py-2 text-xs text-danger">{error}</div> : null}
    </section>
  );
}
