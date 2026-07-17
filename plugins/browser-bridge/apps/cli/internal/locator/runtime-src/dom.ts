import type { ElementBox } from "./types";

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function textMatches(actual: string, expected: string, exact = false): boolean {
  const normalizedActual = normalizeWhitespace(actual);
  const normalizedExpected = normalizeWhitespace(expected);
  if (exact) return normalizedActual === normalizedExpected;
  return normalizedActual.toLocaleLowerCase().includes(normalizedExpected.toLocaleLowerCase());
}

export function elementBox(element: Element, includeFrameOffsets = true): ElementBox {
  const rect = element.getBoundingClientRect();
  let x = rect.left;
  let y = rect.top;
  if (includeFrameOffsets) {
    let view = element.ownerDocument.defaultView;
    while (view && view !== view.parent) {
      try {
        const frame = view.frameElement;
        if (!frame) break;
        const frameRect = frame.getBoundingClientRect();
        x += frameRect.left + (frame as HTMLElement).clientLeft;
        y += frameRect.top + (frame as HTMLElement).clientTop;
        view = frame.ownerDocument.defaultView;
      } catch {
        break;
      }
    }
  }
  return { x, y, width: rect.width, height: rect.height };
}

export function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element) ?? getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isInViewport(element: Element): boolean {
  if (!isVisible(element)) return false;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

export function isEnabled(element: Element): boolean {
  if (element.getAttribute("aria-disabled") === "true" || element.closest('[aria-disabled="true"]')) return false;
  if ("disabled" in element && Boolean((element as Element & { disabled?: boolean }).disabled)) return false;
  const disabledFieldset = element.closest("fieldset:disabled");
  if (disabledFieldset && !element.closest("legend")?.isSameNode(disabledFieldset.querySelector("legend"))) return false;
  return true;
}

export function isEditable(element: Element): boolean {
  if (!isEnabled(element)) return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "textarea") return !(element as HTMLTextAreaElement).readOnly;
  if (tagName === "input") {
    const input = element as HTMLInputElement;
    return !input.readOnly && !["button", "checkbox", "file", "hidden", "image", "radio", "reset", "submit"].includes(input.type);
  }
  return Boolean((element as HTMLElement).isContentEditable);
}

export function allComposedElements(root: Document | ShadowRoot | Element): Element[] {
  const values: Element[] = [];
  const visit = (container: Document | ShadowRoot | Element): void => {
    for (const child of Array.from(container.children)) {
      values.push(child);
      if (child.shadowRoot) visit(child.shadowRoot);
      visit(child);
    }
  };
  visit(root);
  return values;
}

export function queryCSSComposed(root: Document | ShadowRoot | Element, selector: string): Element[] {
  const matches: Element[] = [];
  const seen = new Set<Element>();
  const visit = (container: Document | ShadowRoot | Element): void => {
    for (const element of Array.from(container.querySelectorAll(selector))) {
      if (!seen.has(element)) {
        seen.add(element);
        matches.push(element);
      }
    }
    for (const element of Array.from(container.querySelectorAll("*"))) {
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  try {
    visit(root);
    return matches;
  } catch (error) {
    throw new Error(`unsupported_selector: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function composedText(element: Element): string {
  const parts: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? "");
      return;
    }
    const isElementNode = node.nodeType === 1;
    const isShadowRootNode = node.nodeType === 11 && "host" in node;
    if (!isElementNode && !isShadowRootNode) return;
    const nodeElement = isElementNode ? node as Element : undefined;
    if (nodeElement && (nodeElement.hasAttribute("hidden") || nodeElement.getAttribute("aria-hidden") === "true")) return;
    if (nodeElement?.tagName.toLowerCase() === "slot" && "assignedNodes" in nodeElement) {
      const assigned = (nodeElement as HTMLSlotElement).assignedNodes({ flatten: true });
      for (const assignedNode of assigned.length > 0 ? assigned : Array.from(node.childNodes)) visit(assignedNode);
      return;
    }
    for (const child of Array.from(node.childNodes)) visit(child);
    if (nodeElement?.shadowRoot) visit(nodeElement.shadowRoot);
  };
  visit(element);
  return normalizeWhitespace(parts.join(" "));
}

export function isComposedAncestor(ancestor: Element, candidate: Element | null): boolean {
  let current: Node | null = candidate;
  while (current) {
    if (current === ancestor) return true;
    const root = current.getRootNode();
    current = current.parentNode ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}

export function receivesEvents(element: Element): boolean {
  const ownerDocument = element.ownerDocument;
  if (typeof ownerDocument.elementFromPoint !== "function") return true;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = ownerDocument.elementFromPoint(x, y);
  return hit === element || isComposedAncestor(element, hit) || isComposedAncestor(hit ?? element, element);
}

export async function isStable(element: Element): Promise<boolean> {
  const first = elementBox(element);
  await nextAnimationFrame();
  const second = elementBox(element);
  await nextAnimationFrame();
  const third = elementBox(element);
  return sameBox(first, second) && sameBox(second, third);
}

export function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sameBox(left: ElementBox, right: ElementBox): boolean {
  const epsilon = 0.25;
  return Math.abs(left.x - right.x) <= epsilon
    && Math.abs(left.y - right.y) <= epsilon
    && Math.abs(left.width - right.width) <= epsilon
    && Math.abs(left.height - right.height) <= epsilon;
}
