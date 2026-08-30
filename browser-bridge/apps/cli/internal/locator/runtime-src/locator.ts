import { accessibleName, computedRole, labelsFor } from "./accessibility";
import {
  allComposedElements,
  composedText,
  delay,
  elementBox,
  isEditable,
  isEnabled,
  isStable,
  isVisible,
  queryCSSComposed,
  receivesEvents,
  textMatches,
} from "./dom";
import type { ActionPoint, ActionabilityState, LocatorParams, LocatorTarget } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;

export function normalizeTarget(params: LocatorParams): LocatorTarget {
  if (params.target) return normalizeStructuredTarget(params.target);
  if (params.selector) return { kind: "css", value: params.selector };
  throw new Error("locator_target_required: provide target or selector");
}

export function resolveAll(target: LocatorTarget): Element[] {
  const { root, leafTarget } = resolveFramePath(target);
  return resolveWithin(root, leafTarget);
}

export async function waitForStrict(
  target: LocatorTarget,
  options: { timeoutMs?: number; actionable?: boolean; editable?: boolean } = {},
): Promise<Element> {
  const timeoutMs = normalizedTimeout(options.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let lastReason = "selector_not_found";
  let lastCount = 0;

  while (Date.now() <= deadline) {
    const matches = resolveAll(target);
    lastCount = matches.length;
    const strict = strictCandidate(matches);
    if (!strict.element) {
      lastReason = strict.reason;
      await delay(50);
      continue;
    }

    if (!options.actionable && !options.editable) return strict.element;
    strict.element.scrollIntoView({ block: "center", inline: "nearest" });
    const state = await actionability(strict.element);
    const acceptable = state.visible
      && state.enabled
      && state.stable
      && state.receivesEvents
      && (!options.editable || state.editable);
    if (acceptable) return strict.element;
    lastReason = state.reason ?? "element_not_actionable";
    await delay(50);
  }

  throw new Error(`locator_timeout: ${describeTarget(target)}; matches=${lastCount}; reason=${lastReason}`);
}

export async function waitForState(
  target: LocatorTarget,
  state: "attached" | "detached" | "visible" | "hidden",
  timeoutMs?: number,
): Promise<void> {
  const deadline = Date.now() + normalizedTimeout(timeoutMs);
  let lastCount = 0;
  while (Date.now() <= deadline) {
    const matches = resolveAll(target);
    lastCount = matches.length;
    const hasVisible = matches.some(isVisible);
    if (state === "attached" && matches.length > 0) return;
    if (state === "detached" && matches.length === 0) return;
    if (state === "visible" && hasVisible) return;
    if (state === "hidden" && (matches.length === 0 || !hasVisible)) return;
    await delay(50);
  }
  throw new Error(`locator_timeout: ${describeTarget(target)} did not become ${state}; matches=${lastCount}`);
}

export async function actionPoint(target: LocatorTarget, timeoutMs?: number, localCoordinates = false): Promise<ActionPoint> {
  const element = await waitForStrict(target, { timeoutMs, actionable: true });
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const state = await actionability(element);
  if (!state.visible) throw new Error("element_not_visible");
  if (!state.enabled) throw new Error("element_disabled");
  if (!state.receivesEvents) throw new Error("element_intercepted");
  if (!state.stable) throw new Error("element_not_stable");
  const box = elementBox(element, !localCoordinates);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

export async function actionability(element: Element): Promise<ActionabilityState> {
  const visible = isVisible(element);
  if (!visible) return { visible, enabled: isEnabled(element), editable: isEditable(element), stable: false, receivesEvents: false, reason: "element_not_visible" };
  const enabled = isEnabled(element);
  if (!enabled) return { visible, enabled, editable: false, stable: false, receivesEvents: false, reason: "element_disabled" };
  const stable = await isStable(element);
  if (!stable) return { visible, enabled, editable: isEditable(element), stable, receivesEvents: false, reason: "element_not_stable" };
  const canReceiveEvents = receivesEvents(element);
  return {
    visible,
    enabled,
    editable: isEditable(element),
    stable,
    receivesEvents: canReceiveEvents,
    ...(canReceiveEvents ? {} : { reason: "element_intercepted" }),
  };
}

export function describeTarget(target: LocatorTarget): string {
  const framePrefix = target.framePath?.length ? `frames=${target.framePath.length} ` : "";
  switch (target.kind) {
    case "role": return `${framePrefix}role=${target.role ?? target.value ?? ""} name=${target.name ?? ""}`.trim();
    case "text": return `${framePrefix}text=${target.value ?? target.name ?? ""}`;
    case "label": return `${framePrefix}label=${target.value ?? target.name ?? ""}`;
    case "placeholder": return `${framePrefix}placeholder=${target.value ?? target.name ?? ""}`;
    case "test_id": return `${framePrefix}test_id=${target.value ?? ""}`;
    case "css": return `${framePrefix}css=${target.value ?? ""}`;
  }
}

function resolveFramePath(target: LocatorTarget): { root: Document | ShadowRoot | Element; leafTarget: LocatorTarget } {
  let root: Document | ShadowRoot | Element = document;
  for (const rawFrameTarget of target.framePath ?? []) {
    const frameTarget = normalizeStructuredTarget({ ...rawFrameTarget, framePath: undefined });
    const frameMatches = resolveWithin(root, frameTarget);
    const frame = strictCandidate(frameMatches).element;
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error(`frame_not_found: ${describeTarget(frameTarget)}`);
    }
    let frameDocument: Document | null = null;
    try {
      frameDocument = frame.contentDocument;
    } catch {
      frameDocument = null;
    }
    if (!frameDocument) throw new Error(`frame_cross_origin: ${describeTarget(frameTarget)}`);
    root = frameDocument;
  }
  return { root, leafTarget: { ...target, framePath: undefined } };
}

function resolveWithin(root: Document | ShadowRoot | Element, target: LocatorTarget): Element[] {
  switch (target.kind) {
    case "css": {
      const selector = requiredValue(target, "css");
      return queryCSSComposed(root, selector);
    }
    case "role": {
      const role = target.role ?? target.value;
      if (!role) throw new Error("invalid_locator_target: role target requires role");
      return allComposedElements(root).filter((element) => {
        if (computedRole(element) !== role) return false;
        if (target.name === undefined) return true;
        return textMatches(accessibleName(element), target.name, target.exact);
      });
    }
    case "text": {
      const expected = target.value ?? target.name;
      if (!expected) throw new Error("invalid_locator_target: text target requires value");
      const matches = allComposedElements(root).filter((element) => textMatches(composedText(element), expected, target.exact));
      return matches.filter((element) => !Array.from(element.children).some((child) => matches.includes(child)));
    }
    case "label": {
      const expected = target.value ?? target.name;
      if (!expected) throw new Error("invalid_locator_target: label target requires value");
      return allComposedElements(root).filter((element) => labelsFor(element).some((label) => textMatches(composedText(label), expected, target.exact)));
    }
    case "placeholder": {
      const expected = target.value ?? target.name;
      if (!expected) throw new Error("invalid_locator_target: placeholder target requires value");
      return allComposedElements(root).filter((element) => textMatches(element.getAttribute("placeholder") ?? "", expected, target.exact));
    }
    case "test_id": {
      const expected = requiredValue(target, "test_id");
      return allComposedElements(root).filter((element) => element.getAttribute("data-testid") === expected);
    }
  }
}

function strictCandidate(matches: Element[]): { element?: Element; reason: string } {
  if (matches.length === 1) return { element: matches[0], reason: "ok" };
  const visible = matches.filter(isVisible);
  if (visible.length === 1) return { element: visible[0], reason: "ok" };
  if (matches.length === 0) return { reason: "selector_not_found" };
  return { reason: `selector_ambiguous:${matches.length}` };
}

function normalizeStructuredTarget(target: LocatorTarget): LocatorTarget {
  const rawKind = String(target.kind ?? "").toLowerCase();
  const kind = rawKind === "testid" || rawKind === "test-id" ? "test_id" : rawKind;
  if (!["css", "role", "text", "label", "placeholder", "test_id"].includes(kind)) {
    throw new Error(`invalid_locator_target: unsupported kind ${target.kind}`);
  }
  return { ...target, kind: kind as LocatorTarget["kind"] };
}

function requiredValue(target: LocatorTarget, kind: string): string {
  if (!target.value) throw new Error(`invalid_locator_target: ${kind} target requires value`);
  return target.value;
}

function normalizedTimeout(timeoutMs?: number): number {
  const value = Number(timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(60_000, Math.max(1, Math.trunc(value)));
}
