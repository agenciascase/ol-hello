// Pure date helpers shared by browser and server (no Node APIs).
export type ReportPeriod = "last_7_days" | "last_30_days" | "previous_month" | "previous_week" | "month_to_yesterday";
export type Frequency = "weekly" | "biweekly" | "monthly";
export type ScheduleInput = { frequency: Frequency; weekdays: number[]; day_of_month: number | null; send_time: string };

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  last_7_days: "Últimos 7 dias",
  last_30_days: "Últimos 30 dias",
  previous_week: "Semana anterior",
  previous_month: "Mês anterior",
  month_to_yesterday: "Mês atual até ontem",
};
export const METRICS = [
  ["spend", "Gasto"], ["impressions", "Impressões"], ["clicks", "Cliques"], ["ctr", "CTR"], ["cpc", "CPC"], ["cpm", "CPM"],
  ["conversions", "Conversões"], ["cpa", "CPA"], ["roas", "ROAS"], ["leads", "Leads"], ["reach", "Alcance"], ["frequency", "Frequência"],
] as const;
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function localParts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, min: +p.minute!, s: +p.second! };
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
  return `${p.weekday}, ${p.day} de ${p.month}, ${p.hour}:${p.minute}`;
}

export const E164 = /^\+[1-9]\d{7,14}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
