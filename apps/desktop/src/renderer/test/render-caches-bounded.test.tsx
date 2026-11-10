import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IMAGE_CACHE_MAX_BYTES, clearMarkdownImageCache, loadCached } from "../components/messages/markdown/MarkdownImage";
import { FILE_APPLICATIONS_CACHE_MAX_ENTRIES, clearFileApplicationsCache, useFileApplications } from "../components/turn-tail/useFileApplications";
import { observeOverflow, observedOverflowCount } from "../components/messages/overflow-observer";
import { ToolLogLine } from "../components/messages/ToolLogLine";
import { LruCache } from "../lru-cache";
import { setupBridge } from "./helpers/bridge";

beforeEach(() => { clearMarkdownImageCache(); clearFileApplicationsCache(); });
afterEach(() => { vi.unstubAllGlobals(); });

it("LruCache evicts the least recently used entries by cost and skips oversize entries", () => {
  const cache = new LruCache<string>(10);
  cache.set("a", "A", 4);
  cache.set("b", "B", 4);
  expect(cache.get("a")).toBe("A"); // a is now more recent than b
  cache.set("c", "C", 4); // total 12 > 10 -> evict b
  expect(cache.peek("b")).toBeUndefined();
  expect(cache.peek("a")).toBe("A");
  expect(cache.peek("c")).toBe("C");
  expect(cache.totalCost).toBe(8);
  cache.set("huge", "H", 11);
  expect(cache.peek("huge")).toBeUndefined();
  cache.set("a", "A2", 1); // replacing updates the cost
  expect(cache.totalCost).toBe(5);
  cache.clear();
  expect(cache.size).toBe(0);
});

it("keeps markdown images by bytes: hits for a stable loader, evicts the oldest past the budget", async () => {
  const size = Math.floor(IMAGE_CACHE_MAX_BYTES / 3) - 1_000; // three fit, a fourth does not
  const image = (tag: string) => `data:image/png;base64,${tag}${"A".repeat(size)}`;
  const loader = vi.fn(async (path: string) => image(path));
  await loadCached(loader, "a");
  await loadCached(loader, "b");
  await loadCached(loader, "c");
  await loadCached(loader, "a"); // hit, also marks a as recent
  expect(loader).toHaveBeenCalledTimes(3);
  await loadCached(loader, "d"); // evicts b (least recently used)
  expect(loader).toHaveBeenCalledTimes(4);
  await loadCached(loader, "a");
  await loadCached(loader, "c");
  expect(loader).toHaveBeenCalledTimes(4);
  await loadCached(loader, "b"); // was evicted -> read again
  expect(loader).toHaveBeenCalledTimes(5);
  // a different loader never shares entries
  const other = vi.fn(async () => "data:image/png;base64,Z");
  await loadCached(other, "a");
  expect(other).toHaveBeenCalledTimes(1);
});

it("bounds the file application cache by entry count and keeps recent entries", async () => {
  const list = vi.fn(async ({ relativePath }: { relativePath: string }) => ({ applications: [{ id: relativePath, name: relativePath, iconDataUrl: null }], error: undefined }));
  setupBridge({ "workspaces.listFileApplications": list as never });
  function Probe({ path }: { path: string }) { useFileApplications("/w", path, true); return null; }
  const total = FILE_APPLICATIONS_CACHE_MAX_ENTRIES + 5;
  for (let index = 0; index < total; index++) {
    const view = render(<Probe path={`f${index}.md`} />);
    await act(async () => { await Promise.resolve(); });
    view.unmount();
  }
  expect(list).toHaveBeenCalledTimes(total);
  // the most recent file is still cached; the very first one was evicted and is queried again
  const recent = render(<Probe path={`f${total - 1}.md`} />);
  await act(async () => { await Promise.resolve(); });
  recent.unmount();
  expect(list).toHaveBeenCalledTimes(total);
  const first = render(<Probe path="f0.md" />);
  await act(async () => { await Promise.resolve(); });
  first.unmount();
  expect(list).toHaveBeenCalledTimes(total + 1);
});

it("shares one ResizeObserver across tool lines and releases it with the last one", () => {
  const instances: Array<{ observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  class FakeResizeObserver {
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
    constructor(_callback: ResizeObserverCallback) { instances.push(this); }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  const first = document.createElement("span");
  const second = document.createElement("span");
  const offFirst = observeOverflow(first, () => {});
  const offSecond = observeOverflow(second, () => {});
  expect(instances).toHaveLength(1);
  expect(observedOverflowCount()).toBe(2);
  offFirst();
  expect(instances[0].unobserve).toHaveBeenCalledWith(first);
  expect(instances[0].disconnect).not.toHaveBeenCalled();
  offSecond();
  expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
  expect(observedOverflowCount()).toBe(0);
});

it("a running tool line carries an empty shimmer layer, a finished one does not", () => {
  const base = { kind: "grep" as const, id: "g", createdAt: "now", pattern: "x", scope: "*.ts", displayText: "Grep x in *.ts" };
  const { container, rerender } = render(<ToolLogLine message={{ ...base, status: "running" }} />);
  const shimmer = container.querySelector(".tool-log-shimmer");
  expect(shimmer).not.toBeNull();
  expect(shimmer).toHaveAttribute("data-shimmer-text", "Grep x in *.ts");
  expect(shimmer).toBeEmptyDOMElement();
  expect(screen.getByText("Grep x in *.ts")).toHaveClass("tool-log-text-running");
  rerender(<ToolLogLine message={{ ...base, status: "completed" }} />);
  expect(container.querySelector(".tool-log-shimmer")).toBeNull();
});
