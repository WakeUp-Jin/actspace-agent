export function initializeDocsCopy(): void {
  document.querySelectorAll<HTMLElement>(".docs-prose pre").forEach((pre) => {
    if (pre.dataset.copyReady === "true") return;
    pre.dataset.copyReady = "true";

    const code = pre.querySelector("code");
    const language = pre.dataset.language ?? code?.className.match(/language-([\w-]+)/)?.[1];
    if (language) {
      const label = document.createElement("span");
      label.className = "docs-code-language";
      label.textContent = language;
      pre.append(label);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "docs-copy-button";
    button.textContent = "复制";
    button.setAttribute("aria-label", "复制代码");

    button.addEventListener("click", async () => {
      const codeText = code?.textContent ?? "";
      await navigator.clipboard.writeText(codeText);
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = "复制";
      }, 1600);
    });

    pre.append(button);
  });
}
