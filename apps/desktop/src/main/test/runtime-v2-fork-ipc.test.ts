import { afterEach, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel), on: vi.fn(), removeListener: vi.fn(),
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";
import { trustedWindow } from "./ipc-sender-fixture";

const trusted = trustedWindow();
afterEach(() => handlers.clear());

function setup() {
  const forkSession = vi.fn(async (input: { newSessionId: string }) => ({ sessionId: input.newSessionId }));
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/fork-ipc", workspaceRoot: "/tmp/fork-ipc" },
    registry: {
      subscribe: () => () => {}, subscribeRendererStream: () => () => {},
      inspectSession: async () => ({ throughJournalSeq: 42 }),
      forkSession, readSessionProjection: async ({ sessionId }: { sessionId: string }) => ({ sessionId }),
    },
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => trusted.window,
  } as unknown as FixedRendererIpcOptions);
  const handler = handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.forkSession)!;
  return { registration, forkSession, fork: (input: Record<string, unknown>) => handler(trusted.event, input) };
}

it("forks a whole session at the current journal end", async () => {
  const { registration, forkSession, fork } = setup();
  try {
    await fork({ sessionId: "parent" });
    expect(forkSession).toHaveBeenCalledWith({ parentSessionId: "parent", boundarySeq: 42, newSessionId: expect.any(String) });
  } finally { registration.dispose?.(); }
});

it("forks from an assistant reply by passing its turnId to the Host instead of a journal position", async () => {
  const { registration, forkSession, fork } = setup();
  try {
    await fork({ sessionId: "parent", turnId: "turn-3" });
    const input = forkSession.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ parentSessionId: "parent", turnId: "turn-3" });
    expect("boundarySeq" in input).toBe(false);
  } finally { registration.dispose?.(); }
});
