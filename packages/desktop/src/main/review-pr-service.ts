import { execFile } from "node:child_process";
import type {
  ReviewCreatePullRequestResult,
  ReviewPullRequestCapability,
  ReviewPullRequestCapabilityResult,
} from "@actspace/shared";

export type ReviewPrCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startError?: string;
};

export type ReviewPrCommandRunner = (
  command: "git" | "gh",
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
) => Promise<ReviewPrCommandResult>;

export class ReviewPullRequestService {
  constructor(private readonly runner: ReviewPrCommandRunner = runReviewPrCommand) {}

  async getCapability(workspaceRoot: string, requestedBaseBranch?: string): Promise<ReviewPullRequestCapabilityResult> {
    const repo = await this.run("git", ["rev-parse", "--show-toplevel"], workspaceRoot);
    if (!succeeded(repo)) {
      return { ok: true, capability: disabled("not_repository", "Current workspace is not a Git repository.") };
    }
    const repoRoot = repo.stdout.trim();
    const gh = await this.run("gh", ["--version"], repoRoot);
    if (!succeeded(gh)) return { ok: true, capability: disabled("gh_missing", "GitHub CLI is not installed.") };
    const remote = await this.run("git", ["remote", "get-url", "origin"], repoRoot);
    if (!succeeded(remote) || !isGitHubRemote(remote.stdout.trim())) {
      return { ok: true, capability: disabled("not_github", "The origin remote is not hosted on GitHub.") };
    }
    const auth = await this.run("gh", ["auth", "status"], repoRoot);
    if (!succeeded(auth)) return { ok: true, capability: disabled("not_authenticated", "GitHub CLI is not authenticated.") };
    const branch = await this.run("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], repoRoot);
    if (!succeeded(branch) || !branch.stdout.trim()) {
      return { ok: true, capability: disabled("detached_head", "Create PR is unavailable from detached HEAD.") };
    }
    const currentBranch = branch.stdout.trim();
    const upstream = await this.run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], repoRoot);
    if (!succeeded(upstream)) {
      return { ok: true, capability: { ...disabled("no_upstream", "Push the current branch before creating a pull request."), currentBranch } };
    }
    const baseBranch = requestedBaseBranch?.trim() || await this.defaultBranch(repoRoot);
    const existing = await this.run("gh", ["pr", "view", currentBranch, "--json", "url", "--jq", ".url"], repoRoot);
    if (succeeded(existing) && existing.stdout.trim()) {
      return {
        ok: true,
        capability: {
          enabled: false,
          reason: "existing_pull_request",
          message: "A pull request already exists for this branch.",
          currentBranch,
          baseBranch,
          existingUrl: existing.stdout.trim(),
        },
      };
    }
    return { ok: true, capability: { enabled: true, currentBranch, baseBranch } };
  }

  async create(input: {
    workspaceRoot: string;
    title: string;
    body: string;
    baseBranch: string;
    draft: boolean;
  }): Promise<ReviewCreatePullRequestResult> {
    const capability = await this.getCapability(input.workspaceRoot, input.baseBranch);
    if (capability.ok === false) return { ok: false, code: capability.code, message: capability.message };
    if (capability.capability.existingUrl) {
      return { ok: true, url: capability.capability.existingUrl, alreadyExisted: true };
    }
    if (!capability.capability.enabled) {
      return { ok: false, code: "pull_request_unavailable", message: capability.capability.message ?? "Create PR is unavailable." };
    }
    if (!input.title.trim() || !input.baseBranch.trim()) {
      return { ok: false, code: "invalid_selection", message: "Pull request title and base branch are required." };
    }
    const args = [
      "pr", "create",
      "--title", input.title,
      "--body", input.body,
      "--base", input.baseBranch,
      "--head", capability.capability.currentBranch ?? "",
    ];
    if (input.draft) args.push("--draft");
    const created = await this.run("gh", args, input.workspaceRoot);
    if (!succeeded(created)) {
      return { ok: false, code: "command_failed", message: sanitize(created) };
    }
    const url = created.stdout.split(/\s+/).find((token) => /^https:\/\/github\.com\//.test(token));
    return url
      ? { ok: true, url, alreadyExisted: false }
      : { ok: false, code: "command_failed", message: "GitHub CLI did not return a pull request URL." };
  }

  private async defaultBranch(cwd: string): Promise<string> {
    const result = await this.run("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"], cwd);
    return succeeded(result) && result.stdout.trim() ? result.stdout.trim() : "main";
  }

  private run(command: "git" | "gh", args: string[], cwd: string): Promise<ReviewPrCommandResult> {
    return this.runner(command, args, { cwd, timeoutMs: 15_000, maxOutputChars: 256 * 1024 });
  }
}

export function runReviewPrCommand(
  command: "git" | "gh",
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number },
): Promise<ReviewPrCommandResult> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: options.maxOutputChars }, (error, stdout, stderr) => {
      const failure = error as NodeJS.ErrnoException & { code?: string | number } | null;
      resolve({
        stdout: String(stdout).slice(0, options.maxOutputChars),
        stderr: String(stderr).slice(0, options.maxOutputChars),
        exitCode: typeof failure?.code === "number" ? failure.code : failure ? 1 : 0,
        ...(failure?.code === "ENOENT" ? { startError: `${command} is not installed` } : {}),
      });
    });
    child.stdin?.end();
  });
}

function succeeded(result: ReviewPrCommandResult): boolean {
  return result.exitCode === 0 && !result.startError;
}

function disabled(reason: NonNullable<ReviewPullRequestCapability["reason"]>, message: string): ReviewPullRequestCapability {
  return { enabled: false, reason, message };
}

function isGitHubRemote(value: string): boolean {
  return /(?:github\.com[/:])/.test(value);
}

function sanitize(result: ReviewPrCommandResult): string {
  return (result.stderr || result.startError || "Pull request command failed.").trim().slice(0, 2_000);
}
