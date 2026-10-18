import { useId } from "react";
import { cx } from "../../ui/cx";

/** 从粘贴的整段输出里取出配对码（32 位十六进制）；没有就只去掉空白。 */
export function extractPairCode(text: string): string {
  return /\b[a-f0-9]{32}\b/i.exec(text)?.[0] ?? text.replace(/\s+/g, "");
}

export function PairCodeInput({ value, onChange, onSubmit, invalid, describedBy }: { readonly value: string; readonly onChange: (value: string) => void; readonly onSubmit: () => void; readonly invalid?: boolean; readonly describedBy?: string }) {
  const id = useId();
  return (
    <input
      id={id}
      value={value}
      onChange={event => onChange(extractPairCode(event.target.value))}
      onPaste={event => {
        event.preventDefault();
        onChange(extractPairCode(event.clipboardData.getData("text")));
      }}
      onKeyDown={event => { if (event.key === "Enter") onSubmit(); }}
      aria-label="配对码"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      placeholder="粘贴服务器上显示的配对码"
      inputMode="text"
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      className={cx("connect-field font-mono", invalid && "is-invalid")}
    />
  );
}
