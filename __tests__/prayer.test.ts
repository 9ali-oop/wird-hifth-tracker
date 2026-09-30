process.env.TZ = "Europe/London"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_PRAYER_SETTINGS, cleanPrayer, civilKey, filterIcsWindow, fmtTime, nextUp, normalizeCalendarUrl, parseIcs, planReminders, prayerFromSummary,
  reminderText, remindersToIcs, timetableFromEvents, timesForDay, zonedToEpoch,
} from "../src/wird/prayer"

// Events copied from the real Prayer Times calendar (Masjid At-Tarbiyah), in Google's export format (UTC).
const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:Prayer Times", "X-WR-TIMEZONE:Europe/London",
  ev("Fajr", "20260930T043600Z", "20260930T050000Z", "Athan 05:36 · Iqamah 06:00\\nMasjid At-Tarbiyah\\, Nechells"),
  ev("Shuruq", "20260930T060800Z", "20260930T061300Z", "Athan 07:08 · No iqamah\\nMasjid At-Tarbiyah\\, Nechells"),
  ev("Dhuhr", "20260930T120200Z", "20260930T124500Z", "Athan 13:02 · Iqamah 13:45\\nMasjid At-Tarbiyah\\, Nechells"),
  ev("Asr", "20260930T150400Z", "20260930T151500Z", "Athan 16:04 · Iqamah 16:15\\nMasjid At-Tarbiyah\\, Nechells"),
  ev("Maghrib", "20260930T174700Z", "20260930T175700Z", "Athan 18:47 · Iqamah 18:47\\nMasjid At-Tarbiyah\\, Nechells"),
  ev("Isha", "20260930T184400Z", "20260930T191500Z", "Athan 19:44 · Iqamah 20:15\\nMasjid At-Tarbiyah\\, Nechells"),
  ev("Isha", "20261001T191700Z", "20261001T193000Z", "Athan 20:17 (estimated) · Iqamah 20:30\\nMasjid At-Tarbiyah\\, Nechells\\nMasjidbox published no Isha athan for this date (blank entry)."),
  ev("Dhuhr", "20261002T120200Z", "20261002T124500Z", "Athan 13:02 · Iqamah 13:45\\nMasjid At-Tarbiyah\\, Nechells\\nFriday: Jumuah athan 13:30 · iqamah 13:55"),
  "END:VCALENDAR",
].join("\r\n")
function ev(summary: string, s: string, e: string, d: string) {
  return ["BEGIN:VEVENT", "DTSTART:" + s, "DTEND:" + e, "SUMMARY:" + summary, "DESCRIPTION:" + d, "END:VEVENT"].join("\r\n")
}
const at = (y: number, m: number, d: number, h: number, mi: number) => zonedToEpoch(y, m, d, h, mi, "Europe/London")

describe("time zones", () => {
  it("converts London wall time to the right instant in BST and GMT", () => {
    expect(new Date(at(2026, 9, 30, 13, 45)).toISOString()).toBe("2026-09-30T12:45:00.000Z")
    expect(new Date(at(2026, 12, 1, 13, 45)).toISOString()).toBe("2026-12-01T13:45:00.000Z")
  })
  it("handles the clock-change days", () => {
    expect(new Date(at(2026, 3, 29, 12, 0)).toISOString()).toBe("2026-03-29T11:00:00.000Z") // BST began 29 Mar 2026
    expect(new Date(at(2026, 10, 25, 12, 0)).toISOString()).toBe("2026-10-25T12:00:00.000Z") // back to GMT on 25 Oct
  })
  it("formats a time back", () => {
    expect(fmtTime(at(2026, 9, 30, 6, 5))).toBe("06:05")
    expect(civilKey(at(2026, 9, 30, 0, 30))).toBe("2026-9-30")
  })
})

describe("reading the Prayer Times calendar", () => {
  const { events, tz } = parseIcs(ICS)
  const days = timetableFromEvents(events, tz)
  it("finds the calendar time zone and every event", () => {
    expect(tz).toBe("Europe/London")
    expect(events).toHaveLength(8)
    expect(events[0].description).toContain("Masjid At-Tarbiyah, Nechells")
  })
  it("ignores Shuruq", () => {
    expect(prayerFromSummary("Shuruq")).toBeNull()
    expect(Object.keys(days["2026-9-30"]).sort()).toEqual(["asr", "dhuhr", "fajr", "isha", "maghrib"])
  })
  it("uses the iqamah as the jamat time", () => {
    const d = days["2026-9-30"]
    expect(fmtTime(d.fajr!.j)).toBe("06:00")
    expect(fmtTime(d.fajr!.a)).toBe("05:36")
    expect(fmtTime(d.dhuhr!.j)).toBe("13:45")
    expect(fmtTime(d.asr!.j)).toBe("16:15")
    expect(fmtTime(d.isha!.j)).toBe("20:15")
  })
  it("Maghrib jamat is the athan when the iqamah equals it (the calendar pads the event by 10 minutes)", () => {
    const m = days["2026-9-30"].maghrib!
    expect(fmtTime(m.a)).toBe("18:47")
    expect(fmtTime(m.j)).toBe("18:47")
  })
  it("handles the estimated Isha athan line", () => {
    expect(fmtTime(days["2026-10-1"].isha!.j)).toBe("20:30")
    expect(fmtTime(days["2026-10-1"].isha!.a)).toBe("20:17")
  })
  it("uses the Jumuah iqamah on Fridays", () => {
    expect(fmtTime(days["2026-10-2"].dhuhr!.j)).toBe("13:55")
  })
  it("copes with junk, empty input and folded lines", () => {
    expect(parseIcs("").events).toEqual([])
    expect(parseIcs("garbage").events).toEqual([])
    const folded = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART:20260930T120200Z", "DTEND:20260930T124500Z", "SUMMARY:Dhu", " hr", "DESCRIPTION:Athan 13:02 · Iqamah 13:45", "END:VEVENT", "END:VCALENDAR"].join("\n")
    expect(timetableFromEvents(parseIcs(folded).events, "Europe/London")["2026-9-30"].dhuhr).toBeTruthy()
  })
  it("reads local TZID times and all-day dates without crashing", () => {
    const t = ["BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20260930T134500", "DTEND;TZID=Europe/London:20260930T135500", "SUMMARY:Dhuhr", "END:VEVENT", "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20260930", "SUMMARY:Holiday", "END:VEVENT"].join("\n")
    const r = parseIcs(t)
    expect(r.events).toHaveLength(2)
    expect(fmtTime(r.events[0].start)).toBe("13:45")
  })
})

describe("settings cleaning", () => {
  it("defaults on garbage", () => {
    expect(cleanPrayer(null)).toEqual(DEFAULT_PRAYER_SETTINGS)
    expect(cleanPrayer("x").prayers).toEqual([])
  })
  it("bounds offset, pages and times, and drops bad prayers", () => {
    const s = cleanPrayer({ offset: 9999, pages: -3, dir: 5, prayers: ["dhuhr", "bogus", "fajr", "dhuhr"], manual: { fajr: "6:05", dhuhr: "25:00", asr: "16:15 " }, wird: "<x>" })
    expect(s.offset).toBe(180)
    expect(s.pages).toBe(1)
    expect(s.dir).toBe(-1)
    expect(s.prayers).toEqual(["fajr", "dhuhr"])
    expect(s.manual).toEqual({ fajr: "06:05", asr: "16:15" })
    expect(s.wird).toBe("x")
  })
  it("drops malformed days", () => {
    const s = cleanPrayer({ days: { "2026-9-30": { fajr: { a: 5, j: 3 }, dhuhr: { a: 10, j: 20 } }, bad: {} } })
    expect(Object.keys(s.days)).toEqual(["2026-9-30"])
    expect(Object.keys(s.days["2026-9-30"])).toEqual(["dhuhr"])
  })
  it("keeps only the most recent 40 days", () => {
    const days: any = {}
    for (let i = 1; i <= 60; i++) days["2026-1-" + i] = { fajr: { a: 1, j: 1 } }
    expect(Object.keys(cleanPrayer({ days }).days).length).toBeLessThanOrEqual(40)
  })
})

describe("planning reminders", () => {
  const { events, tz } = parseIcs(ICS)
  const base = cleanPrayer({ mode: "calendar", days: timetableFromEvents(events, tz), prayers: ["dhuhr", "asr"], offset: 30, dir: -1, pages: 3 })
  it("plans 30 minutes before jamat", () => {
    const list = planReminders(base, at(2026, 9, 30, 0, 0), at(2026, 9, 30, 23, 59))
    expect(list.map((r) => r.prayer + " " + fmtTime(r.at) + " for " + fmtTime(r.jamat))).toEqual(["dhuhr 13:15 for 13:45", "asr 15:45 for 16:15"])
    expect(list[0].pages).toBe(3)
  })
  it("supports after-jamat and zero offsets", () => {
    const after = planReminders({ ...base, dir: 1, offset: 15 }, at(2026, 9, 30, 0, 0), at(2026, 9, 30, 23, 59))
    expect(after.map((r) => fmtTime(r.at))).toEqual(["14:00", "16:30"])
    const zero = planReminders({ ...base, offset: 0 }, at(2026, 9, 30, 0, 0), at(2026, 9, 30, 23, 59))
    expect(zero.map((r) => fmtTime(r.at))).toEqual(["13:45", "16:15"])
  })
  it("a before-Fajr reminder can land on the previous day and is still found", () => {
    const s = { ...base, prayers: ["fajr" as const], offset: 180, days: { "2026-9-30": base.days["2026-9-30"] } }
    const list = planReminders(s, at(2026, 9, 30, 0, 0), at(2026, 9, 30, 23, 59))
    expect(list.map((r) => fmtTime(r.at))).toEqual(["03:00"])
  })
  it("returns nothing with no prayers selected, or an inverted range", () => {
    expect(planReminders({ ...base, prayers: [] }, 0, 1e13)).toEqual([])
    expect(planReminders(base, 10, 5)).toEqual([])
  })
  it("uses Friday's Jumuah jamat", () => {
    const list = planReminders({ ...base, prayers: ["dhuhr"] }, at(2026, 10, 2, 0, 0), at(2026, 10, 2, 23, 59))
    expect(fmtTime(list[0].at)).toBe("13:25")
  })
  it("falls back to manual times for days the calendar does not cover", () => {
    const s = cleanPrayer({ prayers: ["dhuhr"], manual: { dhuhr: "13:30" }, offset: 15, dir: -1 })
    const list = planReminders(s, at(2027, 1, 5, 0, 0), at(2027, 1, 5, 23, 59))
    expect(list.map((r) => fmtTime(r.at))).toEqual(["13:15"])
  })
  it("calendar data wins over manual times on the days it covers", () => {
    const s = { ...base, prayers: ["dhuhr" as const], manual: { dhuhr: "12:00" } }
    const t = timesForDay(s, 2026, 9, 30)
    expect(fmtTime(t.dhuhr!.j)).toBe("13:45")
  })
  it("nextUp reports the coming prayer and whether its reminder is already due", () => {
    const n1 = nextUp(base, at(2026, 9, 30, 12, 0))!
    expect(n1.prayer).toBe("dhuhr"); expect(n1.due).toBe(false)
    const n2 = nextUp(base, at(2026, 9, 30, 13, 20))!
    expect(n2.prayer).toBe("dhuhr"); expect(n2.due).toBe(true)
    const n3 = nextUp(base, at(2026, 9, 30, 13, 50))!
    expect(n3.prayer).toBe("asr")
    expect(nextUp({ ...base, prayers: [] }, at(2026, 9, 30, 12, 0))).toBeNull()
  })
  it("describes a reminder in words", () => {
    const r = planReminders(base, at(2026, 9, 30, 0, 0), at(2026, 9, 30, 23, 59))[0]
    expect(reminderText(r, base)).toBe("Read 3 pages 30 min before Dhuhr jamat (13:45)")
    expect(reminderText({ ...r, pages: 1 }, { offset: 0, dir: -1 })).toBe("Read 1 page at Dhuhr jamat (13:45)")
  })
})

describe("calendar export", () => {
  const { events, tz } = parseIcs(ICS)
  const s = cleanPrayer({ days: timetableFromEvents(events, tz), prayers: ["dhuhr"], offset: 30, dir: -1, pages: 4 })
  const list = planReminders(s, at(2026, 9, 30, 0, 0), at(2026, 10, 2, 23, 59))
  const ics = remindersToIcs(list, { wirdName: "Hifz cycle", page: 143, now: Date.UTC(2026, 8, 30, 3, 0, 0), offset: 30, dir: -1 })
  it("is a well formed calendar with one alarmed event per reminder", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(2) // the sample has Dhuhr on 30 Sep and 2 Oct
    expect((ics.match(/BEGIN:VALARM/g) || []).length).toBe(2)
    expect(ics).toContain("TRIGGER:PT0M")
    expect(ics).toContain("SUMMARY:Wird: 4 pages before Dhuhr")
    expect(ics).toContain("DTSTART:20260930T121500Z") // 13:15 BST
    expect(ics).toContain("UID:wird-2026-9-30-dhuhr@wird")
    expect(ics).toContain("TRANSP:TRANSPARENT")
  })
  it("escapes special characters and keeps every line within 75 bytes", () => {
    const one = remindersToIcs(list.slice(0, 1), { wirdName: "A, B; C\nD", page: 1, offset: 30, dir: -1, now: 0 })
    expect(one).toContain("A\\, B\\; C\\nD")
    for (const line of one.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
  it("Friday reminder is relative to the Jumuah jamat", () => {
    expect(ics).toContain("DTSTART:20261002T122500Z") // 13:25 BST
  })
  it("an empty plan is still a valid calendar", () => {
    const e = remindersToIcs([], { offset: 30, dir: -1 })
    expect(e).toContain("BEGIN:VCALENDAR")
    expect(e).not.toContain("VEVENT")
  })
})

describe("calendar link safety", () => {
  it.each([
    "https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-123/basic.ics",
    "webcal://calendar.google.com/calendar/ical/x/private-1/basic.ics",
    "https://p12-caldav.icloud.com/published/2/abc",
    "webcals://p12-caldav.icloud.com/published/2/abc",
    "https://outlook.office365.com/owa/calendar/x/y/calendar.ics",
    "  https://outlook.live.com/owa/calendar/x/y/calendar.ics  ",
  ])("accepts %s", (u) => { expect(normalizeCalendarUrl(u)).toMatch(/^https:\/\//) })
  it.each([
    "", "not a url", "http://calendar.google.com/x.ics", "https://evil.com/calendar.ics", "https://calendar.google.com.evil.com/x.ics",
    "https://evilcalendar.google.com/x", "https://user:pw@calendar.google.com/x.ics", "https://calendar.google.com:8443/x.ics",
    "file:///etc/passwd", "ftp://calendar.google.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data",
    "javascript:alert(1)", "https://icloud.com.evil.com/x", "https://xicloud.com/x", "https://" + "a".repeat(2100) + ".icloud.com",
  ])("rejects %s", (u) => { expect(normalizeCalendarUrl(u)).toBeNull() })
})

describe("trimming a large calendar", () => {
  const many = ["BEGIN:VCALENDAR", "X-WR-TIMEZONE:Europe/London"]
  for (let d = 1; d <= 28; d++) many.push(ev("Fajr", "202609" + String(d).padStart(2, "0") + "T043600Z", "202609" + String(d).padStart(2, "0") + "T050000Z", "Athan 05:36 · Iqamah 06:00"))
  many.push("END:VCALENDAR")
  it("keeps the header and only events near the window", () => {
    const out = filterIcsWindow(many.join("\r\n"), Date.UTC(2026, 8, 10), Date.UTC(2026, 8, 14))
    expect(out).toContain("X-WR-TIMEZONE:Europe/London")
    const got = parseIcs(out).events.map((e) => new Date(e.start).getUTCDate())
    expect(got).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16])
    expect(out.startsWith("BEGIN:VCALENDAR")).toBe(true)
    expect(out.trimEnd().endsWith("END:VCALENDAR")).toBe(true)
  })
  it("a trimmed calendar still parses to the same times", () => {
    const out = filterIcsWindow(ICS, Date.UTC(2026, 8, 30), Date.UTC(2026, 9, 2))
    const days = timetableFromEvents(parseIcs(out).events, parseIcs(out).tz)
    expect(fmtTime(days["2026-9-30"].dhuhr!.j)).toBe("13:45")
  })
  it("handles empty input", () => { expect(filterIcsWindow("", 0, 1)).toBe("\r\n") })
})
