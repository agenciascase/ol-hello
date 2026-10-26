import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, Search } from "lucide-react";
import "../../agency.css";

export type Platform = "google" | "meta";
export type AdAccount = { id: string; name: string };
export type LinkedClient = { name: string; logo: string | null };

const LABEL: Record<Platform, string> = { google: "Google Ads", meta: "Meta Ads" };
const fmtId = (p: Platform, id: string) => (p === "google" ? id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : id.replace(/^act_/, ""));

/** Searchable list of one platform's accounts, so Google and Meta accounts never mix. */
function AccountPicker({
  platform,
  accounts,
  value,
  onChange,
  linked,
  loading,
}: {
  platform: Platform;
  accounts: AdAccount[];
  value: string;
  onChange: (id: string) => void;
  linked: Record<string, LinkedClient>;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = accounts.find((a) => a.id === value);
  const anyLinked = accounts.some((a) => linked[a.id]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR").replace(/-/g, "");
    return accounts
      .filter((a) => !onlyLinked || linked[a.id])
      .filter((a) => !q || a.name.toLocaleLowerCase("pt-BR").includes(q) || a.id.includes(q) || (linked[a.id]?.name ?? "").toLocaleLowerCase("pt-BR").includes(q))
      .sort((a, b) => Number(Boolean(linked[b.id])) - Number(Boolean(linked[a.id])) || a.name.localeCompare(b.name, "pt-BR"));
  }, [accounts, query, onlyLinked, linked]);

  return (
    <div className="afPicker" ref={box}>
      <button type="button" className="afPickerBtn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={loading && !accounts.length}>
        <span className="afPickerText">
          <strong>{current?.name ?? (loading ? "Carregando contas…" : accounts.length ? `Selecione a conta ${LABEL[platform]}` : `Nenhuma conta ${LABEL[platform]}`)}</strong>
          {current && (
            <small>
              {LABEL[platform]} · {fmtId(platform, current.id)}
              {linked[current.id] ? ` · cliente ${linked[current.id]!.name}` : ""}
            </small>
          )}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="afMenu" role="listbox" aria-label={`Contas ${LABEL[platform]}`}>
          <label className="afSearch">
            <Search size={15} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar entre ${accounts.length} contas por nome, ID ou cliente`} />
          </label>
          {anyLinked && (
            <label className="afOnly">
              <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} /> Só contas vinculadas a clientes
            </label>
          )}
          <div className="afList">
            {rows.slice(0, 300).map((a) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={a.id === value}
                className="afOption"
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {fmtId(platform, a.id)}
                    {linked[a.id] && <em>{linked[a.id]!.name}</em>}
                  </small>
                </span>
                {a.id === value && <Check size={16} />}
              </button>
            ))}
            {rows.length === 0 && <p className="afEmpty">Nenhuma conta encontrada.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Last N full days ending today, as YYYY-MM-DD. */
export function lastDays(n: number): [string, string] {
  const iso = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return [iso(start), iso(end)];
}

type Preset = { label: string; range: () => [string, string] };
const isoDay = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
const dayAgo = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
};

/** Always visible: today, 7 and 15 days. */
export const QUICK_PERIODS: Preset[] = [
  { label: "Hoje", range: () => [isoDay(dayAgo(0)), isoDay(dayAgo(0))] },
  { label: "7 dias", range: () => lastDays(7) },
  { label: "15 dias", range: () => lastDays(15) },
];

/** Inside "Personalizado". */
export const MORE_PERIODS: Preset[] = [
  { label: "Ontem", range: () => [isoDay(dayAgo(1)), isoDay(dayAgo(1))] },
  { label: "3 dias", range: () => lastDays(3) },
  { label: "14 dias", range: () => lastDays(14) },
  { label: "30 dias", range: () => lastDays(30) },
  { label: "90 dias", range: () => lastDays(90) },
  {
    label: "Este mês",
    range: () => {
      const t = dayAgo(0);
      return [isoDay(new Date(t.getFullYear(), t.getMonth(), 1, 12)), isoDay(t)];
    },
  },
  {
    label: "Mês passado",
    range: () => {
      const t = dayAgo(0);
      return [isoDay(new Date(t.getFullYear(), t.getMonth() - 1, 1, 12)), isoDay(new Date(t.getFullYear(), t.getMonth(), 0, 12))];
    },
  },
];
export const PERIOD_PRESETS: Preset[] = [...QUICK_PERIODS, ...MORE_PERIODS];

/** "Personalizado": the other presets, any number of days and a free date range. */
function CustomPeriod({
  active,
  from,
  to,
  onApply,
  compare,
  onCompare,
}: {
  active: string;
  from: string;
  to: string;
  onApply: (from: string, to: string, label: string) => void;
  compare: boolean;
  onCompare: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(/^(\d+) dias?$/.exec(active)?.[1] ?? "");
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const box = useRef<HTMLDivElement>(null);
  const today = isoDay(dayAgo(0));
  const isActive = !QUICK_PERIODS.some((p) => p.label === active);
  const n = Number(days);
  const validDays = Number.isInteger(n) && n >= 1 && n <= 365;
  const validRange = Boolean(start && end && start <= end && end <= today);

  useEffect(() => {
    if (!open) return;
    setStart(from);
    setEnd(to);
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (f: string, t: string, label: string) => {
    onApply(f, t, label);
    setOpen(false);
  };
  const br = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="afCustomWrap" ref={box}>
      <button type="button" className="afChip" aria-pressed={isActive} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <CalendarDays size={14} /> {isActive ? active : "Personalizado"} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="afPop" role="dialog" aria-label="Período personalizado">
          <div className="afPopGroup">
            <span className="afLabel">Atalhos</span>
            <div className="afPopChips">
              {MORE_PERIODS.map((p) => (
                <button key={p.label} type="button" className="afChip" aria-pressed={active === p.label} onClick={() => apply(...p.range(), p.label)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <form
            className="afPopGroup"
            onSubmit={(e) => {
              e.preventDefault();
              if (validDays) apply(...lastDays(n), n === 1 ? "1 dia" : `${n} dias`);
            }}
          >
            <span className="afLabel">Quantidade de dias</span>
            <div className="afPopLine">
              <label className="afInline">
                Últimos
                <input type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="5" aria-label="Quantidade de dias" />
                dias
              </label>
              <button type="submit" className="afApply" disabled={!validDays}>
                Aplicar
              </button>
            </div>
          </form>
          <form
            className="afPopGroup"
            onSubmit={(e) => {
              e.preventDefault();
              if (validRange) apply(start, end, start === end ? br(start) : `${br(start)} a ${br(end)}`);
            }}
          >
            <span className="afLabel">Escolher datas</span>
            <div className="afPopLine">
              <label className="afInline">
                De
                <input type="date" value={start} max={end || today} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="afInline">
                até
                <input type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <button type="submit" className="afApply" disabled={!validRange}>
                Aplicar
              </button>
            </div>
          </form>
          <label className="afCompare">
            <input type="checkbox" checked={compare} onChange={(e) => onCompare(e.target.checked)} /> Comparar com o período anterior
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * Manager filter bar for the dashboard: platform first (Google and Meta kept apart), then the
 * account of that platform, the analysis period and the campaign.
 */
export function AccountFilterBar({
  platform,
  onPlatform,
  google,
  meta,
  linked,
  periodLabel,
  periodRange,
  onPeriod,
  periodFrom,
  periodTo,
  compare,
  onCompare,
  campaignPicker,
}: {
  platform: Platform;
  onPlatform: (p: Platform) => void;
  google: { accounts: AdAccount[]; value: string; onChange: (id: string) => void; loading: boolean; error?: string | undefined };
  meta: { accounts: AdAccount[]; value: string; onChange: (id: string) => void; loading: boolean; error?: string | undefined };
  linked: Record<Platform, Record<string, LinkedClient>>;
  periodLabel: string;
  periodRange: string;
  onPeriod: (from: string, to: string, label: string) => void;
  periodFrom: string;
  periodTo: string;
  compare: boolean;
  onCompare: (v: boolean) => void;
  campaignPicker: ReactNode;
}) {
  const side = platform === "google" ? google : meta;
  return (
    <section className="afBar" aria-label="Filtros do painel">
      <div className="afRow">
        <div className="afSegment" role="tablist" aria-label="Plataforma">
          {(["google", "meta"] as Platform[]).map((p) => {
            const s = p === "google" ? google : meta;
            return (
              <button key={p} type="button" role="tab" aria-selected={platform === p} className={"afSeg " + p} onClick={() => onPlatform(p)}>
                <i aria-hidden />
                {LABEL[p]}
                <span>{s.loading && !s.accounts.length ? "…" : s.accounts.length}</span>
              </button>
            );
          })}
        </div>
        <div className="afField afGrow">
          <span className="afLabel">Conta {LABEL[platform]}</span>
          <AccountPicker platform={platform} accounts={side.accounts} value={side.value} onChange={side.onChange} linked={linked[platform]} loading={side.loading} />
          {side.error && <small className="afError">{side.error}</small>}
        </div>
        <div className="afField afCampaign">
          <span className="afLabel">Campanha</span>
          {campaignPicker}
        </div>
      </div>
      <div className="afRow afPeriodRow">
        <span className="afLabel">Período de análise</span>
        <div className="afChips" role="group" aria-label="Período de análise">
          {QUICK_PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="afChip"
              aria-pressed={periodLabel === p.label}
              onClick={() => {
                const [from, to] = p.range();
                onPeriod(from, to, p.label);
              }}
            >
              {p.label}
            </button>
          ))}
          <CustomPeriod active={periodLabel} from={periodFrom} to={periodTo} onApply={onPeriod} compare={compare} onCompare={onCompare} />
        </div>
        <span className="afRange">{periodRange}</span>
      </div>
    </section>
  );
}
