import { ImageIcon, ImageOff, Loader2 } from "lucide-react";
import { useState } from "react";
import type { MessageBlock, ToolArtifact } from "@actspace/shared";
import { useRightPanel } from "../right-panel/RightPanelContext";

type GeneratedImageMessage = Extract<MessageBlock, { kind: "image_generation" }>;
type LocalImageArtifact = ToolArtifact & { path: string };

function localFileUrl(path: string): string {
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function GeneratedImageBlock({
  message,
  className,
}: {
  message: GeneratedImageMessage;
  className?: string;
}) {
  const { openTab } = useRightPanel();
  const images = (message.images ?? []).filter(
    (artifact): artifact is LocalImageArtifact => artifact.type === "image" && Boolean(artifact.path),
  );
  const running = message.status === "running";

  function openImage(image: LocalImageArtifact) {
    openTab({
      id: `generated-image:${image.path}`,
      kind: "image",
      title: image.name,
      src: localFileUrl(image.path),
    });
  }

  return (
    <section
      className={`${className ?? ""} overflow-hidden rounded-act-lg border border-line bg-surface-raised`}
      aria-label={message.displayText}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-act-md bg-selected text-text-muted">
          {running ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-main">{message.displayText}</div>
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-text-muted">{message.promptPreview}</div>
          <div className="mt-1 text-[11px] text-text-faint">
            {[message.model, message.size, running ? `请求 ${message.requestedCount} 张` : `${message.generatedCount ?? 0}/${message.requestedCount}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>

      {images.length > 0 ? (
        <div className={`grid gap-1.5 border-t border-line p-1.5 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {images.map((image) => (
            <GeneratedImageThumbnail
              key={image.path}
              image={image}
              onOpen={openImage}
            />
          ))}
        </div>
      ) : null}

      {message.warning || message.errorMessage ? (
        <div className={`border-t border-line px-3.5 py-2 text-xs ${message.errorMessage ? "text-on-danger" : "text-text-muted"}`}>
          {message.errorMessage ?? message.warning}
        </div>
      ) : null}
    </section>
  );
}

function GeneratedImageThumbnail({
  image,
  onOpen,
}: {
  image: LocalImageArtifact;
  onOpen: (image: LocalImageArtifact) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className="group relative aspect-square overflow-hidden rounded-act-md border-0 bg-surface-subtle p-0 text-left"
      onClick={() => !failed && onOpen(image)}
      aria-label={failed ? `${image.name} 加载失败` : `查看 ${image.name}`}
      disabled={failed}
    >
      {failed ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-text-faint">
          <ImageOff size={18} />
          本地图片加载失败
        </span>
      ) : (
        <img
          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.015]"
          src={localFileUrl(image.path)}
          alt={image.name}
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}
