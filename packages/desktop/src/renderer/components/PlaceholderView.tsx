import type { ReactNode } from "react";

export type PlaceholderViewProps = {
  eyebrow: string;
  title: string;
  description: string;
  bullets?: string[];
  icon?: ReactNode;
};

const PLACEHOLDER_VIEW_CLASS =
  "flex h-full min-h-0 items-center justify-center overflow-auto bg-app-bg px-8 py-12";
const PLACEHOLDER_CARD_CLASS =
  "flex w-full max-w-[540px] flex-col items-start gap-3 rounded-act-lg border border-line bg-surface p-8 shadow-act-soft";
const PLACEHOLDER_ICON_CLASS = "mb-1 grid h-12 w-12 place-items-center rounded-act-md bg-brand-soft text-brand";
const PLACEHOLDER_EYEBROW_CLASS = "text-xs font-semibold uppercase tracking-[0.08em] text-brand";
const PLACEHOLDER_TITLE_CLASS = "m-0 text-xl font-semibold leading-[1.3] text-text-main";
const PLACEHOLDER_DESCRIPTION_CLASS = "m-0 text-sm leading-[1.55] text-text-muted";
const PLACEHOLDER_BULLETS_CLASS =
  "mt-1 flex flex-col gap-1.5 pl-[18px] text-[13px] leading-[1.55] text-text-muted";
const PLACEHOLDER_STATUS_CLASS =
  "mt-2 rounded-act-pill border border-line bg-surface-subtle px-2.5 py-1 text-xs font-medium text-text-faint";

export function PlaceholderView({ eyebrow, title, description, bullets, icon }: PlaceholderViewProps) {
  return (
    <div className={PLACEHOLDER_VIEW_CLASS} role="region" aria-labelledby="placeholder-title">
      <div className={PLACEHOLDER_CARD_CLASS}>
        {icon ? <div className={PLACEHOLDER_ICON_CLASS} aria-hidden="true">{icon}</div> : null}
        <div className={PLACEHOLDER_EYEBROW_CLASS}>{eyebrow}</div>
        <h1 className={PLACEHOLDER_TITLE_CLASS} id="placeholder-title">{title}</h1>
        <p className={PLACEHOLDER_DESCRIPTION_CLASS}>{description}</p>
        {bullets && bullets.length > 0 ? (
          <ul className={PLACEHOLDER_BULLETS_CLASS}>
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null}
        <div className={PLACEHOLDER_STATUS_CLASS}>Coming soon</div>
      </div>
    </div>
  );
}
