import { ContextAssembler, ContextAssemblerService } from "./assembly.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  const assembler = new ContextAssemblerService(ctx as never);
  ctx.provide?.("context.assembly.types", Object.freeze({ ContextAssembler, ContextAssemblerService, assembler }));
}

export function activate() {
  return { services: { "context.assembly": Object.freeze({ ContextAssembler }) }, dispose: () => undefined };
}
