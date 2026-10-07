import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { CodeRenderView } from "../../../right-panel/CodeRenderView";
import { codeFor } from "../../model/panel-fixtures";

/** file 标签：路径面包屑 + 带行号的代码（复用 CodeRenderView 的纯展示部分）。 */

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", json: "json", sql: "sql", md: "markdown",
};

export function SpaceFileView({ path }: { path: string }) {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  const language = LANGUAGE_BY_EXT[name.split(".").pop() ?? ""];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap border-b border-line px-3 py-2 text-act-xs text-text-faint">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i === parts.length - 1 ? (
              <b className="overflow-hidden text-ellipsis font-medium text-text-main">{part}</b>
            ) : (
              <>
                <span>{part}</span>
                <ChevronRight size={12} aria-hidden="true" />
              </>
            )}
          </Fragment>
        ))}
      </div>
      <CodeRenderView content={codeFor(path).join("\n")} language={language} />
    </div>
  );
}
