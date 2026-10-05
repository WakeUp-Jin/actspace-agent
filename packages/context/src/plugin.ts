import { ContextAssembler, ContextAssemblerService } from "./assembly.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  const assembler = new ContextAssemblerService(ctx as never);
  ctx.provide?.("context.assembly.types", Object.freeze({ ContextAssembler, ContextAssemblerService, assembler }));
}
