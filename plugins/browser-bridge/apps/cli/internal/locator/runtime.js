(() => {
  const VERSION = "4";
  if (window.__actspaceLocator?.version === VERSION) return;

  let snapshotGeneration = 0;
  let snapshotNodes = new Map();

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function isInViewport(element) {
    if (!isVisible(element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function isEnabled(element) {
    return !("disabled" in element && element.disabled) && element.getAttribute("aria-disabled") !== "true";
  }

  function isEditable(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable;
  }

  function locateAll(selector, root = document) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (error) {
      throw new Error(`unsupported_selector: ${error.message}`);
    }
  }

  function locateStrict(selector) {
    const matches = locateAll(selector);
    if (matches.length === 1) return matches[0];
    const visible = matches.filter(isVisible);
    if (visible.length === 1) return visible[0];
    if (matches.length === 0) throw new Error(`selector_not_found: ${selector}`);
    throw new Error(`selector_ambiguous: ${selector} matched ${matches.length} elements`);
  }

  function point(element) {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
  }

  function setNativeValue(element, value) {
    if (element instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    } else if (element instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
    } else if (element.isContentEditable) {
      element.textContent = value;
    } else {
      throw new Error("element_not_editable");
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function describe(element) {
    const rect = element.getBoundingClientRect();
    const rawText = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
    return {
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || undefined,
      text: rawText.slice(0, 500),
      textTruncated: rawText.length > 500 || undefined,
      originalTextChars: rawText.length > 500 ? rawText.length : undefined,
      ariaName: element.getAttribute("aria-label") || undefined,
      href: element instanceof HTMLAnchorElement ? element.getAttribute("href") || undefined : undefined,
      type: element.getAttribute("type") || undefined,
      visible: isVisible(element),
      enabled: isEnabled(element),
      editable: isEditable(element),
      checked: "checked" in element ? Boolean(element.checked) : undefined,
      boundingBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    };
  }

  function visibleDom(limit = 500) {
    snapshotGeneration += 1;
    snapshotNodes = new Map();
    const selector = "a,button,input,textarea,select,summary,details,label,img,video,audio,[role],[onclick],[contenteditable=true],[tabindex],[draggable=true]";
    const normalizedLimit = Math.min(1000, Math.max(1, Math.trunc(Number(limit) || 500)));
    const visibleElements = locateAll(selector).filter(isInViewport);
    const nodes = [];
    for (const element of visibleElements.slice(0, normalizedLimit)) {
      const nodeId = `${snapshotGeneration}:${nodes.length + 1}`;
      snapshotNodes.set(nodeId, element);
      nodes.push({ nodeId, ...describe(element) });
    }
    return {
      generation: snapshotGeneration,
      total: visibleElements.length,
      returned: nodes.length,
      truncated: nodes.length < visibleElements.length,
      nodes,
    };
  }

  function paginate(values, params) {
    const total = values.length;
    const offset = Math.min(total, Math.max(0, Math.trunc(Number(params.offset) || 0)));
    const limit = Math.min(1000, Math.max(1, Math.trunc(Number(params.limit) || 200)));
    const page = values.slice(offset, offset + limit);
    return {
      values: page,
      total,
      offset,
      returned: page.length,
      has_more: offset + page.length < total,
    };
  }

  function snapshotNode(nodeId) {
    const element = snapshotNodes.get(nodeId);
    if (!element || !element.isConnected) throw new Error(`node_snapshot_stale: ${nodeId}`);
    return element;
  }

  function triggerDownload(element) {
    if (!element) throw new Error("download_media_not_found");
    const media = element.closest?.("a[href],img,video,audio,source") || element;
    const url = media.href || media.currentSrc || media.src;
    if (!url) throw new Error("download_media_not_found");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = media.download || "";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { url };
  }

  async function clipboardRead() {
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

  async function clipboardWrite(items) {
    const clipboardItems = (items || []).map((item) => {
      const values = {};
      for (const entry of item.entries || []) {
        const mimeType = entry.mimeType || entry.mime_type;
        if (!mimeType) throw new Error("clipboard_mime_type_required");
        if (typeof entry.text === "string") {
          values[mimeType] = new Blob([entry.text], { type: mimeType });
          continue;
        }
        const binary = atob(entry.base64 || "");
        if (binary.length > 1024 * 1024) throw new Error("clipboard_item_too_large");
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        values[mimeType] = new Blob([bytes], { type: mimeType });
      }
      return new ClipboardItem(values, { presentationStyle: item.presentationStyle || item.presentation_style || "unspecified" });
    });
    await navigator.clipboard.write(clipboardItems);
    return {};
  }

  async function waitFor(selector, state, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const matches = locateAll(selector);
      const visible = matches.some(isVisible);
      if (state === "attached" && matches.length > 0) return {};
      if (state === "detached" && matches.length === 0) return {};
      if (state === "visible" && visible) return {};
      if (state === "hidden" && (matches.length === 0 || !visible)) return {};
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`locator_timeout: ${selector} did not become ${state}`);
  }

  async function invoke(action, params) {
    switch (action) {
      case "point": return point(locateStrict(params.selector));
      case "fill": {
        const element = locateStrict(params.selector);
        if (!isVisible(element)) throw new Error("element_not_visible");
        if (!isEnabled(element)) throw new Error("element_disabled");
        setNativeValue(element, params.value);
        return {};
      }
      case "focus": locateStrict(params.selector).focus(); return {};
      case "select_option": {
        const element = locateStrict(params.selector);
        if (!(element instanceof HTMLSelectElement)) throw new Error("element_not_select");
        const selections = params.selections || [];
        const selected = [];
        for (const option of Array.from(element.options)) {
          const match = selections.some((selection) => selection.value === option.value || selection.label === option.label || selection.valueOrLabel === option.value || selection.valueOrLabel === option.label);
          option.selected = match;
          if (match) selected.push(option.value);
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { values: selected };
      }
      case "set_checked": {
        const element = locateStrict(params.selector);
        if (!(element instanceof HTMLInputElement) || !["checkbox", "radio"].includes(element.type)) throw new Error("element_not_checkable");
        if (element.type === "radio" && params.checked === false) throw new Error("radio_cannot_uncheck");
        return { value: element.checked, point: point(element) };
      }
      case "checked_state": {
        const element = locateStrict(params.selector);
        if (!(element instanceof HTMLInputElement) || !["checkbox", "radio"].includes(element.type)) throw new Error("element_not_checkable");
        return { value: element.checked };
      }
      case "inner_text": return { value: locateStrict(params.selector).innerText };
      case "text_content": return { value: locateStrict(params.selector).textContent };
      case "all_text_contents": return paginate(locateAll(params.selector).map((element) => element.textContent || ""), params);
      case "read_all": return paginate(locateAll(params.selector).map((element) => ({ attributes: Object.fromEntries(Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value])), inner_text: element.innerText || "", text_content: element.textContent || "" })), params);
      case "get_attribute": return { value: locateStrict(params.selector).getAttribute(params.name) };
      case "is_visible": return { value: locateAll(params.selector).some(isVisible) };
      case "is_enabled": return { value: isEnabled(locateStrict(params.selector)) };
      case "count": return { count: locateAll(params.selector).length };
      case "wait_for": return waitFor(params.selector, params.state, params.timeoutMs || 10000);
      case "dom_snapshot": return { dom_snapshot: document.body?.innerText || "" };
      case "element_info": return { elements: document.elementsFromPoint(params.x, params.y).slice(0, 10).filter((element) => params.includeNonInteractable || isVisible(element)).map(describe) };
      case "visible_dom": return visibleDom(params.limit || 500);
      case "node_point": return point(snapshotNode(params.nodeId));
      case "node_scroll": snapshotNode(params.nodeId).scrollBy(params.scrollX || 0, params.scrollY || 0); return {};
      case "download_media_at_point": return triggerDownload(document.elementFromPoint(params.x, params.y));
      case "download_media_selector": return triggerDownload(locateStrict(params.selector));
      case "node_download_media": return triggerDownload(snapshotNode(params.nodeId));
      case "clipboard_read_text": return { text: await navigator.clipboard.readText() };
      case "clipboard_write_text": await navigator.clipboard.writeText(params.text || ""); return {};
      case "clipboard_read": return clipboardRead();
      case "clipboard_write": return clipboardWrite(params.items || []);
      default: throw new Error(`invalid_locator_action: ${action}`);
    }
  }

  window.__actspaceLocator = { version: VERSION, invoke, isVisible, isEnabled, isEditable };
})();
