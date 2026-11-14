import { getService, serviceKey, type CordisContext } from "@actspace/cordis-adapter";
import { AgentApplication, type AgentApplicationContract } from "@actspace/agent-service";
import { LLM_SERVICE, type LlmServiceContract } from "@actspace/llm-service";
import { completeText } from "./complete-text.js";
import { DESKTOP_TITLES_SERVICE, type SessionTitleBehavior } from "./session-title.js";
export type { DesktopBrowsePage } from "@actspace/agent-service";
export type DesktopAppServiceContract = AgentApplicationContract & Pick<DesktopAppService, "completeText" | "dispose">;
export const DESKTOP_APP_SERVICE = serviceKey<DesktopAppServiceContract>("desktop.app");

/** Desktop utilities composed with the common application operations. */
export class DesktopAppService extends AgentApplication {
  readonly #llm: LlmServiceContract;
  readonly #titles: SessionTitleBehavior | undefined;
  constructor(ctx: CordisContext) {
    super(ctx, "desktop");
    const llm = getService(ctx, LLM_SERVICE);
    if (!llm) throw new Error("Desktop app requires llm.service.");
    this.#llm = llm;
    this.#titles = getService(ctx, DESKTOP_TITLES_SERVICE);
  }
  completeText(input: Parameters<typeof completeText>[1]) {
    return completeText(this.#llm, input);
  }
  override async isIdleForReconfigure(): Promise<boolean> {
    return !this.#titles?.busy && (await super.isIdleForReconfigure()) && !this.#titles?.busy;
  }
  async dispose(): Promise<void> {
    await this.#titles?.dispose();
  }
}
