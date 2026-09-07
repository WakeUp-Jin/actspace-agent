// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DesktopSpeechPlayback } from "../speech-playback";

it("cancels the actual player lifecycle and removes private temporary audio on success and error", async () => {
  const root = await mkdtemp(join(tmpdir(), "speech-player-test-"));
  const children: Array<EventEmitter & { kill: ReturnType<typeof vi.fn> }> = [];
  const spawn = vi.fn(() => { const child = Object.assign(new EventEmitter(), { kill: vi.fn(() => { queueMicrotask(() => child.emit("close", null)); return true; }) }); children.push(child); return child; });
  const player = new DesktopSpeechPlayback(root, {} as any, spawn as any, "darwin");
  try {
    const controller = new AbortController();
    const first = player.play(new Uint8Array([1, 2]), controller.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    const [command, args, options] = spawn.mock.calls[0] as unknown as [string, string[], unknown];
    expect(command).toBe("afplay"); expect(options).toEqual({ stdio: "ignore" });
    expect(await readFile(args[0])).toEqual(Buffer.from([1, 2]));
    controller.abort(); await first; await player.stop();
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
    expect(await readdir(join(root, "english-learning-audio"))).toEqual([]);
    const second = player.play(new Uint8Array([3]), new AbortController().signal);
    const rejected = expect(second).rejects.toThrow("播放失败");
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    children[1].emit("error", new Error("internal path canary"));
    await rejected;
    expect(await readdir(join(root, "english-learning-audio"))).toEqual([]);
    const stalled = player.play(new Uint8Array([4]), new AbortController().signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
    children[2].kill.mockImplementation(() => true);
    await player.dispose(); await player.dispose();
    await stalled;
    expect(children[2].kill).toHaveBeenCalledWith("SIGKILL");
    expect(await readdir(join(root, "english-learning-audio"))).toEqual([]);
    await expect(player.play(new Uint8Array([1]), new AbortController().signal)).rejects.toThrow("不可用");
  } finally { await player.dispose(); await rm(root, { recursive: true, force: true }); }
});
