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
  additions?: number;
  deletions?: number;
};

const ARTIFACT_PANEL_CLASS =
  "mx-[var(--conversation-text-inset)] mt-3 overflow-hidden rounded-act-lg border border-line bg-surface-raised";
const ARTIFACT_HEADER_CLASS =
  "flex min-h-9 items-center justify-between gap-3 px-3 text-xs font-semibold text-text-muted";
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

function normalizedRelativePath(path: string | undefined): string | undefined {
  if (!path || /^(?:[A-Za-z]:)?[\\/]/.test(path)) return undefined;
  return path.replace(/\\/g, "/");
}

function normalizedPath(path: string | undefined): string | undefined {
  return path?.replace(/\\/g, "/");
}

function fileArtifactKey(sourcePath: string, relativePath: string | undefined): string {
  return `file:${relativePath ?? normalizedPath(sourcePath)}`;
}

export function collectTurnOutputArtifacts(messages: MessageBlock[]): TurnOutputArtifact[] {
  const outputs = new Map<string, TurnOutputArtifact>();

  for (const message of messages) {
    if (message.kind === "image_generation" && (message.status === "completed" || message.status === "partial")) {
      for (const image of message.images ?? []) {
        if (image.type !== "image" || !image.path) continue;
        const key = `image:${image.path}`;
        if (outputs.has(key)) continue;
        outputs.set(key, {
          id: key,
          kind: "image",
          name: image.name || fileName(image.path),
          displayPath: displayArtifactPath(image.path),
          sourcePath: image.path,
        });
      }
      continue;
    }

    if (message.kind === "delete" && message.status === "completed") {
      const deletedRelativePath = normalizedRelativePath(message.outputRelativePath);
      const deletedSourcePath = normalizedPath(message.outputPath);
      let removedExactMatch = false;

      for (const [key, artifact] of outputs) {
        if (artifact.kind !== "file") continue;
        if (
          (deletedRelativePath && artifact.workspaceRelativePath === deletedRelativePath)
          || (deletedSourcePath && normalizedPath(artifact.sourcePath) === deletedSourcePath)
        ) {
          outputs.delete(key);
          removedExactMatch = true;
        }
      }

      // Older persisted delete previews only contain a basename. Remove it only
      // when that basename identifies exactly one output in this turn.
      if (!removedExactMatch && !deletedRelativePath && !deletedSourcePath) {
        const legacyMatches = [...outputs.entries()].filter(([, artifact]) => (
          artifact.kind === "file" && artifact.name === message.filePath
        ));
        if (legacyMatches.length === 1) outputs.delete(legacyMatches[0][0]);
      }
      continue;
    }

    if (
      (message.kind === "write_diff" || message.kind === "edit_diff")
      && message.status === "completed"
      && message.outputPath
    ) {
      const relativePath = normalizedRelativePath(message.outputRelativePath);
      const key = fileArtifactKey(message.outputPath, relativePath);
      const existing = outputs.get(key);
      outputs.set(key, {
        id: key,
        kind: "file",
        name: message.filePath || fileName(message.outputPath),
        displayPath: relativePath ?? fileName(message.outputPath),
        sourcePath: message.outputPath,
        workspaceRelativePath: relativePath,
        additions: (existing?.additions ?? 0) + message.additions,
        deletions: (existing?.deletions ?? 0) + message.deletions,
      });
    }
  }

  return [...outputs.values()];
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

function workspaceReadError(error: WorkspaceReadFileResult["error"]): string {
  if (error === "not_found") return "文件已不存在。";
  if (error === "too_large") return "文件过大，无法预览。";
  if (error === "binary") return "暂不支持预览二进制文件。";
  if (error === "not_a_file") return "该路径不是文件。";
  if (error === "escapes_root") return "文件路径不属于当前工作区。";
  return "文件读取失败。";
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
      if (result.error) {
        setError(workspaceReadError(result.error));
        return;
      }
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

  const fileOutputs = outputs.filter((artifact) => artifact.kind === "file");
  const imageCount = outputs.length - fileOutputs.length;
  const additions = fileOutputs.reduce((total, artifact) => total + (artifact.additions ?? 0), 0);
  const deletions = fileOutputs.reduce((total, artifact) => total + (artifact.deletions ?? 0), 0);
  const summaryLabel = fileOutputs.length > 0 && imageCount > 0
    ? `${fileOutputs.length} ${fileOutputs.length === 1 ? "file" : "files"} · ${imageCount} ${imageCount === 1 ? "image" : "images"}`
    : fileOutputs.length > 0
      ? `Edited ${fileOutputs.length} ${fileOutputs.length === 1 ? "file" : "files"}`
      : `Generated ${imageCount} ${imageCount === 1 ? "image" : "images"}`;

  return (
    <section className={ARTIFACT_PANEL_CLASS} aria-label="Turn output artifacts">
      <header className={ARTIFACT_HEADER_CLASS}>
        <span>{summaryLabel}</span>
        {fileOutputs.length > 0 ? (
          <span className="flex shrink-0 gap-1 font-medium tabular-nums" aria-label={`${additions} additions, ${deletions} deletions`}>
            <span className="text-success">+{additions}</span>
            <span className="text-danger">-{deletions}</span>
          </span>
        ) : null}
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
                  <span className="grid h-5 w-5 shrink-0 place-items-center text-text-faint" aria-hidden="true">
                    {loadingId === artifact.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : artifact.kind === "image"
                        ? <ImageIcon size={14} />
                        : <FileText size={14} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-text-muted">
                    {artifact.displayPath}
                  </span>
                  {artifact.kind === "file" ? (
                    <span className="flex shrink-0 gap-1 text-[11px] font-medium tabular-nums" aria-label={`${artifact.additions ?? 0} additions, ${artifact.deletions ?? 0} deletions`}>
                      <span className="text-success">+{artifact.additions ?? 0}</span>
                      <span className="text-danger">-{artifact.deletions ?? 0}</span>
                    </span>
                  ) : null}
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
