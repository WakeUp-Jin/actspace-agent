import { lazy } from "react";

let terminalRenderModule: ReturnType<typeof importTerminalRenderView> | undefined;

function importTerminalRenderView() {
  return import("./TerminalRenderView");
}

export function preloadTerminalRenderView() {
  terminalRenderModule ??= importTerminalRenderView().catch((error) => {
    terminalRenderModule = undefined;
    throw error;
  });
  return terminalRenderModule;
}

export const LazyTerminalRenderView = lazy(() => (
  preloadTerminalRenderView().then((module) => ({ default: module.TerminalRenderView }))
));
