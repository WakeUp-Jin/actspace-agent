/**
 * Explicit visual fixture: every accent palette side by side in light and dark.
 * `?cell=1&theme=&accent=` renders one sample; without `cell` the page tiles them in iframes,
 * because data-theme / data-accent only apply on <html>. Never imported by the application entry point.
 */
import { ArrowUp } from "lucide-react";
import { createRoot } from "react-dom/client";
import { ACCENT_PALETTES } from "../../appearance/accents";
import { IconButton } from "../../components/ui/IconButton";
import { Toggle } from "../../components/settings/SettingsPrimitives";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
const isCell = query.get("cell") === "1";
document.documentElement.dataset.theme = isCell ? query.get("theme") ?? "light" : "light";
document.documentElement.dataset.accent = isCell ? query.get("accent") ?? "default" : "default";

// 每格放齐强调色的消费点（发送、开关、焦点、链接、选中文字；选中底色直接画 --act-color-selection，截图不依赖真实选区），并把运行中绿点与审批琥珀条放在旁边，
// 用来确认橙与警告色、蓝与 info、开关与运行中状态的区分度。
function Sample() {
  return (
    <div className="flex h-screen flex-col gap-2.5 bg-app-bg p-3 text-text-main">
      <div className="markdown-prose text-act-sm">
        <p>
          参考 <a href="#docs">主题与配色规范</a>，<span className="bg-[var(--act-color-selection)]">选中的这段文字</span>和导航保持中性。
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <input readOnly value="focus 输入框" className="h-8 w-32 rounded-act-md border border-focus-ring bg-surface px-2.5 text-act-xs outline-none ring-2 ring-focus-ring/20" />
        <IconButton label="发送" tooltip={false} variant="accent" size="md" shape="round">
          <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
        </IconButton>
        <Toggle checked onChange={() => {}} ariaLabel="开启" />
        <Toggle checked={false} onChange={() => {}} ariaLabel="关闭" />
        <span className="inline-flex items-center gap-1.5 text-act-xs text-text-muted">
          <span className="size-2 rounded-full bg-operational" aria-hidden="true" />运行中
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-act-md border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-act-xs text-on-warning">
        <span className="size-2 rounded-full bg-warning" aria-hidden="true" />需要审批：写入 src/index.ts
      </div>
    </div>
  );
}

function Grid() {
  return (
    <div className="bg-app-bg p-4 text-text-main">
      <div className="grid grid-cols-[140px_420px_420px] items-center gap-2">
        <span />
        <span className="text-act-xs text-text-muted">浅色</span>
        <span className="text-act-xs text-text-muted">深色</span>
        {ACCENT_PALETTES.flatMap((palette) => [
          <span key={`${palette.id}-label`} className="text-act-xs font-medium">{palette.label}</span>,
          ...(["light", "dark"] as const).map((theme) => (
            <iframe
              key={`${palette.id}-${theme}`}
              title={`${palette.label} ${theme}`}
              src={`?cell=1&theme=${theme}&accent=${palette.id}`}
              className="h-[136px] w-[420px] rounded-act-md border border-line"
            />
          )),
        ])}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(isCell ? <Sample /> : <Grid />);
