// Prayer-time logic for reminders: calendar (iCal) parsing, per-day jamat times, reminder planning and .ics export.
// Pure functions only, so it can run in the browser, in Convex and in tests.

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type Prayer = (typeof PRAYERS)[number];
export const PRAYER_LABEL: Record<Prayer, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

/** Athan and jamat (congregation) time of one prayer, as epoch milliseconds. */
export type PrayerTime = { a: number; j: number };
export type DayTimes = Partial<Record<Prayer, PrayerTime>>;

export type PrayerSettings = {
  mode: "calendar" | "manual";
  manual: Partial<Record<Prayer, string>>; // "HH:MM" jamat times, used when there is no calendar data for a day
  days: Record<string, DayTimes>; // civil date key "y-m-d" -> times, filled from the calendar
  prayers: Prayer[]; // which prayers get a reminder
  offset: number; // minutes, 0..180
  dir: -1 | 1; // -1 = before jamat, 1 = after
  pages: number; // pages to read at each reminder
  wird: string; // id of the wird the reminder is for ("" = the first one)
  syncedAt: number; // when the calendar was last read
  updatedAt: number;
};

export const MAX_OFFSET = 180;
export const MAX_REMINDER_PAGES = 50;
export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  mode: "calendar", manual: {}, days: {}, prayers: [], offset: 30, dir: -1, pages: 3, wird: "", syncedAt: 0, updatedAt: 0,
};

const pad = (n: number) => String(n).padStart(2, "0");
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// ---------- time zones ----------
function tzOffsetMs(epoch: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const p: Record<string, number> = {};
  f.formatToParts(new Date(epoch)).forEach((x) => { if (x.type !== "literal") p[x.type] = Number(x.value); });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epoch / 1000) * 1000;
}
/** Epoch for a wall-clock time in a given IANA zone (or the device zone when tz is empty). */
export function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, tz?: string): number {
  if (!tz) return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}
/** Civil date parts of an instant in a zone. */
export function civilParts(epoch: number, tz?: string) {
  if (!tz) { const d = new Date(epoch); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), wd: d.getDay(), h: d.getHours(), mi: d.getMinutes() }; }
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const p: Record<string, string> = {};
  f.formatToParts(new Date(epoch)).forEach((x) => { if (x.type !== "literal") p[x.type] = x.value; });
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, wd, h: +p.hour, mi: +p.minute };
}
export const civilKey = (epoch: number, tz?: string) => { const c = civilParts(epoch, tz); return c.y + "-" + c.m + "-" + c.d; };
export function fmtTime(epoch: number, tz?: string): string { const c = civilParts(epoch, tz); return pad(c.h) + ":" + pad(c.mi); }

// ---------- iCal parsing ----------
export type IcsEvent = { summary: string; description: string; start: number; end: number };

function unescapeText(s: string) {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function parseIcsDate(value: string, params: string, calTz: string): number | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0;
  if (m[7]) return Date.UTC(y, mo - 1, d, h, mi, m[6] ? +m[6] : 0);
  const tzid = (params.match(/TZID=([^;:]+)/i) || [])[1] || calTz || "";
  try { return zonedToEpoch(y, mo, d, h, mi, tzid); } catch { return zonedToEpoch(y, mo, d, h, mi, ""); }
}

/** Reads the events of an iCal document. Recurrence rules are not expanded. */
export function parseIcs(text: string): { events: IcsEvent[]; tz: string } {
  const lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: IcsEvent[] = [];
  let tz = "";
  let cur: Record<string, { v: string; p: string }> | null = null;
  for (const line of lines) {
    if (line.startsWith("X-WR-TIMEZONE:")) tz = line.slice(14).trim();
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.DTSTART) {
        const start = parseIcsDate(cur.DTSTART.v, cur.DTSTART.p, tz);
        const end = cur.DTEND ? parseIcsDate(cur.DTEND.v, cur.DTEND.p, tz) : start;
        if (start != null && end != null) events.push({ summary: unescapeText(cur.SUMMARY ? cur.SUMMARY.v : ""), description: unescapeText(cur.DESCRIPTION ? cur.DESCRIPTION.v : ""), start, end });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 1) continue;
    const head = line.slice(0, i), v = line.slice(i + 1);
    const semi = head.indexOf(";");
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    if (!cur[name]) cur[name] = { v, p: semi < 0 ? "" : head.slice(semi + 1) };
  }
  return { events, tz };
}

export function prayerFromSummary(s: string): Prayer | null {
  const t = String(s || "").trim().toLowerCase();
  if (/^fajr|^fajar|^subh/.test(t)) return "fajr";
  if (/^dhuhr|^zuhr|^duhr|^dhur|^zohr/.test(t)) return "dhuhr";
  if (/^asr/.test(t)) return "asr";
  if (/^maghrib|^magrib/.test(t)) return "maghrib";
  if (/^isha|^esha|^ishaa/.test(t)) return "isha";
  return null;
}

/**
 * Builds per-day jamat times from calendar events shaped like the Prayer Times calendar:
 * start = athan, end = iqamah, description "Athan HH:MM · Iqamah HH:MM" (or "No iqamah"),
 * and optionally "Jumuah athan HH:MM · iqamah HH:MM" on Fridays.
 * When the description says the iqamah equals the athan, jamat is the athan itself.
 */
export function timetableFromEvents(events: IcsEvent[], tz?: string): Record<string, DayTimes> {
  const days: Record<string, DayTimes> = {};
  for (const ev of events) {
    const p = prayerFromSummary(ev.summary);
    if (!p) continue;
    const c = civilParts(ev.start, tz);
    const key = c.y + "-" + c.m + "-" + c.d;
    const desc = ev.description || "";
    const athanTxt = (desc.match(/Athan\s+(\d{1,2}:\d{2})/i) || [])[1];
    const iqTxt = (desc.match(/Iqamah\s+(\d{1,2}:\d{2})/i) || [])[1];
    let j = ev.end > ev.start ? ev.end : ev.start;
    if (/no iqamah/i.test(desc)) j = ev.start;
    else if (iqTxt && athanTxt && iqTxt === athanTxt) j = ev.start;
    if (p === "dhuhr" && c.wd === 5) {
      const jm = desc.match(/Jumu'?ah[^\n]*?iqamah\s+(\d{1,2}):(\d{2})/i);
      if (jm) j = zonedToEpoch(c.y, c.m, c.d, +jm[1], +jm[2], tz);
    }
    if (!(j >= ev.start)) j = ev.start;
    (days[key] = days[key] || {})[p] = { a: ev.start, j };
  }
  return days;
}

// ---------- settings ----------
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : dflt;
};
export function cleanPrayer(raw: any): PrayerSettings {
  const out: PrayerSettings = { ...DEFAULT_PRAYER_SETTINGS, manual: {}, days: {}, prayers: [] };
  if (!raw || typeof raw !== "object") return out;
  out.mode = raw.mode === "manual" ? "manual" : "calendar";
  if (raw.manual && typeof raw.manual === "object") {
    for (const p of PRAYERS) { const v = raw.manual[p]; if (typeof v === "string" && HHMM.test(v.trim())) { const m = v.trim().match(HHMM)!; out.manual[p] = pad(+m[1]) + ":" + m[2]; } }
  }
  if (raw.days && typeof raw.days === "object") {
    const keys = Object.keys(raw.days).filter((k) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(k)).sort().slice(-40);
    for (const k of keys) {
      const day: DayTimes = {};
      for (const p of PRAYERS) {
        const t = raw.days[k] && raw.days[k][p];
        if (t && typeof t === "object") { const a = int(t.a, 0, 8.64e15, 0), j = int(t.j, 0, 8.64e15, 0); if (a && j >= a) day[p] = { a, j }; }
      }
      if (Object.keys(day).length) out.days[k] = day;
    }
  }
  out.prayers = Array.isArray(raw.prayers) ? PRAYERS.filter((p) => raw.prayers.includes(p)) : [];
  out.offset = int(raw.offset, 0, MAX_OFFSET, 30);
  out.dir = raw.dir === 1 ? 1 : -1;
  out.pages = int(raw.pages, 1, MAX_REMINDER_PAGES, 3);
  out.wird = typeof raw.wird === "string" ? raw.wird.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 24) : "";
  out.syncedAt = int(raw.syncedAt, 0, 8.64e15, 0);
  out.updatedAt = int(raw.updatedAt, 0, 8.64e15, 0);
  return out;
}

// ---------- planning ----------
/** Jamat/athan times for a civil day from calendar data, falling back to the manual times. */
export function timesForDay(s: PrayerSettings, y: number, m: number, d: number): DayTimes {
  const cal = s.days[y + "-" + m + "-" + d];
  const out: DayTimes = { ...(cal || {}) };
  for (const p of PRAYERS) {
    if (out[p]) continue;
    const hm = s.manual[p] && s.manual[p]!.match(HHMM);
    if (hm) { const t = zonedToEpoch(y, m, d, +hm[1], +hm[2], ""); out[p] = { a: t, j: t }; }
  }
  return out;
}

export type Reminder = { at: number; prayer: Prayer; jamat: number; pages: number; day: string };

/** Every reminder falling in [from, to], in time order. */
export function planReminders(s: PrayerSettings, from: number, to: number): Reminder[] {
  const out: Reminder[] = [];
  if (!s.prayers.length || to < from) return out;
  const start = new Date(from); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - 1);
  for (let t = start.getTime(); t <= to + 86400000; ) {
    const c = new Date(t), y = c.getFullYear(), m = c.getMonth() + 1, d = c.getDate();
    const day = timesForDay(s, y, m, d);
    for (const p of s.prayers) {
      const pt = day[p];
      if (!pt) continue;
      const at = pt.j + s.dir * s.offset * 60000;
      if (at >= from && at <= to) out.push({ at, prayer: p, jamat: pt.j, pages: s.pages, day: y + "-" + m + "-" + d });
    }
    const n = new Date(c); n.setDate(n.getDate() + 1); t = n.getTime();
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The prayer whose jamat is next (or still ahead), with its reminder time. */
export function nextUp(s: PrayerSettings, now: number): (Reminder & { due: boolean }) | null {
  const list = planReminders(s, now - 6 * 3600000, now + 48 * 3600000).filter((r) => r.jamat >= now);
  const r = list[0];
  return r ? { ...r, due: r.at <= now } : null;
}

// ---------- calendar export ----------
const utcStamp = (t: number) => { const d = new Date(t); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"; };
const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = []; let cur = "", len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** An .ics with one short event per reminder, each with an alert at its start. Stable UIDs let re-imports replace old ones. */
export function remindersToIcs(list: Reminder[], opts: { wirdName?: string; page?: number; now?: number; offset: number; dir: -1 | 1 }): string {
  const stamp = utcStamp(opts.now ?? Date.now());
  const L: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wird//Prayer reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Wird reminders"];
  for (const r of list) {
    const label = PRAYER_LABEL[r.prayer];
    const when = opts.offset === 0 ? "at" : opts.offset + " min " + (opts.dir === -1 ? "before" : "after");
    const title = "Wird: " + r.pages + (r.pages === 1 ? " page " : " pages ") + (opts.dir === -1 ? "before " : "after ") + label;
    const desc = (opts.wirdName ? opts.wirdName + (opts.page ? ", from page " + opts.page : "") + "\n" : "") + label + " jamat " + fmtTime(r.jamat) + " (" + when + ")";
    L.push("BEGIN:VEVENT", "UID:wird-" + r.day + "-" + r.prayer + "@wird", "DTSTAMP:" + stamp, "DTSTART:" + utcStamp(r.at), "DTEND:" + utcStamp(r.at + 10 * 60000), fold("SUMMARY:" + icsEscape(title)), fold("DESCRIPTION:" + icsEscape(desc)), "TRANSP:TRANSPARENT", "BEGIN:VALARM", "ACTION:DISPLAY", fold("DESCRIPTION:" + icsEscape(title)), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

/** Human text for a reminder, used by notifications and the "next up" line. */
export function reminderText(r: { prayer: Prayer; jamat: number; pages: number }, s: { offset: number; dir: -1 | 1 }): string {
  const label = PRAYER_LABEL[r.prayer];
  return "Read " + r.pages + (r.pages === 1 ? " page" : " pages") + " " + (s.offset === 0 ? "at " : s.offset + " min " + (s.dir === -1 ? "before " : "after ")) + label + " jamat (" + fmtTime(r.jamat) + ")";
}

// ---------- calendar link safety and trimming (used by the Convex action, tested here) ----------
const CAL_HOSTS = [/^calendar\.google\.com$/i, /(^|\.)icloud\.com$/i, /^outlook\.(office365|live)\.com$/i, /^outlook\.office\.com$/i];

/** Accepts only https (or webcal) links to Google, Apple or Outlook calendars. Returns the https URL, or null. */
export function normalizeCalendarUrl(input: string): string | null {
  let t = String(input || "").trim();
  if (!t || t.length > 2000) return null;
  t = t.replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!CAL_HOSTS.some((re) => re.test(u.hostname))) return null;
  return u.toString();
}

/** Keeps the calendar header (time zone info included) and only the events starting inside [from, to] (epoch ms, day precision). */
export function filterIcsWindow(text: string, from: number, to: number): string {
  const lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const lo = ymd(new Date(from - 2 * 86400000)), hi = ymd(new Date(to + 2 * 86400000));
  const out: string[] = [];
  let block: string[] | null = null, inRange = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { block = [line]; inRange = false; continue; }
    if (block) {
      block.push(line);
      if (line.startsWith("DTSTART")) { const m = line.match(/:(\d{8})/); const d = m ? Number(m[1]) : 0; inRange = d >= lo && d <= hi; }
      if (line === "END:VEVENT") { if (inRange) out.push(...block); block = null; }
      continue;
    }
    if (line) out.push(line);
  }
  return out.join("\r\n") + "\r\n";
}
const ymd = (d: Date) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
