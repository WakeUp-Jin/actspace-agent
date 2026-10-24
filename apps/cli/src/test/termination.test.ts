import { afterEach, describe, expect, it, vi } from "vitest";
import { CliTermination } from "../termination";

afterEach(() => vi.useRealTimers());
describe("CLI termination budget", () => {
  it("aborts late controls and force-cleans owned processes before exiting on timeout", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const termination = new CliTermination(code => calls.push(`exit:${code}`));
    termination.signal("SIGTERM");
    termination.addCleanup(() => calls.push("cleanup"));
    termination.setAbort(() => calls.push("abort"));
    expect(calls).toEqual(["abort"]);
    vi.advanceTimersByTime(5_000);
    expect(calls).toEqual(["abort", "cleanup", "exit:143"]);
    termination.dispose();
  });
  it("uses the first signal's exit code and cancels the deadline after clean shutdown", () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const termination = new CliTermination(exit);
    const cleanup = vi.fn(); termination.addCleanup(cleanup);
    termination.signal("SIGINT"); termination.signal("SIGTERM");
    expect(cleanup).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledWith(130);
    termination.dispose(); vi.runAllTimers(); expect(exit).toHaveBeenCalledOnce();
  });
});
