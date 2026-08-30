import { accessibleName, computedRole } from "./accessibility";
import { allComposedElements, elementBox, isEditable, isEnabled, isInViewport, isVisible } from "./dom";
import { actionPoint, normalizeTarget, resolveAll, waitForState, waitForStrict } from "./locator";
import type { ClipboardPayloadItem, LocatorParams, RuntimeAPI } from "./types";

const INTERACTABLE_SELECTOR = "a,button,input,textarea,select,summary,details,label,img,video,audio,[role],[onclick],[contenteditable=true],[tabindex],[draggable=true]";
const SNAPSHOT_LIMIT_MAX = 1000;
const PAGE_LIMIT_DEFAULT = 200;
const PAGE_LIMIT_MAX = 1000;

export function createRuntime(version: string, buildHash: string): RuntimeAPI {
  let snapshotGeneration = 0;
  let snapshotNodes = new Map<string, Element>();

  const invoke = async (action: string, params: LocatorParams = {}): Promise<unknown> => {
    switch (action) {
      case "point": return actionPoint(normalizeTarget(params), params.timeoutMs, params.localCoordinates);
      case "frame_element": return waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
      case "frame_offset": {
        const frame = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs, actionable: true });
        if (frame.tagName.toLowerCase() !== "iframe") throw new Error("frame_not_found");
        const rect = frame.getBoundingClientRect();
        return {
          x: rect.left + (frame as HTMLElement).clientLeft,
          y: rect.top + (frame as HTMLElement).clientTop,
        };
      }
      case "fill": {
        const target = normalizeTarget(params);
        const element = await waitForStrict(target, { timeoutMs: params.timeoutMs, actionable: true, editable: true });
        setNativeValue(element, params.value ?? "");
        return {};
      }
      case "focus": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
        if (!("focus" in element) || typeof (element as HTMLElement).focus !== "function") throw new Error("element_not_focusable");
        (element as HTMLElement).focus();
        return {};
      }
      case "select_option": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs, actionable: true });
        if (element.tagName.toLowerCase() !== "select") throw new Error("element_not_select");
        const select = element as HTMLSelectElement;
        const selections = params.selections ?? [];
        const selected: string[] = [];
        for (const option of Array.from(select.options)) {
          const match = selections.some((selection) => selection.value === option.value
            || selection.label === option.label
            || selection.valueOrLabel === option.value
            || selection.valueOrLabel === option.label);
          option.selected = match;
          if (match) selected.push(option.value);
        }
        dispatchFormEvent(select, "input");
        dispatchFormEvent(select, "change");
        return { values: selected };
      }
      case "set_checked": {
        const target = normalizeTarget(params);
        const element = await waitForStrict(target, { timeoutMs: params.timeoutMs, actionable: true });
        if (element.tagName.toLowerCase() !== "input") throw new Error("element_not_checkable");
        const input = element as HTMLInputElement;
        if (!["checkbox", "radio"].includes(input.type)) throw new Error("element_not_checkable");
        if (input.type === "radio" && params.checked === false) throw new Error("radio_cannot_uncheck");
        return { value: input.checked, point: await actionPoint(target, params.timeoutMs, params.localCoordinates) };
      }
      case "checked_state": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
        if (element.tagName.toLowerCase() !== "input") throw new Error("element_not_checkable");
        const input = element as HTMLInputElement;
        if (!["checkbox", "radio"].includes(input.type)) throw new Error("element_not_checkable");
        return { value: input.checked };
      }
      case "inner_text": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
        return { value: "innerText" in element ? (element as HTMLElement).innerText : element.textContent };
      }
      case "text_content": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
        return { value: element.textContent };
      }
      case "all_text_contents": {
        const target = normalizeTarget(params);
        await waitForState(target, "attached", params.timeoutMs);
        return paginate(resolveAll(target).map((element) => element.textContent ?? ""), params);
      }
      case "read_all": {
        const target = normalizeTarget(params);
        await waitForState(target, "attached", params.timeoutMs);
        const values = resolveAll(target).flatMap((element) => {
          const relative = params.relativeSelector
            ? Array.from(element.querySelectorAll(params.relativeSelector))
            : [element];
          return relative.map((candidate) => ({
            attributes: Object.fromEntries(Array.from(candidate.attributes).map((attribute) => [attribute.name, attribute.value])),
            inner_text: "innerText" in candidate ? (candidate as HTMLElement).innerText ?? "" : "",
            text_content: candidate.textContent ?? "",
            role: computedRole(candidate),
            accessible_name: accessibleName(candidate) || undefined,
          }));
        });
        return paginate(values, params);
      }
      case "get_attribute": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
        return { value: element.getAttribute(params.name ?? "") };
      }
      case "is_visible": return { value: resolveAll(normalizeTarget(params)).some(isVisible) };
      case "is_enabled": {
        const element = await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs });
        return { value: isEnabled(element) };
      }
      case "count": return { count: resolveAll(normalizeTarget(params)).length };
      case "wait_for": {
        await waitForState(normalizeTarget(params), params.state ?? "visible", params.timeoutMs);
        return {};
      }
      case "dom_snapshot": return { dom_snapshot: document.body?.innerText || document.body?.textContent || "" };
      case "element_info": return { elements: elementsAtPoint(params).map(describe) };
      case "visible_dom": {
        snapshotGeneration += 1;
        snapshotNodes = new Map();
        const limit = boundedInteger(params.limit, 500, SNAPSHOT_LIMIT_MAX);
        const elements = allComposedElements(document)
          .filter((element) => element.matches(INTERACTABLE_SELECTOR))
          .filter(isInViewport);
        const nodes = elements.slice(0, limit).map((element, index) => {
          const nodeId = `${snapshotGeneration}:${index + 1}`;
          snapshotNodes.set(nodeId, element);
          return { nodeId, ...describe(element) };
        });
        return {
          generation: snapshotGeneration,
          total: elements.length,
          returned: nodes.length,
          truncated: nodes.length < elements.length,
          nodes,
        };
      }
      case "node_point": return pointForElement(snapshotNode(snapshotNodes, params.nodeId));
      case "node_scroll": {
        const element = snapshotNode(snapshotNodes, params.nodeId);
        if ("scrollBy" in element && typeof (element as HTMLElement).scrollBy === "function") {
          (element as HTMLElement).scrollBy(params.scrollX ?? 0, params.scrollY ?? 0);
        } else {
          element.scrollIntoView({ block: "center", inline: "nearest" });
        }
        return {};
      }
      case "download_media_at_point": return triggerDownload(document.elementFromPoint(params.x ?? 0, params.y ?? 0));
      case "download_media_selector": return triggerDownload(await waitForStrict(normalizeTarget(params), { timeoutMs: params.timeoutMs }));
      case "node_download_media": return triggerDownload(snapshotNode(snapshotNodes, params.nodeId));
      case "clipboard_read_text": return { text: await navigator.clipboard.readText() };
      case "clipboard_write_text": await navigator.clipboard.writeText(params.text ?? ""); return {};
      case "clipboard_read": return readClipboard();
      case "clipboard_write": await writeClipboard(params.items ?? []); return {};
      default: throw new Error(`invalid_locator_action: ${action}`);
    }
  };

  return { version, buildHash, invoke, isVisible, isEnabled, isEditable };
}

function setNativeValue(element: Element, value: string): void {
  const tagName = element.tagName.toLowerCase();
  const view = element.ownerDocument.defaultView;
  if (tagName === "input") {
    Object.getOwnPropertyDescriptor(view?.HTMLInputElement.prototype ?? HTMLInputElement.prototype, "value")?.set?.call(element, value);
  } else if (tagName === "textarea") {
    Object.getOwnPropertyDescriptor(view?.HTMLTextAreaElement.prototype ?? HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
  } else if (Boolean((element as HTMLElement).isContentEditable)) {
    (element as HTMLElement).textContent = value;
  } else {
    throw new Error("element_not_editable");
  }
  dispatchFormEvent(element, "input", value);
  dispatchFormEvent(element, "change");
}

function dispatchFormEvent(element: Element, type: "input" | "change", value?: string): void {
  const view = element.ownerDocument.defaultView;
  if (type === "input" && typeof view?.InputEvent === "function") {
    element.dispatchEvent(new view.InputEvent(type, { bubbles: true, inputType: "insertText", data: value ?? null }));
    return;
  }
  const EventConstructor = view?.Event ?? Event;
  element.dispatchEvent(new EventConstructor(type, { bubbles: true }));
}

function pointForElement(element: Element) {
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const box = elementBox(element);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

function describe(element: Element) {
  const rawText = ("innerText" in element ? (element as HTMLElement).innerText : element.textContent) || element.textContent || "";
  const text = rawText.trim().replace(/\s+/g, " ");
  return {
    tagName: element.tagName.toLowerCase(),
    role: computedRole(element),
    text: text.slice(0, 500),
    textTruncated: text.length > 500 || undefined,
    originalTextChars: text.length > 500 ? text.length : undefined,
    ariaName: accessibleName(element) || undefined,
    href: element.tagName.toLowerCase() === "a" ? element.getAttribute("href") || undefined : undefined,
    type: element.getAttribute("type") || undefined,
    visible: isVisible(element),
    enabled: isEnabled(element),
    editable: isEditable(element),
    checked: "checked" in element ? Boolean((element as HTMLInputElement).checked) : undefined,
    boundingBox: elementBox(element),
  };
}

function elementsAtPoint(params: LocatorParams): Element[] {
  const x = params.x ?? 0;
  const y = params.y ?? 0;
  const values = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(x, y)
    : document.elementFromPoint(x, y) ? [document.elementFromPoint(x, y)!] : [];
  return values.slice(0, 10).filter((element) => params.includeNonInteractable || isVisible(element));
}

function paginate<T>(values: T[], params: LocatorParams) {
  const total = values.length;
  const offset = Math.min(total, Math.max(0, Math.trunc(Number(params.offset) || 0)));
  const limit = boundedInteger(params.limit, PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX);
  const page = values.slice(offset, offset + limit);
  return { values: page, total, offset, returned: page.length, has_more: offset + page.length < total };
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  return Math.min(maximum, Math.max(1, Math.trunc(Number(value) || fallback)));
}

function snapshotNode(nodes: Map<string, Element>, nodeId?: string): Element {
  const element = nodeId ? nodes.get(nodeId) : undefined;
  if (!element || !element.isConnected) throw new Error(`node_snapshot_stale: ${nodeId ?? ""}`);
  return element;
}

function triggerDownload(element: Element | null): { url: string } {
  if (!element) throw new Error("download_media_not_found");
  const media = element.closest("a[href],img,video,audio,source") ?? element;
  const candidate = media as HTMLAnchorElement & HTMLMediaElement & HTMLImageElement;
  const url = candidate.href || candidate.currentSrc || candidate.src;
  if (!url) throw new Error("download_media_not_found");
  const ownerDocument = media.ownerDocument;
  const anchor = ownerDocument.createElement("a");
  anchor.href = url;
  anchor.download = media.tagName.toLowerCase() === "a" ? candidate.download : "";
  anchor.style.display = "none";
  ownerDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return { url };
}

async function readClipboard() {
  const clipboardItems = await navigator.clipboard.read();
  const items = [];
  for (const clipboardItem of clipboardItems.slice(0, 8)) {
    const entries = [];
    for (const type of clipboardItem.types.slice(0, 8)) {
      const blob = await clipboardItem.getType(type);
      if (blob.size > 1024 * 1024) throw new Error("clipboard_item_too_large");
      if (type.startsWith("text/")) {
        entries.push({ mime_type: type, text: await blob.text() });
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      entries.push({ mime_type: type, base64: btoa(binary) });
    }
    items.push({ entries, presentation_style: clipboardItem.presentationStyle || "unspecified" });
  }
  return { items };
}

async function writeClipboard(items: ClipboardPayloadItem[]): Promise<void> {
  const clipboardItems = items.map((item) => {
    const values: Record<string, Blob> = {};
    for (const entry of item.entries ?? []) {
      const mimeType = entry.mimeType || entry.mime_type;
      if (!mimeType) throw new Error("clipboard_mime_type_required");
      if (typeof entry.text === "string") {
        values[mimeType] = new Blob([entry.text], { type: mimeType });
        continue;
      }
      const binary = atob(entry.base64 || "");
      if (binary.length > 1024 * 1024) throw new Error("clipboard_item_too_large");
      values[mimeType] = new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: mimeType });
    }
    const rawPresentationStyle = item.presentationStyle || item.presentation_style;
    const presentationStyle: PresentationStyle = rawPresentationStyle === "inline" || rawPresentationStyle === "attachment"
      ? rawPresentationStyle
      : "unspecified";
    return new ClipboardItem(values, { presentationStyle });
  });
  await navigator.clipboard.write(clipboardItems);
}
