import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

/* Dates are handled as local YYYY-MM-DD strings to avoid time-zone shifts. */
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const br = (s: string) => s.split("-").reverse().join("/");
const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

type Range = { from: string; to: string; label: string };
type Preset = { label: string; range: (today: string) => [string, string]; hint?: string };

const PRESETS: Preset[] = [
  { label: "Hoje", range: (t) => [t, t] },
  { label: "Ontem", range: (t) => [addDays(t, -1), addDays(t, -1)] },
  { label: "Esta semana", hint: "dom. até hoje", range: (t) => [addDays(t, -parse(t).getDay()), t] },
  { label: "7 dias atrás", range: (t) => [addDays(t, -6), t] },
  {
    label: "Semana passada",
    hint: "de dom. a sáb.",
    range: (t) => {
      const sat = addDays(t, -parse(t).getDay() - 1);
      return [addDays(sat, -6), sat];
    },
  },
  { label: "14 dias atrás", range: (t) => [addDays(t, -13), t] },
  { label: "15 dias atrás", range: (t) => [addDays(t, -14), t] },
  {
    label: "Este mês",
    range: (t) => {
      const d = parse(t);
      return [iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), t];
    },
  },
  { label: "30 dias atrás", range: (t) => [addDays(t, -29), t] },
  {
    label: "Último mês",
    range: (t) => {
      const d = parse(t);
      return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)), iso(new Date(d.getFullYear(), d.getMonth(), 0, 12))];
    },
  },
  { label: "Últimos 12 meses", range: (t) => [addDays(t, -364), t] },
];

/** Label shown on the closed button for any applied period. */
export function periodText(r: { from: string; to: string; label: string }) {
  if (!r.from || !r.to) return r.label || "Últimos 30 dias";
  const range = r.from === r.to ? br(r.from) : `${br(r.from)} – ${br(r.to)}`;
  return PRESETS.some((p) => p.label === r.label) || /dias até/.test(r.label) ? `${r.label} · ${range}` : range;
}

function Month({ year, month, draft, today, onPick, hover, onHover }: { year: number; month: number; draft: { from: string; to: string }; today: string; onPick: (d: string) => void; hover: string; onHover: (d: string) => void }) {
  const first = new Date(year, month, 1, 12);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(year, month, i + 1, 12)))];
  const end = draft.to || (draft.from && hover && hover >= draft.from ? hover : "");
  return (
    <div className="drMonth" data-month={`${year}-${pad(month + 1)}`}>
      <div className="drMonthName">
        {MONTHS[month]?.replace(".", "").toUpperCase()}. DE {year}
      </div>
      <div className="drGrid">
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              disabled={d > today}
              className={
                "drDay" +
                (d === draft.from || d === end ? " edge" : "") +
                (draft.from && end && d > draft.from && d < end ? " inRange" : "") +
                (d === today ? " today" : "")
              }
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              aria-label={br(d)}
              aria-pressed={d === draft.from || d === end}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={"e" + i} />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Period picker modelled on the Google Ads one: presets on the left, start/end dates and a
 * scrolling calendar on the right. Choices are a draft until "Aplicar".
 */
export function DateRangePicker({
  value,
  onApply,
  compare,
  onCompare,
}: {
  value: Range;
  onApply: (from: string, to: string, label: string) => void;
  compare: boolean;
  onCompare: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => iso(new Date()), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Range>(value);
  const [draftCompare, setDraftCompare] = useState(compare);
  const [hover, setHover] = useState("");
  const [toToday, setToToday] = useState("30");
  const [toYesterday, setToYesterday] = useState("30");
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // 13 months: a year back plus the current month.
  const months = useMemo(() => {
    const t = parse(today);
    return Array.from({ length: 13 }, (_, i) => {
      const d = new Date(t.getFullYear(), t.getMonth() - 12 + i, 1, 12);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, [today]);

  useEffect(() => {
    if (!open) return;
    const fallback = PRESETS.find((p) => p.label === "30 dias atrás")!.range(today);
    setDraft(value.from && value.to ? value : { from: fallback[0], to: fallback[1], label: value.label || "30 dias atrás" });
    setDraftCompare(compare);
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

  const scrollTo = (ym: string, smooth = false) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-month="${ym}"]`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 34, behavior: smooth ? "smooth" : "auto" });
  };
  // Open on the month that holds the end date.
  useLayoutEffect(() => {
    if (open) scrollTo((value.to || today).slice(0, 7));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (d: string) => {
    if (!draft.from || draft.to || d < draft.from) setDraft({ from: d, to: "", label: "Personalizado" });
    else setDraft({ from: draft.from, to: d, label: "Personalizado" });
  };
  const setPreset = (p: Preset) => {
    const [from, to] = p.range(today);
    setDraft({ from, to, label: p.label });
    scrollTo(to.slice(0, 7), true);
  };
  const setDays = (n: string, untilYesterday: boolean) => {
    const v = Number(n);
    if (!Number.isInteger(v) || v < 1 || v > 365) return;
    const to = untilYesterday ? addDays(today, -1) : today;
    setDraft({ from: addDays(to, -(v - 1)), to, label: `${v} dias até ${untilYesterday ? "ontem" : "hoje"}` });
  };
  const visibleMonth = (draft.to || draft.from || today).slice(0, 7);
  const step = (dir: -1 | 1) => {
    const [y, m] = visibleMonth.split("-").map(Number);
    const d = new Date(y ?? 2000, (m ?? 1) - 1 + dir, 1, 12);
    scrollTo(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, true);
  };
  const ready = Boolean(draft.from && draft.to);

  return (
    <div className="drWrap" ref={box}>
      <button type="button" className="drTrigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <CalendarDays size={16} />
        <span>{periodText(value)}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="drPop" role="dialog" aria-label="Período de análise">
          <div className="drLeft">
            <div className="drLeftHead">Personalizar</div>
            <div className="drPresets">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className={"drPreset" + (draft.label === p.label ? " active" : "")} onClick={() => setPreset(p)}>
                  {p.label}
                  {p.hint && <small>({p.hint})</small>}
                </button>
              ))}
            </div>
            <div className="drDays">
              <label>
                <input type="number" min={1} max={365} value={toToday} onChange={(e) => setToToday(e.target.value)} onFocus={() => setDays(toToday, false)} onBlur={() => setDays(toToday, false)} onKeyDown={(e) => e.key === "Enter" && setDays(toToday, false)} aria-label="Dias até hoje" />
                dias até hoje
              </label>
              <label>
                <input type="number" min={1} max={365} value={toYesterday} onChange={(e) => setToYesterday(e.target.value)} onFocus={() => setDays(toYesterday, true)} onBlur={() => setDays(toYesterday, true)} onKeyDown={(e) => e.key === "Enter" && setDays(toYesterday, true)} aria-label="Dias até ontem" />
                dias até ontem
              </label>
            </div>
            <label className="drCompare">
              Comparar
              <input type="checkbox" role="switch" checked={draftCompare} onChange={(e) => setDraftCompare(e.target.checked)} />
              <span aria-hidden />
            </label>
          </div>

          <div className="drRight">
            <div className="drInputs">
              <label>
                <span>Data de início</span>
                <input type="date" value={draft.from} max={draft.to || today} onChange={(e) => e.target.value && setDraft({ ...draft, from: e.target.value, label: "Personalizado" })} />
              </label>
              <i aria-hidden>—</i>
              <label>
                <span>Data de término</span>
                <input type="date" value={draft.to} min={draft.from} max={today} onChange={(e) => e.target.value && setDraft({ ...draft, to: e.target.value, label: "Personalizado" })} />
              </label>
            </div>
            <div className="drNav">
              <strong>{(() => {
                const [y, m] = visibleMonth.split("-").map(Number);
                return `${MONTHS[(m ?? 1) - 1]?.toUpperCase()} DE ${y}`;
              })()}</strong>
              <span>
                <button type="button" onClick={() => step(-1)} aria-label="Mês anterior">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Próximo mês">
                  <ChevronRight size={18} />
                </button>
              </span>
            </div>
            <div className="drWeek">
              {WEEK.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="drScroll" ref={scroller} onMouseLeave={() => setHover("")}>
              {months.map((m) => (
                <Month key={`${m.year}-${m.month}`} year={m.year} month={m.month} draft={draft} today={today} onPick={pick} hover={hover} onHover={setHover} />
              ))}
            </div>
            <div className="drFoot">
              <small>{ready ? (draft.from === draft.to ? br(draft.from) : `${br(draft.from)} – ${br(draft.to)}`) : "Escolha a data de término"}</small>
              <button type="button" className="drCancel" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="drApply"
                disabled={!ready}
                onClick={() => {
                  onApply(draft.from, draft.to, draft.label === "Personalizado" ? (draft.from === draft.to ? br(draft.from) : `${br(draft.from)} – ${br(draft.to)}`) : draft.label);
                  onCompare(draftCompare);
                  setOpen(false);
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
