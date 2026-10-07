import { useCallback } from "react";
import { SPACE_DEMO_ENABLED } from "./space-demo-enabled";
import { useSpaceDemoActions, useSpaceDemoSelector } from "./model/use-space-demo";

export interface SpacePanelBinding {
  /** 当前页面有没有右栏（名册页没有）。 */
  available: boolean;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  openPanel: () => void;
  closePanel: () => void;
}

function useLiveSpacePanelBinding(): SpacePanelBinding {
  const available = useSpaceDemoSelector((state) => state.view !== "roster");
  const isOpen = useSpaceDemoSelector((state) => state.panelOpen) && available;
  const { setPanelOpen } = useSpaceDemoActions();
  const openPanel = useCallback(() => setPanelOpen(true), [setPanelOpen]);
  const closePanel = useCallback(() => setPanelOpen(false), [setPanelOpen]);
  return { available, isOpen, setOpen: setPanelOpen, openPanel, closePanel };
}

const noop = () => {};
const DISABLED_BINDING: SpacePanelBinding = { available: false, isOpen: false, setOpen: noop, openPanel: noop, closePanel: noop };

function useDisabledSpacePanelBinding(): SpacePanelBinding {
  return DISABLED_BINDING;
}

/**
 * Space 演示的右栏开关，记在它自己的 store 里。
 * 生产构建里 SPACE_DEMO_ENABLED 是常量 false，这里只剩空实现，store 和 fixtures 不会进包。
 */
export const useSpacePanelBinding = SPACE_DEMO_ENABLED ? useLiveSpacePanelBinding : useDisabledSpacePanelBinding;
