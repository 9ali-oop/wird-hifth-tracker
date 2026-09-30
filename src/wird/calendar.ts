// Reading a calendar link: URL safety, trimming to a date window, and the fetch itself (with an injected HTTP getter).

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

const MAX_BYTES = 5_000_000;
export type HttpGet = (url: string) => Promise<{ status: number; data: unknown; url?: string }>;
export type CalendarResult = { ok: true; ics: string } | { ok: false; message: string };

/** Reads a calendar link and returns the next three weeks of it. The getter is injected (native HTTP on the phone, a mock in tests). */
export async function readCalendar(input: string, get: HttpGet, now = Date.now()): Promise<CalendarResult> {
  const url = normalizeCalendarUrl(input);
  if (!url) return { ok: false, message: "That does not look like a calendar link from Google, Apple or Outlook." };
  let res: Awaited<ReturnType<HttpGet>>;
  try { res = await get(url); } catch { return { ok: false, message: "Could not reach the calendar. Check your connection and try again." }; }
  if (res.url && !normalizeCalendarUrl(res.url)) return { ok: false, message: "The link redirected somewhere that is not a calendar." };
  if (res.status < 200 || res.status >= 300) return { ok: false, message: "The calendar link did not work (" + res.status + "). Check the address." };
  const text = typeof res.data === "string" ? res.data : "";
  if (text.length > MAX_BYTES) return { ok: false, message: "That calendar is too large to read." };
  if (!/^\s*BEGIN:VCALENDAR/i.test(text)) return { ok: false, message: "That address did not return a calendar. Use the secret address in iCal format." };
  return { ok: true, ics: filterIcsWindow(text, now - 2 * 86400000, now + 21 * 86400000) };
}
