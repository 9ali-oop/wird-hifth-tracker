// Pure helpers for reading a calendar link on the server. No Convex imports, so they are also unit tested directly.

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
