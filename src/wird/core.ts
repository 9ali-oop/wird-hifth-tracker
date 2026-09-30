// Pure logic for the wird tracker: Qur'an page maths, date keys, state cleaning and merging.
// No DOM in here, so all of it can be unit tested.
import { QDATA as Q } from "./quran-data";

export const PAGES = 604;
export const MAX_WIRDS = 30;
export const MAX_LOG_DAYS = 400;

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

export function cleanWird(raw: any): any | null {
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
  const days = Object.keys(w.log).sort((a, b) => dateVal(a) - dateVal(b));
  if (days.length > MAX_LOG_DAYS) days.slice(0, days.length - MAX_LOG_DAYS).forEach((k) => delete w.log[k]);
  w.weak = Array.isArray(raw.weak) ? [...new Set<number>(raw.weak.map((p: unknown) => int(p, 0, PAGES, 0)).filter((p: number) => p && pages.includes(p)))].sort((a, b) => a - b) : [];
  w.sel = null;
  if (raw.sel && typeof raw.sel === "object" && (raw.sel.by === "surah" || raw.sel.by === "juz") && Array.isArray(raw.sel.items)) {
    const max = raw.sel.by === "juz" ? 30 : 114;
    const items = [...new Set<number>(raw.sel.items.map((x: unknown) => strict(x, 1, max)).filter(Boolean))].sort((a, b) => a - b);
    if (items.length) w.sel = { by: raw.sel.by, items };
  }
  const now = Date.now();
  w.createdAt = int(raw.createdAt, 0, 8.64e15, now);
  w.updatedAt = int(raw.updatedAt, 0, 8.64e15, 0);
  return w;
}
const dateVal = (k: string) => { const [y, m, d] = k.split("-").map(Number); return y * 10000 + m * 100 + d; };

export function cleanState(raw: any): any {
  const out: any = { v: 5, wirds: [], deleted: {}, updatedAt: 0 };
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.wirds)) return out;
  const seen = new Set<string>();
  for (const r of raw.wirds) {
    const w = cleanWird(r);
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.wirds.push(w);
    if (out.wirds.length >= MAX_WIRDS) break;
  }
  if (raw.deleted && typeof raw.deleted === "object") {
    Object.keys(raw.deleted).slice(0, 200).forEach((id) => {
      const t = int(raw.deleted[id], 0, 8.64e15, 0);
      if (t && /^[a-z0-9]{1,24}$/.test(id)) out.deleted[id] = t;
    });
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
// Position, target and settings follow whichever copy of a wird was changed last. The day log follows the
// same winner, so undoing or lowering a day's count on one device also sticks on the other; days that only
// the older copy knows about are kept.
export function mergeStates(a: any, b: any): any {
  if (!a) return b;
  if (!b) return a;
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  const deleted = Object.assign({}, a.deleted || {}, b.deleted || {});
  const byId: Record<string, any> = {};
  [...(a.wirds || []), ...(b.wirds || [])].forEach((w) => {
    const cur = byId[w.id];
    if (!cur) { byId[w.id] = w; return; }
    const dt = (w.updatedAt || 0) - (cur.updatedAt || 0);
    // Equal timestamps: break the tie on content so the result never depends on argument order.
    const pick = dt > 0 || (dt === 0 && JSON.stringify(norm(w)) > JSON.stringify(norm(cur))) ? w : cur;
    const other = pick === w ? cur : w;
    byId[w.id] = Object.assign({}, pick, { log: Object.assign({}, other.log || {}, pick.log || {}) });
  });
  const order = (newer.wirds || []).map((w: any) => w.id);
  Object.keys(byId).forEach((id) => { if (!order.includes(id)) order.push(id); });
  const wirds = order.map((id: string) => byId[id]).filter((w: any) => w && !(deleted[w.id] && deleted[w.id] >= (w.updatedAt || 0)));
  return { v: 5, wirds, deleted, theme: newer.theme || a.theme || b.theme, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}

const norm = (v: any): any =>
  Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.keys(v).sort().reduce((o: any, k) => { o[k] = norm(v[k]); return o; }, {}) : v;

// Order-insensitive fingerprint, used to tell whether a merge changed anything.
export function stableKey(s: any): string {
  return JSON.stringify(norm({ wirds: (s && s.wirds) || [], deleted: (s && s.deleted) || {}, theme: (s && s.theme) || null }));
}
