import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewGitWorkerClient } from "../review-git-worker-client";

const workerPath = join(__dirname, "fixtures", "review-worker-fixture.cjs");
const options = { cwd: process.cwd(), timeoutMs: 5_000, maxOutputChars: 64 * 1024 };

describe("ReviewGitWorkerClient", () => {
  it("forwards fixed Git requests and cancels an active request", async () => {
    const client = new ReviewGitWorkerClient(workerPath);
    await expect(client.runGit(["status", "--short"], options)).resolves.toMatchObject({ stdout: "status --short", exitCode: 0 });
    const controller = new AbortController();
    const pending = client.runGit(["delay"], { ...options, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ startError: "Review request was cancelled." });
    client.dispose();
  });

  it("rebuilds once after a crash and then stops the crash loop", async () => {
    const client = new ReviewGitWorkerClient(workerPath);
    await expect(client.runGit(["crash"], options)).resolves.toMatchObject({ exitCode: null });
    await expect(client.runGit(["status"], options)).resolves.toMatchObject({ stdout: "status", exitCode: 0 });
    await expect(client.runGit(["crash"], options)).resolves.toMatchObject({ exitCode: null });
    await expect(client.runGit(["status"], options)).resolves.toMatchObject({ startError: "Review worker restart limit was reached." });
    client.dispose();
  });
});
