/** 正文代码卡的复制按钮：构建时隐藏输出，有脚本才显示并绑定。 */
export function initializeCodeCopy(): void {
  document.querySelectorAll<HTMLButtonElement>(".code .code-copy").forEach((button) => {
    if (button.dataset.copyReady === "true") return;
    button.dataset.copyReady = "true";
    button.hidden = false;
    button.addEventListener("click", async () => {
      const code = button.closest(".code")?.querySelector("pre code")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "已复制";
      } catch {
        button.textContent = "复制失败";
      }
      window.setTimeout(() => {
        button.textContent = "复制";
      }, 1600);
    });
  });
}
