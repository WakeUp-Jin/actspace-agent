import type { CordisContext } from "@actspace/cordis-adapter";
import { AgentApplication, type AgentApplicationContract } from "@actspace/agent-service";
import type { LlmService } from "@actspace/llm-service";
import { completeText } from "./complete-text.js";
import type { SessionTitleBehavior } from "./session-title.js";
export type { DesktopBrowsePage } from "@actspace/agent-service";
export type DesktopAppServiceContract = AgentApplicationContract & Pick<DesktopAppService, "completeText" | "dispose">;

/** Desktop utilities composed with the common application operations. */
export class DesktopAppService extends AgentApplication {
  readonly #llm: LlmService;
  readonly #titles: SessionTitleBehavior | undefined;
  constructor(ctx: CordisContext) {
    super(ctx, "desktop");
    const llm = ctx.get?.("llm.service") as LlmService | undefined;
    if (!llm) throw new Error("Desktop app requires llm.service.");
    this.#llm = llm;
    this.#titles = ctx.get?.("desktop.titles") as SessionTitleBehavior | undefined;
  }
  completeText(input: Parameters<typeof completeText>[1]) { return completeText(this.#llm, input); }
  override async isIdleForReconfigure(): Promise<boolean> {
    return !this.#titles?.busy && await super.isIdleForReconfigure() && !this.#titles?.busy;
  }
  async dispose(): Promise<void> { await this.#titles?.dispose(); }
}
