// Pure logic for the wird tracker: Qur'an page maths, date keys, state cleaning and merging.
// No DOM in here, so all of it can be unit tested.
import { QDATA as Q } from "./quran-data";
import { cleanPrayer } from "./prayer";

export const PAGES = 604;
export const MAX_WIRDS = 30;
export const MAX_LOG_DAYS = 400;
export const MAX_GONE = 30;
export const MAX_TOMBSTONES = 200;

// ---------- Qur'an helpers (Madani 604-page mushaf) ----------
const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
export const surahName = (s: number) => Q.names[s - 1];
export const ayatCount = (s: number) => Q.n[s - 1];

export function pageEnd(p: number): number[] {
  if (p >= PAGES) return [114, 6];
  const [s, a] = Q.p[p];
  return a > 1 ? [s, a - 1] : [s - 1, Q.n[s - 2]];
}
export function ayatOnPage(p: number) {
  const st = Q.p[p - 1], en = pageEnd(p), out: { s: number; from: number; to: number }[] = [];
  for (let s = st[0]; s <= en[0]; s++) out.push({ s, from: s === st[0] ? st[1] : 1, to: s === en[0] ? en[1] : Q.n[s - 1] });
  return out;
}
export function pageOf(s: number, a: number): number {
  let p = 1;
  for (let i = 0; i < PAGES; i++) { if (cmp(Q.p[i], [s, a]) <= 0) p = i + 1; else break; }
  return p;
}
export const juzOf = (p: number) => (p < 22 ? 1 : Math.min(30, Math.floor((p - 22) / 20) + 2));
export function rangeText(p: number): string {
  const g = ayatOnPage(p), f = g[0], l = g[g.length - 1];
  return g.length === 1
    ? surahName(f.s) + " " + f.from + " to " + f.to
    : surahName(f.s) + " " + f.from + " to " + surahName(l.s) + " " + l.to;
}
export const surahPages = (s: number) => {
  const out: number[] = [];
  for (let p = pageOf(s, 1); p <= pageOf(s, Q.n[s - 1]); p++) out.push(p);
  return out;
};
export const juzPages = (j: number) => {
  const a = j === 1 ? 1 : 22 + 20 * (j - 2), b = j === 30 ? PAGES : 21 + 20 * (j - 1), out: number[] = [];
  for (let p = a; p <= b; p++) out.push(p);
  return out;
};
export function compress(list: number[]): string {
  if (!list.length) return "";
  const out: string[] = [];
  let a = list[0], b = list[0];
  for (let i = 1; i <= list.length; i++) {
    const x = list[i];
    if (x === b + 1) { b = x; continue; }
    out.push(a === b ? String(a) : a + "-" + b);
    a = b = x;
  }
  return out.join(", ");
}
export function parseRanges(t: unknown): number[] | null {
  const set = new Set<number>(), parts = String(t || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const x of parts) {
    const m = x.match(/^(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})$/i) || x.match(/^(\d{1,3})$/);
    if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > PAGES || a > b) return null;
    for (let i = a; i <= b; i++) set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}
export function selPages(sel: { by: string; items: number[] }): number[] {
  const set = new Set<number>();
  sel.items.forEach((x) => (sel.by === "juz" ? juzPages(x) : surahPages(x)).forEach((p) => set.add(p)));
  return [...set].sort((a, b) => a - b);
}

// ---------- dates (the day rolls over at 3am, so a late-night wird still counts for "today") ----------
const SHIFT = 3 * 3600000;
export const dayKey = (d: Date = new Date()) => {
  const x = new Date(d.getTime() - SHIFT);
  return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate();
};
export const daysAgo = (n: number) => {
  const d = new Date(Date.now() - SHIFT);
  d.setDate(d.getDate() - n);
  return dayKey(new Date(d.getTime() + SHIFT));
};
/** Noon on the logical day `n` days ago (for weekday labels and date maths). */
export const dateAgo = (n: number) => {
  const d = new Date(Date.now() - SHIFT);
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
};
const KEY_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

// ---------- planning ----------
/** Pages per day needed to finish `pagesLeft` pages in `days` days. */
export const targetForDays = (pagesLeft: number, days: number) =>
  Math.max(1, Math.min(PAGES, Math.ceil(Math.max(0, pagesLeft) / Math.max(1, days))));

/** How many of a day's `parts` sittings are complete, given pages read today and the daily target. */
export function sittingsDone(target: number, parts: number, today: number): number {
  if (!(target > 0) || !(parts > 0)) return 0;
  const per = target / parts;
  return Math.min(parts, Math.floor((today + 1e-9) / per));
}

/** Ahead/behind the finish line, in days, for a wird that has a target. Positive = ahead. */
export function paceDays(w: { target?: number; log?: Record<string, number> }, daysBack = 7): number {
  if (!w.target) return 0;
  let read = 0;
  for (let i = 0; i < daysBack; i++) read += (w.log && w.log[daysAgo(i)]) || 0;
  return Math.round((read - w.target * daysBack) / w.target);
}

// ---------- cleaning (sync data and backup codes are untrusted) ----------
const TYPE_ROUND: Record<string, string> = { khatmah: "Khatmah", hifz: "Cycle", custom: "Round" };
const TYPE_NAME: Record<string, string> = { khatmah: "Khatmah", hifz: "Hifz cycle", custom: "Wird" };
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : dflt;
};
// Like int(), but an out-of-range value is rejected (0) instead of clamped.
const strict = (v: unknown, lo: number, hi: number) => {
  const n = int(v, -Infinity, Infinity, 0);
  return n >= lo && n <= hi ? n : 0;
};
const rid = () => Math.random().toString(36).slice(2, 10);

export function cleanWird(raw: any, fallbackCreated = 0): any | null {
  if (!raw || typeof raw !== "object") return null;
  const w: any = {};
  w.type = TYPE_ROUND[raw.type] ? raw.type : raw.round === "Cycle" ? "hifz" : raw.ranges === "1-604" ? "khatmah" : "custom";
  w.round = TYPE_ROUND[w.type];
  w.id = String(raw.id == null ? "" : raw.id).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 24) || rid();
  w.name = String(raw.name == null ? "" : raw.name).replace(/\s+/g, " ").trim().slice(0, 40) || TYPE_NAME[w.type];
  const pages = parseRanges(raw.ranges) || (w.type === "hifz" || w.type === "custom" ? null : parseRanges("1-604"));
  if (!pages || !pages.length) return null;
  w.ranges = compress(pages);
  w.dir = raw.dir === -1 ? -1 : 1;
  w.target = int(raw.target, 0, PAGES, 0);
  w.parts = int(raw.parts, 0, 8, 0);
  const list = w.dir === -1 ? pages.slice().reverse() : pages;
  const page = int(raw.page, 1, PAGES, list[0]);
  w.page = pages.includes(page) ? page : list[0];
  w.ayah = null;
  if (Array.isArray(raw.ayah)) {
    const s = strict(raw.ayah[0], 1, 114), a = s ? strict(raw.ayah[1], 1, Q.n[s - 1]) : 0;
    if (s && a) w.ayah = [s, a];
  }
  w.cycle = int(raw.cycle, 1, 9999, 1);
  w.log = {};
  const log = { ...(raw.today && raw.today.date && raw.today.n ? { [raw.today.date]: raw.today.n } : {}), ...(raw.log && typeof raw.log === "object" ? raw.log : {}) };
  Object.keys(log).forEach((k) => { if (KEY_RE.test(k)) { const n = int(log[k], 0, 5000, 0); if (n) w.log[k] = n; } });
  // When each day's count was last changed, so two devices can merge day by day. A day can have a time and no
  // count: that records a count taken back to zero.
  w.logAt = {};
  if (raw.logAt && typeof raw.logAt === "object") Object.keys(raw.logAt).forEach((k) => { if (KEY_RE.test(k)) { const t = int(raw.logAt[k], 0, 8.64e15, 0); if (t) w.logAt[k] = t; } });
  trimLog(w);
  w.weak = Array.isArray(raw.weak) ? [...new Set<number>(raw.weak.map((p: unknown) => int(p, 0, PAGES, 0)).filter((p: number) => p && pages.includes(p)))].sort((a, b) => a - b) : [];
  w.sel = null;
  if (raw.sel && typeof raw.sel === "object" && (raw.sel.by === "surah" || raw.sel.by === "juz") && Array.isArray(raw.sel.items)) {
    const max = raw.sel.by === "juz" ? 30 : 114;
    const items = [...new Set<number>(raw.sel.items.map((x: unknown) => strict(x, 1, max)).filter(Boolean))].sort((a, b) => a - b);
    if (items.length) w.sel = { by: raw.sel.by, items };
  }
  // A missing creation time must not be "now": cleaning has to give the same answer every time it runs.
  w.createdAt = int(raw.createdAt, 0, 8.64e15, fallbackCreated);
  w.updatedAt = int(raw.updatedAt, 0, 8.64e15, 0);
  return w;
}
function trimLog(w: any) {
  const days = [...new Set([...Object.keys(w.log), ...Object.keys(w.logAt)])].sort((a, b) => dateVal(a) - dateVal(b));
  if (days.length > MAX_LOG_DAYS) days.slice(0, days.length - MAX_LOG_DAYS).forEach((k) => { delete w.log[k]; delete w.logAt[k]; });
}
const dateVal = (k: string) => { const [y, m, d] = k.split("-").map(Number); return y * 10000 + m * 100 + d; };

export function cleanState(raw: any): any {
  const out: any = { v: 5, wirds: [], gone: [], deleted: {}, updatedAt: 0, prayer: cleanPrayer(null) };
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.wirds)) return out;
  out.prayer = cleanPrayer(raw.prayer);
  const seen = new Set<string>();
  for (let i = 0; i < raw.wirds.length; i++) {
    const r = raw.wirds[i];
    const w = cleanWird(r, i + 1);
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.wirds.push(w);
    if (out.wirds.length >= MAX_WIRDS) break;
  }
  if (raw.deleted && typeof raw.deleted === "object") {
    const ok = Object.keys(raw.deleted).map((id) => [id, int(raw.deleted[id], 0, 8.64e15, 0)] as [string, number]).filter(([id, t]) => t && /^[a-z0-9]{1,24}$/.test(id));
    ok.sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, MAX_TOMBSTONES).forEach(([id, t]) => { out.deleted[id] = t; });
  }
  // Deleted wirds are kept (hidden) so a merge never loses data that a later edit on another device brings back.
  if (Array.isArray(raw.gone)) {
    for (let i = 0; i < raw.gone.length && out.gone.length < MAX_GONE; i++) {
      const w = cleanWird(raw.gone[i], i + 1);
      if (w && !seen.has(w.id)) { seen.add(w.id); out.gone.push(w); }
    }
  }
  if (raw.theme && typeof raw.theme === "object") {
    const pal = typeof raw.theme.pal === "string" ? raw.theme.pal : "sage";
    const mode = ["auto", "light", "dark"].includes(raw.theme.mode) ? raw.theme.mode : "auto";
    out.theme = { pal: /^[a-z]{1,12}$/.test(pal) ? pal : "sage", mode };
  }
  out.updatedAt = int(raw.updatedAt, 0, 8.64e15, 0);
  return out;
}

// ---------- merge (two devices) ----------
// A merge that gives the same answer whatever order devices sync in (commutative, associative, idempotent):
// - a wird's settings and position follow whichever copy was changed last (ties broken on content);
// - each day's count follows whichever copy changed that day last, so an undo on one device reaches the others
//   and days only one copy knows about are kept;
// - deletions are timestamps, and deleted wirds are kept hidden rather than dropped, so an edit made later on
//   another device brings the wird back with all its days.
const fieldsKey = (w: any) => JSON.stringify(norm({ ...w, log: null, logAt: null }));
function mergeWird(x: any, y: any): any {
  const dt = (x.updatedAt || 0) - (y.updatedAt || 0);
  const pick = dt > 0 || (dt === 0 && fieldsKey(x) >= fieldsKey(y)) ? x : y;
  const log: Record<string, number> = {}, logAt: Record<string, number> = {};
  const keys = new Set([...Object.keys(x.log || {}), ...Object.keys(x.logAt || {}), ...Object.keys(y.log || {}), ...Object.keys(y.logAt || {})]);
  for (const k of keys) {
    const has = (w: any) => (w.log && k in w.log) || (w.logAt && k in w.logAt);
    const tx = has(x) ? (x.logAt && x.logAt[k]) || x.updatedAt || 0 : -1, ty = has(y) ? (y.logAt && y.logAt[k]) || y.updatedAt || 0 : -1;
    const nx = (x.log && x.log[k]) || 0, ny = (y.log && y.log[k]) || 0;
    const useX = tx > ty || (tx === ty && nx >= ny);
    logAt[k] = useX ? tx : ty;
    const n = useX ? nx : ny;
    if (n) log[k] = n;
  }
  const out = { ...pick, log, logAt };
  trimLog(out);
  return out;
}
const byCreated = (x: any, y: any) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

export function mergeStates(a: any, b: any): any {
  if (!a) return b;
  if (!b) return a;
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  const del: Record<string, number> = { ...(a.deleted || {}) };
  Object.keys(b.deleted || {}).forEach((id) => { del[id] = Math.max(del[id] || 0, b.deleted[id] || 0); });
  const deleted: Record<string, number> = {};
  Object.keys(del).sort((x, y) => del[y] - del[x] || (x < y ? -1 : 1)).slice(0, MAX_TOMBSTONES).forEach((id) => { deleted[id] = del[id]; });
  const byId: Record<string, any> = {};
  for (const w of [...(a.wirds || []), ...(a.gone || []), ...(b.wirds || []), ...(b.gone || [])]) byId[w.id] = byId[w.id] ? mergeWird(byId[w.id], w) : w;
  const all = Object.values(byId);
  const isGone = (w: any) => deleted[w.id] !== undefined && deleted[w.id] >= (w.updatedAt || 0);
  // Cards are ordered by when they were created (then id), so every device lands on the same order.
  const wirds = all.filter((w) => !isGone(w)).sort(byCreated);
  const gone = all.filter(isGone).sort((x: any, y: any) => deleted[y.id] - deleted[x.id] || (x.id < y.id ? -1 : 1)).slice(0, MAX_GONE);
  // Reminder settings follow whichever copy was edited last; the calendar-derived days follow whichever was read last.
  const pa = a.prayer, pb = b.prayer;
  let prayer = pa || pb;
  if (pa && pb) {
    const win = (pb.updatedAt || 0) > (pa.updatedAt || 0) || ((pb.updatedAt || 0) === (pa.updatedAt || 0) && JSON.stringify(norm(pb)) > JSON.stringify(norm(pa))) ? pb : pa;
    const fresh = (pb.syncedAt || 0) > (pa.syncedAt || 0) || ((pb.syncedAt || 0) === (pa.syncedAt || 0) && JSON.stringify(norm(pb.days)) > JSON.stringify(norm(pa.days))) ? pb : pa;
    prayer = { ...win, days: fresh.days, syncedAt: fresh.syncedAt };
  }
  return { v: 5, wirds, gone, deleted, theme: newer.theme || a.theme || b.theme, prayer, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}

const norm = (v: any): any =>
  Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.keys(v).sort().reduce((o: any, k) => { o[k] = norm(v[k]); return o; }, {}) : v;

// Order-insensitive fingerprint, used to tell whether a merge changed anything.
export function stableKey(s: any): string {
  return JSON.stringify(norm({ wirds: (s && s.wirds) || [], gone: (s && s.gone) || [], deleted: (s && s.deleted) || {}, theme: (s && s.theme) || null, prayer: (s && s.prayer) || null }));
}
