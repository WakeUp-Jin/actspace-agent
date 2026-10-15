import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { classifyFileType, FileTypeIcon } from "../components/files/FileTypeIcon";
import { CODE_FILE_ARTWORK, CODE_FILE_ICON_ID_TOKEN } from "../components/files/code-file-icon-artwork";
import { CODE_FILE_TYPES } from "../components/files/code-file-types";

describe("file type icon", () => {
  it.each([
    ["report.docx", "word"], ["sheet.xlsx", "excel"], ["data.csv", "excel"], ["deck.pptx", "ppt"], ["paper.pdf", "pdf"],
    ["README.md", "markdown"], ["logo.svg", "image"], ["clip.mp4", "video"], ["index.html", "html"], ["notes.bin", "other"],
    ["src/app.ts", "typescript"], ["package.json", "node"], ["Dockerfile", "docker"], ["feature.component.ts", "angular"], [".env.production", "env"],
  ])("classifies %s as %s", (path, type) => {
    expect(classifyFileType(path)).toBe(type);
  });

  it("selects Flutter only when the project snapshot identifies it", () => {
    expect(classifyFileType("lib/main.dart")).toBe("dart");
    expect(classifyFileType("lib/main.dart", { files: { "pubspec.yaml": "dependencies:\n  flutter: sdk" } })).toBe("flutter");
  });

  it("keeps the embedded code artwork closed and free of unsafe markup", () => {
    expect(Object.keys(CODE_FILE_ARTWORK)).toEqual([...CODE_FILE_TYPES]);
    for (const [type, artwork] of Object.entries(CODE_FILE_ARTWORK)) {
      expect(artwork).not.toMatch(/<(?:script|style|foreignObject)\b|\son[a-z]+\s*=/iu);
      expect(artwork).not.toMatch(/(?:href|xlink:href)="(?!#)/iu);
      const ids = [...artwork.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]!);
      expect(new Set(ids).size, `${type} has duplicate SVG ids`).toBe(ids.length);
      for (const id of ids) expect(id.startsWith(CODE_FILE_ICON_ID_TOKEN)).toBe(true);
    }
  });

  it("renders category colors for traditional files and per-instance ids for code artwork", () => {
    const { container } = render(<><FileTypeIcon path="a.docx" size={20} /><FileTypeIcon path="a.ts" /><FileTypeIcon path="b.ts" /></>);
    const [word, first, second] = Array.from(container.querySelectorAll("svg"));
    expect(word.getAttribute("class")).toContain("--act-file-type-blue-light");
    expect(word.getAttribute("width")).toBe("20");
    expect(container.innerHTML).not.toContain(CODE_FILE_ICON_ID_TOKEN);
    const idsOf = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll("[id]")).map((node) => node.id);
    expect(idsOf(first).some((id) => idsOf(second).includes(id))).toBe(false);
  });
});
