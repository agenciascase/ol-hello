import type { ReactNode } from "react";

export type CardLine = { label: string; value: ReactNode; hint?: ReactNode | undefined };

/** One pattern for every integration: ad platforms and delivery channels alike. */
export function IntegrationCard({
  icon,
  tone,
  name,
  subtitle,
  connected,
  statusLabel,
  warn,
  lines = [],
  description,
  actions,
}: {
  icon: ReactNode;
  tone: "meta" | "google" | "channel";
  name: string;
  subtitle?: ReactNode | undefined;
  connected: boolean;
  statusLabel?: string | undefined;
  warn?: boolean | undefined;
  lines?: CardLine[] | undefined;
  description?: ReactNode | undefined;
  actions: ReactNode;
}) {
  return (
    <article className={"intItem" + (connected ? " connected" : "")}>
      <header className="intItemHead">
        <span className={"intIcon " + tone} aria-hidden>
          {icon}
        </span>
        <div className="intItemTitle">
          <strong>{name}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <span className={"intTag" + (connected ? (warn ? " warn" : " ready") : "")}>{statusLabel ?? (connected ? "Conectado" : "Não conectado")}</span>
      </header>
      {description && <p className="intItemText">{description}</p>}
      {lines.length > 0 && (
        <dl className="intItemLines">
          {lines.map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd>
                {l.value}
                {l.hint && <small>{l.hint}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <footer className="intItemActions">{actions}</footer>
    </article>
  );
}
