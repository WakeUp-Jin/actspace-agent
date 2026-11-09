import type { MessageBlock } from "@actspace/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BashRunBlock } from "../components/messages/BashRunBlock";
import { scriptFileName, scriptSummary } from "../components/messages/ScriptSourceBlock";
import { TooltipProvider } from "../components/ui/Tooltip";

type BashMessage = Extract<MessageBlock, { kind: "bash" }>;

const INLINE_LINES = Array.from({ length: 20 }, (_, index) => `print(${index})`);
const INLINE_COMMAND = `python3 - <<'PY'\nimport openpyxl\n${INLINE_LINES.join("\n")}\nPY`;

function base(overrides: Partial<BashMessage>): BashMessage {
  return {
    id: "bash-script-1",
    kind: "bash",
    createdAt: "2026-11-09T00:00:00.000Z",
    title: "Bash command",
    status: "success",
    command: "python3 -c 'print(1)'",
    exitCode: 0,
    ...overrides,
  };
}

function renderBash(message: BashMessage, onOpenWorkspaceFile?: (path: string, line?: number) => void) {
  return render(
    <TooltipProvider delayDuration={0}>
      <BashRunBlock message={message} replyCompleted onOpenWorkspaceFile={onOpenWorkspaceFile} />
    </TooltipProvider>,
  );
}

describe("script summaries", () => {
  it("counts lines for inline bodies and names script files", () => {
    expect(scriptSummary({ language: "python", source: "\nimport os\nprint(os.getcwd())\n" })).toBe(
      "Python 脚本（2 行）",
    );
    expect(scriptSummary({ language: "javascript", path: "$ACTSPACE_SCRATCH/build.mjs" }, "运行 ")).toBe(
      "运行 JavaScript 脚本 build.mjs",
    );
    expect(scriptFileName("scripts\\report.py")).toBe("report.py");
  });
});

describe("BashRunBlock script rendering", () => {
  it("summarises an inline script on the execution row and folds the long body in details", async () => {
    renderBash(base({ command: INLINE_COMMAND, stdout: "0\n1\n" }));

    const row = screen.getByRole("button", { name: /Python 脚本（21 行）/ });
    expect(row).toHaveTextContent("Python 脚本（21 行）");
    expect(screen.queryByText(/print\(19\)/)).toBeNull();

    await userEvent.click(row);
    const code = document.querySelector(".script-source");
    expect(code).not.toBeNull();
    expect(code).toHaveAttribute("data-folded", "true");
    expect(code?.querySelector(".script-source-head")).toHaveTextContent("Python21 行");
    // 展开详情里的命令行不再重复整段正文，只留 heredoc 首行。
    expect(document.querySelector(".bash-output-text")).toHaveTextContent("$ python3 - <<'PY' …");
    expect(code?.querySelectorAll(".script-source-body > span")).toHaveLength(8);
    expect(code).not.toHaveTextContent("print(19)");

    await userEvent.click(screen.getByRole("button", { name: "展开全部 21 行" }));
    expect(code).not.toHaveAttribute("data-folded");
    expect(code).toHaveTextContent("print(19)");
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
  });

  it("keeps short scripts unfolded and leaves plain commands untouched", async () => {
    const { unmount } = renderBash(base({ command: "python3 -c 'import sys\nprint(sys.version)'" }));
    await userEvent.click(screen.getByRole("button", { name: /Python 脚本（2 行）/ }));
    const code = document.querySelector(".script-source");
    expect(code).not.toHaveAttribute("data-folded");
    expect(screen.queryByRole("button", { name: /展开全部/ })).toBeNull();
    expect(code?.querySelector(".hljs-keyword")).toHaveTextContent("import");
    unmount();

    renderBash(base({ command: "pnpm test" }));
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    expect(document.querySelector(".script-source")).toBeNull();
  });

  it("links workspace script files to the file panel but not scratch or absolute paths", async () => {
    const open = vi.fn();
    const { unmount } = renderBash(base({ command: "python3 scripts/report.py --out out.xlsx" }), open);
    await userEvent.click(screen.getByRole("button", { name: /python3 scripts\/report.py/ }));
    expect(document.querySelector(".script-source")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "report.py" }));
    expect(open).toHaveBeenCalledWith("scripts/report.py");
    unmount();

    renderBash(base({ command: '"$ACTSPACE_PYTHON" "$ACTSPACE_SCRATCH/fill.py"' }), open);
    await userEvent.click(screen.getByRole("button", { name: /fill.py/ }));
    expect(screen.queryByRole("button", { name: "fill.py" })).toBeNull();
    expect(screen.getByTitle("$ACTSPACE_SCRATCH/fill.py")).toHaveTextContent("fill.py");
  });

  it("writes the script summary into the approval card head and shows the body as code", () => {
    renderBash(
      base({
        status: "pending",
        exitCode: undefined,
        intent: "生成报表",
        command: INLINE_COMMAND,
        approvalRequestId: "approval-script-1",
      }),
    );

    const card = screen.getByRole("article");
    expect(card.querySelector(".approval-card-head")).toHaveTextContent("生成报表运行 Python 脚本（21 行）");
    expect(card.querySelector(".bash-approval-command")).toHaveTextContent("$ python3 - <<'PY' …");
    expect(card.querySelector(".script-source")).toHaveAttribute("data-folded", "true");
    expect(card).toHaveTextContent("import openpyxl");
  });

  it("names the script file in the approval head", () => {
    renderBash(
      base({
        status: "pending",
        exitCode: undefined,
        command: "node build/pack.mjs --release",
        approvalRequestId: "approval-script-2",
      }),
    );
    const card = screen.getByRole("article");
    expect(card.querySelector(".approval-card-head")).toHaveTextContent("运行 JavaScript 脚本 pack.mjs");
    expect(card.querySelector(".bash-approval-command")).toHaveTextContent("$ node build/pack.mjs --release");
    expect(card.querySelector(".script-source")).toBeNull();
  });
});
