import { containNotification, type CordisContext } from "@actspace/cordis-adapter";
import type { PromptHostPort } from "@actspace/prompt";
import type { SessionHeaderV1 } from "@actspace/session-journal";
import { PLUGIN_ID, PROMPT_ID, SIDE_CHAT_SECTION } from "./prompt.js";

type SessionRuntime = { getOpen(sessionId: string): { readonly header: SessionHeaderV1 } | undefined };

export const inject = Object.freeze(["session.runtime"]);

/** Gives every live side chat its boundary prompt; nothing is written to the Journal. */
export class SideChatService {
  private readonly registrations = new Map<string, () => void>();
  private readonly removeListeners: Array<() => void> = [];

  constructor(private readonly ctx: CordisContext) {
    const created = ctx.on?.("session/created", containNotification(ctx, (payload: { sessionId: string }) => this.attach(payload.sessionId)));
    const disposed = ctx.on?.("session/disposed", containNotification(ctx, (payload: { sessionId: string }) => this.detach(payload.sessionId)));
    for (const remove of [created, disposed]) if (typeof remove === "function") this.removeListeners.push(remove as () => void);
  }

  isAttached(sessionId: string): boolean { return this.registrations.has(sessionId); }

  private attach(sessionId: string): void {
    if (this.registrations.has(sessionId)) return;
    const session = (this.ctx.get?.("session.runtime") as SessionRuntime | undefined)?.getOpen(sessionId);
    if (session?.header.lineage?.origin !== "side-chat") return;
    const extensions = (this.ctx.get?.("actspace.host.prompt") as PromptHostPort | undefined)?.extensions;
    if (!extensions) throw new Error("Side chat prompt requires actspace.host.prompt extensions.");
    this.registrations.set(sessionId, extensions.registerMainSession(sessionId, {
      id: PROMPT_ID, owner: PLUGIN_ID, order: 100, criticality: "optional", fields: ["system"],
      get: (_context, write) => { write({ system: { sections: [{ id: PROMPT_ID, owner: PLUGIN_ID, order: 4900, content: SIDE_CHAT_SECTION }], modelFacts: [] } }); },
    }));
  }

  private detach(sessionId: string): void {
    this.registrations.get(sessionId)?.();
    this.registrations.delete(sessionId);
  }

  dispose(): void {
    for (const remove of this.removeListeners.splice(0)) remove();
    for (const remove of this.registrations.values()) remove();
    this.registrations.clear();
  }
}

export function apply(ctx: CordisContext): void {
  const service = new SideChatService(ctx);
  ctx.provide?.("side-chat", service);
  ctx.effect?.(() => () => service.dispose(), "side-chat");
}
