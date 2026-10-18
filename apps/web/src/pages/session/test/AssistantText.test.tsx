import { render, screen } from "@testing-library/react";
import { AssistantText } from "../blocks/AssistantText";

it("renders http links in a new tab and strips javascript: hrefs", () => {
  render(<AssistantText content={"[ok](https://example.com) [bad](javascript:alert(1)) [mail](mailto:a@b.c) [rel](/x)"} />);
  const ok = screen.getByText("ok");
  expect(ok).toHaveAttribute("href", "https://example.com");
  expect(ok).toHaveAttribute("target", "_blank");
  expect(ok).toHaveAttribute("rel", "noreferrer");
  expect(screen.getByText("bad")).not.toHaveAttribute("href");
  expect(screen.getByText("mail")).toHaveAttribute("href", "mailto:a@b.c");
  expect(screen.getByText("rel")).not.toHaveAttribute("href");
});

it("shows raw html as text instead of executing it", () => {
  const { container } = render(<AssistantText content={"<script>alert(1)</script>"} />);
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>alert(1)</script>");
});

it("renders gfm tables and code blocks", () => {
  const { container } = render(<AssistantText content={"| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nconst x = 1;\n```"} />);
  expect(container.querySelector("table")).not.toBeNull();
  expect(container.querySelector("pre code")?.textContent).toContain("const x = 1;");
});
