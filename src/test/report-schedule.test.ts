import { describe, expect, it } from "vitest";
import { computeNextRun, formatNextRun, resolvePeriod } from "@/lib/report-schedule";

const TZ = "America/Sao_Paulo";
describe("report schedule", () => {
  it("weekly Monday 09:00 in São Paulo is 12:00 UTC", () => {
    const now = new Date("2025-10-29T15:00:00Z"); // Wednesday
    const next = computeNextRun({ frequency: "weekly", weekdays: [1], day_of_month: null, send_time: "09:00" }, TZ, now);
    expect(next?.toISOString()).toBe("2025-11-03T12:00:00.000Z");
    expect(formatNextRun(next, TZ)).toBe("segunda-feira, 3 de novembro, 09:00");
  });
  it("monthly day 31 clamps to the last day of the month", () => {
    const now = new Date("2025-11-10T12:00:00Z");
    const next = computeNextRun({ frequency: "monthly", weekdays: [], day_of_month: 31, send_time: "08:30" }, TZ, now);
    expect(next?.toISOString()).toBe("2025-11-30T11:30:00.000Z");
  });
  it("biweekly skips the week right after the last run", () => {
    const now = new Date("2025-11-04T00:00:00Z");
    const next = computeNextRun({ frequency: "biweekly", weekdays: [1], day_of_month: null, send_time: "09:00" }, TZ, now, new Date("2025-11-03T12:00:00Z"));
    expect(next?.toISOString()).toBe("2025-11-17T12:00:00.000Z");
  });
  it("last 7 days ends yesterday in the client's time zone", () => {
    expect(resolvePeriod("last_7_days", TZ, new Date("2025-11-05T02:00:00Z"))).toEqual({ since: "2025-10-28", until: "2025-11-03", prevSince: "2025-10-21", prevUntil: "2025-10-27" });
  });
  it("previous month and previous week", () => {
    const now = new Date("2025-11-05T15:00:00Z");
    expect(resolvePeriod("previous_month", TZ, now)).toMatchObject({ since: "2025-10-01", until: "2025-10-31", prevSince: "2025-09-01", prevUntil: "2025-09-30" });
    expect(resolvePeriod("previous_week", TZ, now)).toMatchObject({ since: "2025-10-27", until: "2025-11-02" });
  });
});
