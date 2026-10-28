// Pure date helpers shared by browser and server (no Node APIs).
/**
 * Report period code. Relative codes move forward on every send; "custom_<from>_<to>" is fixed.
 * Legacy: last_7_days, last_30_days (both until yesterday), previous_week (Mon–Sun), previous_month, month_to_yesterday.
 * New: today, yesterday, this_week (Sun–today), last_week (Sun–Sat), this_month, last_month, last_12_months,
 * days_today_<N>, days_yesterday_<N>, custom_<YYYY-MM-DD>_<YYYY-MM-DD>.
 */
export type ReportPeriod = string;
export const PERIOD_RE = /^(last_7_days|last_30_days|previous_month|previous_week|month_to_yesterday|today|yesterday|this_week|last_week|this_month|last_month|last_12_months|days_(today|yesterday)_([1-9]\d{0,2})|custom_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2}))$/;
export type Frequency = "weekly" | "biweekly" | "monthly";
export type ScheduleInput = { frequency: Frequency; weekdays: number[]; day_of_month: number | null; send_time: string };

export const PERIOD_LABELS: Record<string, string> = {
  last_7_days: "Últimos 7 dias",
  last_30_days: "Últimos 30 dias",
  previous_week: "Semana anterior",
  previous_month: "Mês anterior",
  month_to_yesterday: "Mês atual até ontem",
  today: "Hoje",
  yesterday: "Ontem",
  this_week: "Esta semana",
  last_week: "Semana passada",
  this_month: "Este mês",
  last_month: "Último mês",
  last_12_months: "Últimos 12 meses",
};

/** Human label for any period code ("" for a fixed custom range, whose dates speak for themselves). */
export function periodLabel(code: string): string {
  if (PERIOD_LABELS[code]) return PERIOD_LABELS[code]!;
  const m = PERIOD_RE.exec(code);
  if (m?.[2]) return `${m[3]} dias até ${m[2] === "today" ? "hoje" : "ontem"}`;
  return code.startsWith("custom_") ? "" : "Período";
}
export const METRICS = [
  ["spend", "Investimento"], ["revenue", "Receita"], ["impressions", "Impressões"], ["clicks", "Cliques"], ["ctr", "CTR"], ["cpc", "CPC"], ["cpm", "CPM"],
  ["conversions", "Conversões"], ["cpa", "CPA"], ["roas", "ROAS"], ["leads", "Leads"], ["reach", "Alcance"], ["frequency", "Frequência"], ["calls", "Ligações"],
] as const;
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function localParts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p["year"]!, m: +p["month"]!, d: +p["day"]!, h: +p["hour"]!, min: +p["minute"]!, s: +p["second"]! };
}
function offsetMs(date: Date, tz: string) {
  const p = localParts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}
/** Converts a wall-clock time in `tz` to a UTC Date. */
export function localToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Resolves a report period to inclusive YYYY-MM-DD ranges in the client's time zone. */
export function resolvePeriod(period: ReportPeriod, tz: string, now = new Date()) {
  const p = localParts(now, tz);
  const today = new Date(Date.UTC(p.y, p.m - 1, p.d));
  let start: Date, end: Date, prevStart: Date, prevEnd: Date;
  const m = PERIOD_RE.exec(period);
  const span = (a: Date, b: Date) => {
    const len = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
    return { since: iso(a), until: iso(b), prevSince: iso(addDays(a, -len)), prevUntil: iso(addDays(a, -1)) };
  };
  if (m?.[4] && m[5]) {
    const a = new Date(m[4] + "T00:00:00Z"), b = new Date(m[5] + "T00:00:00Z");
    return a <= b ? span(a, b) : span(b, a);
  }
  if (m?.[2]) {
    const n = Math.min(365, Number(m[3]));
    const e = m[2] === "today" ? today : addDays(today, -1);
    return span(addDays(e, -(n - 1)), e);
  }
  const dowSun = today.getUTCDay();
  if (period === "today") return span(today, today);
  if (period === "yesterday") return span(addDays(today, -1), addDays(today, -1));
  if (period === "this_week") return span(addDays(today, -dowSun), today);
  if (period === "last_week") return span(addDays(today, -dowSun - 7), addDays(today, -dowSun - 1));
  if (period === "last_12_months") return span(addDays(today, -364), today);
  if (period === "this_month") {
    const first = new Date(Date.UTC(p.y, p.m - 1, 1));
    const prevFirst = new Date(Date.UTC(p.y, p.m - 2, 1));
    const prevLast = new Date(Date.UTC(p.y, p.m - 1, 0)).getUTCDate();
    return { since: iso(first), until: iso(today), prevSince: iso(prevFirst), prevUntil: iso(new Date(Date.UTC(p.y, p.m - 2, Math.min(p.d, prevLast)))) };
  }
  if (period === "last_month") period = "previous_month";
  if (period === "last_7_days" || period === "last_30_days") {
    const n = period === "last_7_days" ? 7 : 30;
    end = addDays(today, -1); start = addDays(today, -n);
    prevEnd = addDays(start, -1); prevStart = addDays(start, -n);
  } else if (period === "previous_week") {
    const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
    start = addDays(today, -dow - 7); end = addDays(start, 6);
    prevStart = addDays(start, -7); prevEnd = addDays(start, -1);
  } else if (period === "previous_month" || (period === "month_to_yesterday" && p.d === 1)) {
    start = new Date(Date.UTC(p.y, p.m - 2, 1)); end = new Date(Date.UTC(p.y, p.m - 1, 0));
    prevStart = new Date(Date.UTC(p.y, p.m - 3, 1)); prevEnd = new Date(Date.UTC(p.y, p.m - 2, 0));
  } else {
    start = new Date(Date.UTC(p.y, p.m - 1, 1)); end = addDays(today, -1);
    prevStart = new Date(Date.UTC(p.y, p.m - 2, 1));
    const prevLast = new Date(Date.UTC(p.y, p.m - 1, 0)).getUTCDate();
    prevEnd = new Date(Date.UTC(p.y, p.m - 2, Math.min(p.d - 1, prevLast)));
  }
  return { since: iso(start), until: iso(end), prevSince: iso(prevStart), prevUntil: iso(prevEnd) };
}

/** Next send time (UTC) for a schedule, respecting the client's time zone. Biweekly runs 14 days after `lastRun`. */
export function computeNextRun(s: ScheduleInput, tz: string, now = new Date(), lastRun?: Date | null): Date | null {
  const [hh, mm] = s.send_time.split(":").map(Number);
  const p = localParts(now, tz);
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d));
  for (let i = 0; i < 70; i++) {
    const day = addDays(base, i);
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    let match: boolean;
    if (s.frequency === "monthly") {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      match = d === Math.min(s.day_of_month ?? 1, last);
    } else match = s.weekdays.includes(day.getUTCDay());
    if (!match) continue;
    const at = localToUtc(y, m, d, hh ?? 9, mm ?? 0, tz);
    if (at <= now) continue;
    if (s.frequency === "biweekly" && lastRun && at.getTime() < lastRun.getTime() + 13 * 86400000) continue;
    return at;
  }
  return null;
}

export function formatNextRun(date: Date | null, tz: string) {
  if (!date) return "Sem próximo envio";
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p["weekday"]}, ${p["day"]} de ${p["month"]}, ${p["hour"]}:${p["minute"]}`;
}

export const E164 = /^\+[1-9]\d{7,14}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
