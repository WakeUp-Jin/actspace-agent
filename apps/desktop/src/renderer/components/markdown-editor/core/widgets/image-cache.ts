/**
 * 本地图片 data URL 的缓存（规范 §11：按路径缓存，换文档时清空）。
 * 只缓存 `data:image/…`：宿主返回别的东西一律当读不到。
 */
import type { MarkdownEditorHost } from "../../host";

const MAX_ENTRIES = 64;
const settled = new Map<string, string | null>();
/** 每次清空缓存加一：`ImageWidget.eq` 带上它，清空后旧 widget 不会被当成“没变”而保留旧 DOM。 */
let generation = 0;
const pending = new Map<string, Promise<string | null>>();

function cacheKey(host: MarkdownEditorHost, relativePath: string): string {
  return `${host.workspaceRoot ?? ""}\u0000${relativePath}`;
}

function accept(value: string | null | undefined): string | null {
  return typeof value === "string" && /^data:image\//i.test(value) ? value : null;
}

/** 已经读完的结果：`undefined` 表示还没读过，`null` 表示读不到。 */
export function peekImage(host: MarkdownEditorHost, relativePath: string): string | null | undefined {
  return settled.get(cacheKey(host, relativePath));
}

export function loadImageCached(host: MarkdownEditorHost, relativePath: string): Promise<string | null> {
  const key = cacheKey(host, relativePath);
  const hit = settled.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const task = Promise.resolve()
    .then(() => host.loadImage(relativePath))
    .then(accept, () => null)
    .then((value) => {
      pending.delete(key);
      if (settled.size >= MAX_ENTRIES) settled.delete(settled.keys().next().value as string);
      settled.set(key, value);
      return value;
    });
  pending.set(key, task);
  return task;
}

export function imageCacheGeneration(): number {
  return generation;
}

/** 换文档、重新加载时调用。 */
export function clearImageCache(): void {
  settled.clear();
  pending.clear();
  generation += 1;
}
