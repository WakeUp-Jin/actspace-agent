import type { ReactNode } from "react";

export type PlaceholderViewProps = {
  eyebrow: string;
  title: string;
  description: string;
  bullets?: string[];
  icon?: ReactNode;
};

export function PlaceholderView({ eyebrow, title, description, bullets, icon }: PlaceholderViewProps) {
  return (
    <div className="placeholder-view" role="region" aria-labelledby="placeholder-title">
      <div className="placeholder-card">
        {icon ? <div className="placeholder-icon" aria-hidden="true">{icon}</div> : null}
        <div className="placeholder-eyebrow">{eyebrow}</div>
        <h1 className="placeholder-title" id="placeholder-title">{title}</h1>
        <p className="placeholder-description">{description}</p>
        {bullets && bullets.length > 0 ? (
          <ul className="placeholder-bullets">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null}
        <div className="placeholder-status">Coming soon</div>
      </div>
    </div>
  );
}
