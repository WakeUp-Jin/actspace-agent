import { composedText, normalizeWhitespace } from "./dom";

const FORM_CONTROL_SELECTOR = "button,input,meter,output,progress,select,textarea";

export function computedRole(element: Element): string | undefined {
  const explicit = element.getAttribute("role")?.trim().split(/\s+/).find(Boolean);
  if (explicit && explicit !== "none" && explicit !== "presentation") return explicit;

  const tagName = element.tagName.toLowerCase();
  switch (tagName) {
    case "a": return element.hasAttribute("href") ? "link" : undefined;
    case "article": return "article";
    case "aside": return "complementary";
    case "button": return "button";
    case "dialog": return "dialog";
    case "footer": return "contentinfo";
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": return "heading";
    case "header": return "banner";
    case "img": return element.getAttribute("alt") === "" ? undefined : "img";
    case "li": return "listitem";
    case "main": return "main";
    case "nav": return "navigation";
    case "ol": case "ul": return "list";
    case "option": return "option";
    case "progress": return "progressbar";
    case "section": return accessibleName(element) ? "region" : undefined;
    case "select": {
      const select = element as HTMLSelectElement;
      return select.multiple || select.size > 1 ? "listbox" : "combobox";
    }
    case "summary": return "button";
    case "table": return "table";
    case "textarea": return "textbox";
    case "input": return inputRole(element as HTMLInputElement);
    default: return undefined;
  }
}

export function accessibleName(element: Element, visited = new Set<Element>()): string {
  if (visited.has(element)) return "";
  visited.add(element);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const referenced = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id))
      .filter((value): value is HTMLElement => value !== null);
    const value = normalizeWhitespace(referenced.map((item) => textAlternative(item, visited, true)).join(" "));
    if (value) return value;
  }

  const ariaLabel = normalizeWhitespace(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const labels = labelsFor(element);
  if (labels.length > 0) {
    const value = normalizeWhitespace(labels.map((label) => textAlternative(label, visited, false)).join(" "));
    if (value) return value;
  }

  if (element.tagName.toLowerCase() === "img") {
    const alt = normalizeWhitespace((element as HTMLImageElement).alt);
    if (alt) return alt;
  }
  if (element.tagName.toLowerCase() === "input") {
    const input = element as HTMLInputElement;
    if (input.type === "image") return normalizeWhitespace(input.alt || input.title);
    if (["button", "reset", "submit"].includes(input.type)) return normalizeWhitespace(input.value);
  }

  const role = computedRoleWithoutNameRecursion(element);
  if (role && nameFromContent(role)) {
    const value = textAlternative(element, visited, false);
    if (value) return value;
  }

  const title = normalizeWhitespace(element.getAttribute("title"));
  if (title) return title;
  return "";
}

export function labelsFor(element: Element): HTMLLabelElement[] {
  if (!element.matches(FORM_CONTROL_SELECTOR)) return [];
  const nativeLabels = "labels" in element ? Array.from((element as HTMLInputElement).labels ?? []) : [];
  if (nativeLabels.length > 0) return nativeLabels;

  const values: HTMLLabelElement[] = [];
  const parent = element.closest("label");
  if (parent?.tagName.toLowerCase() === "label") values.push(parent as HTMLLabelElement);
  const id = element.getAttribute("id");
  if (id) {
    for (const label of Array.from(element.ownerDocument.querySelectorAll("label"))) {
      if (label.htmlFor === id && !values.includes(label)) values.push(label);
    }
  }
  return values;
}

function textAlternative(element: Element, visited: Set<Element>, referenced: boolean): string {
  if (!referenced && (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true")) return "";
  const nestedLabel = normalizeWhitespace(element.getAttribute("aria-label"));
  if (nestedLabel) return nestedLabel;
  if (element.tagName.toLowerCase() === "img") return normalizeWhitespace((element as HTMLImageElement).alt);
  const direct = composedText(element);
  if (direct) return direct;
  return accessibleName(element, visited);
}

function inputRole(input: HTMLInputElement): string | undefined {
  switch (input.type) {
    case "button": case "image": case "reset": case "submit": return "button";
    case "checkbox": return "checkbox";
    case "number": return "spinbutton";
    case "radio": return "radio";
    case "range": return "slider";
    case "search": return "searchbox";
    case "email": case "tel": case "text": case "url": return input.hasAttribute("list") ? "combobox" : "textbox";
    default: return undefined;
  }
}

function computedRoleWithoutNameRecursion(element: Element): string | undefined {
  if (element.tagName.toLowerCase() === "section") return undefined;
  return computedRole(element);
}

function nameFromContent(role: string): boolean {
  return new Set([
    "button", "cell", "checkbox", "columnheader", "gridcell", "heading", "link", "listitem",
    "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "row", "rowheader", "switch", "tab", "tooltip", "treeitem",
  ]).has(role);
}
