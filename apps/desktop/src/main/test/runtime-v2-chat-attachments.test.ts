import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareChatAttachments } from "../runtime-v2/runtime-registry";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-chat-attachments-"));
  roots.push(root);
  return root;
}

describe("Chat attachment admission", () => {
  it("accepts the first-release image and UTF-8 text formats with stable media types", async () => {
    const root = await fixtureRoot();
    const fixtures: Array<[string, string]> = [
      ["image.png", "image/png"], ["image.jpg", "image/jpeg"], ["image.jpeg", "image/jpeg"],
      ["image.webp", "image/webp"], ["image.gif", "image/gif"], ["note.txt", "text/plain"],
      ["note.md", "text/markdown"], ["note.markdown", "text/markdown"], ["data.json", "application/json"], ["data.csv", "text/csv"],
    ];
    for (const [name] of fixtures) await writeFile(join(root, name), name.startsWith("image") ? Buffer.from([1, 2, 3]) : `\uFEFFcontent:${name}`);
    const prepared = await prepareChatAttachments(fixtures.map(([name]) => join(root, name)));
    expect(prepared.map((item) => item.mediaType)).toEqual(fixtures.map(([, mediaType]) => mediaType));
    expect(prepared.find((item) => item.name === "note.txt")?.textContent).toBe("content:note.txt");
    expect(prepared.find((item) => item.name === "image.png")?.textContent).toBeUndefined();
  });

  it("rejects Office/PDF, directories, invalid UTF-8, NUL, per-file and total limits", async () => {
    const root = await fixtureRoot();
    await writeFile(join(root, "document.pdf"), "pdf");
    await writeFile(join(root, "document.docx"), "docx");
    await writeFile(join(root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    await writeFile(join(root, "nul.txt"), "before\0after");
    await writeFile(join(root, "large.txt"), Buffer.alloc(1024 * 1024 + 1, 97));
    await writeFile(join(root, "part-a.txt"), "a".repeat(130_000));
    await writeFile(join(root, "part-b.md"), "b".repeat(130_000));
    await mkdir(join(root, "folder"));

    await expect(prepareChatAttachments([join(root, "missing.txt")])).rejects.toMatchObject({ issue: { code: "unreadable", fileName: "missing.txt" }, attachmentIndex: 0 });
    await expect(prepareChatAttachments([join(root, "part-a.txt"), join(root, "invalid.txt")])).rejects.toMatchObject({ issue: { code: "invalid_utf8", fileName: "invalid.txt" }, attachmentIndex: 1 });
    await expect(prepareChatAttachments([join(root, "part-a.txt"), join(root, "part-b.md")])).rejects.toMatchObject({ issue: { code: "total_text_too_large", limit: 256_000 }, textCharacterCounts: [130_000, 130_000] });
    await expect(prepareChatAttachments([join(root, "document.pdf")])).rejects.toThrow("格式暂不支持");
    await expect(prepareChatAttachments([join(root, "document.docx")])).rejects.toThrow("格式暂不支持");
    await expect(prepareChatAttachments([join(root, "folder")])).rejects.toThrow("不是普通文件");
    await expect(prepareChatAttachments([join(root, "invalid.txt")])).rejects.toThrow("不是 UTF-8");
    await expect(prepareChatAttachments([join(root, "nul.txt")])).rejects.toThrow("非文本内容");
    await expect(prepareChatAttachments([join(root, "large.txt")])).rejects.toThrow("1 MiB");
    await expect(prepareChatAttachments([join(root, "part-a.txt"), join(root, "part-b.md")])).rejects.toThrow("256,000 个字符");
  });
});
