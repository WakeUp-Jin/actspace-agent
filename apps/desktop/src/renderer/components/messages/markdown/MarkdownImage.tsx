import { useContext, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { classifyLinkTarget, resolveWorkspacePath } from "../../markdown-common/paths";
import { PlainButton } from "../../ui/PlainButton";
import { MarkdownHostContext } from "./host";

type ImageState = { path: string; url: string | null } | null;
type Loader = (path: string) => Promise<string | null>;

/** 同一个宿主读过的图片按路径缓存（读失败也缓存），同一条回复不会重复读取。 */
const imageCache = new WeakMap<Loader, Map<string, Promise<string | null>>>();

function loadCached(loader: Loader, path: string): Promise<string | null> {
  let paths = imageCache.get(loader);
  if (!paths) {
    paths = new Map();
    imageCache.set(loader, paths);
  }
  let pending = paths.get(path);
  if (!pending) {
    pending = loader(path).catch(() => null);
    paths.set(path, pending);
  }
  return pending;
}

function Placeholder({ label, note, title }: { label: string; note: string; title?: string }) {
  return <span className="md-img-note" title={title}>图片：{label}（{note}）</span>;
}

/**
 * 回复里的图片（规范 §5.5）。
 * - 工作区内的相对路径：经宿主读成 data URL 显示；读不到显示淡色占位；
 * - 宿主没有 loadImage（远端会话）：占位，宿主能打开文件时单击打开；
 * - http / https 远程图片：**不加载**，不发任何网络请求，只显示占位（隐私：不让回复里的远程地址追踪用户）。
 * 原始 HTML 里的 `<img>` 走同一个组件。
 */
export function MarkdownImage({ src = "", alt = "", node: _node }: ComponentPropsWithoutRef<"img"> & { node?: unknown }) {
  const { loadImage, openPath, workspaceRoot } = useContext(MarkdownHostContext);
  const target = src ? classifyLinkTarget(src) : ({ kind: "blocked" } as const);
  const path = target.kind === "local" ? resolveWorkspacePath(target.path, { workspaceRoot }) : null;
  const [state, setState] = useState<ImageState>(null);

  useEffect(() => {
    if (!path || !loadImage) return;
    let cancelled = false;
    void loadCached(loadImage, path).then((url) => { if (!cancelled) setState({ path, url }); });
    return () => { cancelled = true; };
  }, [path, loadImage]);

  const label = alt || src;
  if (target.kind === "external") return <Placeholder label={label} note="远程地址，不加载" title="远程图片不加载" />;
  if (!path) return <Placeholder label={label} note={target.kind === "local" ? "找不到文件" : "不支持的地址"} />;
  if (!loadImage) {
    return openPath
      ? <PlainButton className="md-img-note is-link" title={`在 ActSpace 中打开 ${path}`} onClick={() => openPath(path)}>图片：{label}</PlainButton>
      : <Placeholder label={label} note="无法预览" />;
  }
  if (state?.path !== path) return <Placeholder label={label} note="读取中" />;
  if (!state.url) return <Placeholder label={label} note="找不到文件" />;
  return <span className="md-img"><img src={state.url} alt={alt} /></span>;
}
