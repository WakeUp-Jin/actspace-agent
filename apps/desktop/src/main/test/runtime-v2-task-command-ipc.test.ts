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

afterEach(() => { handlers.clear(); });

it.each([
  { op: "designate", sessionId: "s", taskId: "t", runId: "r", revision: 4 },
  { op: "designate", sessionId: "s", taskId: "t", runId: null, revision: 5 },
  { op: "cancel", sessionId: "s", taskId: "t", revision: 6 },
])("forwards task command with revision and validates the renderer sender: $op", async input => {
  const taskCommand = vi.fn(async () => ({ snapshot: { revision: input.revision + 1 } }));
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/tasks", workspaceRoot: "/tmp" },
    registry: { subscribe: () => () => {}, subscribeRendererStream: () => () => {}, taskCommand },
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => trusted.window,
  } as unknown as FixedRendererIpcOptions);
  try {
    const command = handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.taskCommand)!;
    await expect(command(trusted.event, input)).resolves.toMatchObject({ snapshot: { revision: input.revision + 1 } });
    expect(taskCommand).toHaveBeenCalledWith(input);
    taskCommand.mockClear();
    await expect(Promise.resolve().then(() => command({ ...trusted.event, sender: { id: 8 } }, input))).rejects.toThrow();
    expect(taskCommand).not.toHaveBeenCalled();
  } finally { registration.dispose(); }
});
