import { render, screen, within } from "@testing-library/react";
import { MarkdownProse } from "../components/messages/MarkdownProse";

describe("MarkdownProse", () => {
  it("renders GFM tables as table elements", () => {
    render(
      <MarkdownProse
        content={[
          "| # | 工具 | 结果 |",
          "|---|---|---|",
          "| 1 | `write_file` | ✅ |",
          "| 2 | `read_file` | ✅ |",
        ].join("\n")}
      />,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "#" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "工具" })).toBeInTheDocument();
    expect(within(table).getByText("write_file")).toBeInTheDocument();
    expect(within(table).getByText("read_file")).toBeInTheDocument();
  });

  it("accepts compact separator rows commonly emitted by models", () => {
    render(
      <MarkdownProse
        content={[
          "| 操作 | 状态 |",
          "|-|-|",
          "| 修改 | 完成 |",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("修改")).toBeInTheDocument();
  });
});
