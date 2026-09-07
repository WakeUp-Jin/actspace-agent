import { describe, expect, it, vi } from "vitest";
import { ReviewPullRequestService, type ReviewPrCommandRunner } from "../review-pr-service";

describe("ReviewPullRequestService", () => {
  it("returns the existing pull request without creating another", async () => {
    const runner = scriptedRunner({ existingUrl: "https://github.com/acme/repo/pull/7" });
    const service = new ReviewPullRequestService(runner);
    const capability = await service.getCapability("/repo");
    expect(capability).toEqual({
      ok: true,
      capability: expect.objectContaining({ reason: "existing_pull_request", existingUrl: "https://github.com/acme/repo/pull/7" }),
    });
    await expect(service.create({ workspaceRoot: "/repo", title: "Review", body: "Body", baseBranch: "main", draft: false })).resolves.toEqual({
      ok: true,
      url: "https://github.com/acme/repo/pull/7",
      alreadyExisted: true,
    });
    expect(runner).not.toHaveBeenCalledWith("gh", expect.arrayContaining(["create"]), expect.anything());
  });

  it("creates a draft PR with argument arrays", async () => {
    const runner = scriptedRunner({ createUrl: "https://github.com/acme/repo/pull/8" });
    const service = new ReviewPullRequestService(runner);
    await expect(service.create({ workspaceRoot: "/repo", title: "你好 PR", body: "Body with spaces", baseBranch: "main", draft: true })).resolves.toEqual({
      ok: true,
      url: "https://github.com/acme/repo/pull/8",
      alreadyExisted: false,
    });
    expect(runner).toHaveBeenCalledWith("gh", [
      "pr", "create", "--title", "你好 PR", "--body", "Body with spaces", "--base", "main", "--head", "feature/review", "--draft",
    ], expect.objectContaining({ cwd: "/repo" }));
  });

  it.each([
    ["gh missing", { ghMissing: true }, "gh_missing"],
    ["non GitHub remote", { remote: "git@gitlab.com:acme/repo.git" }, "not_github"],
    ["not authenticated", { authFailure: true }, "not_authenticated"],
    ["detached head", { detached: true }, "detached_head"],
    ["no upstream", { noUpstream: true }, "no_upstream"],
  ] as const)("reports %s", async (_label, config, reason) => {
    const service = new ReviewPullRequestService(scriptedRunner(config));
    const result = await service.getCapability("/repo");
    expect(result).toEqual({ ok: true, capability: expect.objectContaining({ enabled: false, reason }) });
  });
});

function scriptedRunner(config: {
  ghMissing?: boolean;
  remote?: string;
  authFailure?: boolean;
  detached?: boolean;
  noUpstream?: boolean;
  existingUrl?: string;
  createUrl?: string;
} = {}): ReviewPrCommandRunner {
  return vi.fn(async (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "git rev-parse --show-toplevel") return ok("/repo\n");
    if (key === "gh --version") return config.ghMissing ? fail("missing") : ok("gh version 2\n");
    if (key === "git remote get-url origin") return ok(`${config.remote ?? "git@github.com:acme/repo.git"}\n`);
    if (key === "gh auth status") return config.authFailure ? fail("not logged in") : ok("authenticated\n");
    if (key === "git symbolic-ref --quiet --short HEAD") return config.detached ? fail("detached") : ok("feature/review\n");
    if (key === "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}") return config.noUpstream ? fail("no upstream") : ok("origin/feature/review\n");
    if (key === "gh repo view --json defaultBranchRef --jq .defaultBranchRef.name") return ok("main\n");
    if (key.startsWith("gh pr view ")) return config.existingUrl ? ok(`${config.existingUrl}\n`) : fail("no pull requests found");
    if (key.startsWith("gh pr create ")) return ok(`${config.createUrl ?? "https://github.com/acme/repo/pull/9"}\n`);
    return fail(`unexpected command: ${key}`);
  });
}

function ok(stdout: string) {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string) {
  return { stdout: "", stderr, exitCode: 1 };
}
