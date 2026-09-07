import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CsvRenderView, parseDelimited } from "../components/right-panel/CsvRenderView";

/**
 * CSV 预览的验收探针（见 front-右侧面板与文件渲染规范.md）：
 * 规范早就声明了 csv Tab「渲染为表格视图」，本轮才真正实现。
 * 解析必须处理引号包裹，否则错位的表格比纯文本更误导人；解析不出多列时要降级。
 */

function rowTexts(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll("tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => td.textContent ?? ""),
  );
}

describe("parseDelimited", () => {
  it("keeps delimiters, newlines and escaped quotes inside quoted fields", () => {
    expect(parseDelimited('a,"b,c",d\n', ",")).toEqual([["a", "b,c", "d"]]);
    expect(parseDelimited('"line\nbreak",x\n', ",")).toEqual([["line\nbreak", "x"]]);
    expect(parseDelimited('"say ""hi""",x\n', ",")).toEqual([['say "hi"', "x"]]);
  });

  it("handles CRLF and drops the trailing empty record", () => {
    expect(parseDelimited("a,b\r\nc,d\r\n", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("supports tab-separated content", () => {
    expect(parseDelimited("a\tb\nc\td\n", "\t")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("CsvRenderView", () => {
  it("renders the first record as the header row and numbers the body rows", () => {
    const { container } = render(
      <CsvRenderView content={"name,age\nada,36\nalan,41\n"} relativePath="data/people.csv" />,
    );

    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "age" })).toBeInTheDocument();
    expect(rowTexts(container)).toEqual([
      ["1", "ada", "36"],
      ["2", "alan", "41"],
    ]);
    expect(screen.getByText("2 行 · 2 列")).toBeInTheDocument();
  });

  it("pads short rows so cells never shift into the wrong column", () => {
    const { container } = render(<CsvRenderView content={"a,b,c\n1,2\n"} relativePath="x.csv" />);
    expect(rowTexts(container)).toEqual([["1", "1", "2", ""]]);
  });

  it("splits on tabs for .tsv files", () => {
    const { container } = render(<CsvRenderView content={"a\tb\n1\t2\n"} relativePath="x.tsv" />);
    expect(rowTexts(container)).toEqual([["1", "1", "2"]]);
  });

  it("falls back to the text view when the content is not multi-column", () => {
    render(<CsvRenderView content={"just one column\nanother line\n"} relativePath="x.csv" />);

    expect(screen.getByText("无法解析为多列表格，已按纯文本显示。")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    // 降级后仍走代码视图，所以行号还在。
    expect(screen.getByText("just one column")).toBeInTheDocument();
  });

  it("lets the user switch between table and plain text", async () => {
    const user = userEvent.setup();
    render(<CsvRenderView content={"a,b\n1,2\n"} relativePath="x.csv" />);

    await user.click(screen.getByRole("button", { name: "以纯文本查看" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("纯文本视图")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "以表格查看" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
