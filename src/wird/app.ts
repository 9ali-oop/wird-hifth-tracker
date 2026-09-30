// @ts-nocheck
import { QDATA as Q } from "./quran-data";

const KEY = "wird-bookmarks-v3";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- themes: bg, surface, ink, muted, line, accent, done, done-ink, warn ----------
export const PAL = {
  sage:  { name: "Sage",  light: ["#EDF1EC","#F8FAF7","#1D332E","#5E7069","#CBD6CF","#9A7624","#2F5C4F","#F3F6F2","#A8473A"], dark: ["#101916","#18231F","#E2E9E4","#93A59D","#2A3933","#D3B05A","#4E8C79","#0F1714","#E0806F"] },
  ocean: { name: "Ocean", light: ["#EAF0F4","#F7FAFC","#13293D","#5B6F80","#C9D6E0","#2E7D9A","#1F5F7A","#F2F7FA","#B0473A"], dark: ["#0D1720","#15222D","#E1EAF0","#8FA3B3","#243646","#6CB6D0","#3F86A6","#0B141B","#E0806F"] },
  rose:  { name: "Rose",  light: ["#F5EEEF","#FCF8F8","#3A1F27","#7A5E65","#E2D2D5","#A3485E","#7A3346","#FBF4F5","#B04A3A"], dark: ["#1A1214","#241A1D","#F0E4E7","#B39AA0","#3A2A2F","#E08DA0","#B45C72","#150E10","#E0806F"] },
  sand:  { name: "Sand",  light: ["#F3EFE6","#FBF9F4","#2E2A22","#736A5A","#DED6C6","#8A6A1F","#5E6B3A","#F7F6EF","#A8473A"], dark: ["#17150F","#211E17","#ECE6D8","#A89E8A","#37322A","#D6B45E","#8A9A58","#13120C","#E0806F"] },
  plum:  { name: "Plum",  light: ["#F0EEF5","#FAF9FC","#2A2140","#6C6480","#D8D3E3","#6A4FA3","#4E3A80","#F6F4FA","#B0473A"], dark: ["#14111C","#1D1928","#E7E3F0","#A39CB6","#302A40","#A993DB","#7A63B8","#110E18","#E0806F"] },
  mono:  { name: "Mono",  light: ["#F2F2F2","#FFFFFF","#1A1A1A","#666666","#D6D6D6","#1A1A1A","#333333","#FFFFFF","#B3261E"], dark: ["#111111","#1B1B1B","#EEEEEE","#9A9A9A","#2E2E2E","#EEEEEE","#CFCFCF","#111111","#F2807A"] }
};
const VARS = ["--bg","--surface","--ink","--muted","--line","--accent","--done","--done-ink","--warn"];

// ---------- Qur'an helpers (Madani 604-page mushaf) ----------
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
function pageEnd(p) { if (p >= 604) return [114, 6]; const [s, a] = Q.p[p]; return a > 1 ? [s, a - 1] : [s - 1, Q.n[s - 2]]; }
function ayatOnPage(p) {
  const st = Q.p[p - 1], en = pageEnd(p), out = [];
  for (let s = st[0]; s <= en[0]; s++) out.push({ s, from: s === st[0] ? st[1] : 1, to: s === en[0] ? en[1] : Q.n[s - 1] });
  return out;
}
function pageOf(s, a) { let p = 1; for (let i = 0; i < 604; i++) { if (cmp(Q.p[i], [s, a]) <= 0) p = i + 1; else break; } return p; }
const nm = s => Q.names[s - 1];
const juzOf = p => p < 22 ? 1 : Math.min(30, Math.floor((p - 22) / 20) + 2);
function rangeText(p) {
  const g = ayatOnPage(p), f = g[0], l = g[g.length - 1];
  return g.length === 1 ? nm(f.s) + " " + f.from + " to " + f.to : nm(f.s) + " " + f.from + " to " + nm(l.s) + " " + l.to;
}
const surahPages = s => { const out = []; for (let p = pageOf(s, 1); p <= pageOf(s, Q.n[s - 1]); p++) out.push(p); return out; };
const juzPages = j => { const a = j === 1 ? 1 : 22 + 20 * (j - 2), b = j === 30 ? 604 : 21 + 20 * (j - 1), out = []; for (let p = a; p <= b; p++) out.push(p); return out; };
function compress(list) {
  if (!list.length) return "";
  const out = []; let a = list[0], b = list[0];
  for (let i = 1; i <= list.length; i++) { const x = list[i]; if (x === b + 1) { b = x; continue; } out.push(a === b ? String(a) : a + "-" + b); a = b = x; }
  return out.join(", ");
}
function parseRanges(t) {
  const set = new Set(), parts = String(t || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const x of parts) {
    const m = x.match(/^(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})$/i) || x.match(/^(\d{1,3})$/);
    if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > 604 || a > b) return null;
    for (let i = a; i <= b; i++) set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}
function selPages(sel) {
  const set = new Set();
  sel.items.forEach(x => (sel.by === "juz" ? juzPages(x) : surahPages(x)).forEach(p => set.add(p)));
  return [...set].sort((a, b) => a - b);
}

// ---------- dates ----------
const dayKey = (d = new Date()) => { const x = new Date(d.getTime() - 3 * 3600000); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); };
const daysAgo = n => { const d = new Date(Date.now() - 3 * 3600000); d.setDate(d.getDate() - n); return dayKey(new Date(d.getTime() + 3 * 3600000)); };
const shortDate = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// ---------- merge (two devices) ----------
export function mergeStates(a, b) {
  if (!a) return b; if (!b) return a;
  const newer = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  const deleted = Object.assign({}, a.deleted || {}, b.deleted || {});
  const byId = {};
  [...(a.wirds || []), ...(b.wirds || [])].forEach(w => {
    const cur = byId[w.id];
    if (!cur) { byId[w.id] = w; return; }
    const pick = (w.updatedAt || 0) > (cur.updatedAt || 0) ? w : cur, other = pick === w ? cur : w;
    const log = Object.assign({}, other.log || {}, pick.log || {});
    Object.keys(other.log || {}).forEach(k => { log[k] = Math.max(log[k] || 0, other.log[k]); });
    byId[w.id] = Object.assign({}, pick, { log });
  });
  const order = (newer.wirds || []).map(w => w.id);
  Object.keys(byId).forEach(id => { if (!order.includes(id)) order.push(id); });
  const wirds = order.map(id => byId[id]).filter(w => w && !(deleted[w.id] && deleted[w.id] >= (w.updatedAt || 0)));
  return { v: 5, wirds, deleted, theme: newer.theme || a.theme || b.theme, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
}

// Order-insensitive fingerprint, used to tell whether a merge changed anything.
export function stableKey(s) {
  const norm = v => Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {}) : v;
  return JSON.stringify(norm({ wirds: (s && s.wirds) || [], deleted: (s && s.deleted) || {}, theme: (s && s.theme) || null }));
}

// ---------- app ----------
export function createWirdApp(root, opts = {}) {
  const $ = id => root.querySelector("#" + id);
  const TYPES = { khatmah: { label: "Khatmah", round: "Khatmah", name: "Khatmah" }, hifz: { label: "Hifz cycle", round: "Cycle", name: "Hifz cycle" }, custom: { label: "Custom", round: "Round", name: "Wird" } };
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!state || !Array.isArray(state.wirds)) state = { v: 5, wirds: [], deleted: {}, updatedAt: 0 };
  state.deleted = state.deleted || {};
  state.wirds.forEach(migrate);
  function migrate(w) {
    w.log = w.log || {};
    if (w.today && w.today.n && !w.log[w.today.date]) w.log[w.today.date] = w.today.n;
    delete w.today;
    if (!w.type) w.type = w.round === "Cycle" ? "hifz" : w.ranges === "1-604" ? "khatmah" : "custom";
    if (!w.dir) w.dir = 1;
  }
  const save = (touch = true) => {
    if (touch) state.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (touch && opts.onChange) opts.onChange(state);
  };
  const find = id => state.wirds.find(w => w.id === id);
  const pagesOf = w => { const l = parseRanges(w.ranges) || [1]; return w.dir === -1 ? l.slice().reverse() : l; };
  const todayN = w => (w.log && w.log[dayKey()]) || 0;
  const vibrate = () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} };

  function touchW(w) { w.updatedAt = Date.now(); }
  function setPage(w, p, ayah) { w.page = p; w.ayah = ayah || null; touchW(w); save(); }
  function step(w, d) {
    const list = pagesOf(w); let i = list.indexOf(w.page); if (i < 0) i = 0;
    let moved = 0;
    const dirn = d > 0 ? 1 : -1;
    for (let k = 0; k < Math.abs(d); k++) {
      let j = i + dirn;
      if (j >= list.length) { j = 0; w.cycle++; }
      if (j < 0) { if (w.cycle > 1) { j = list.length - 1; w.cycle--; } else break; }
      i = j; moved += dirn;
    }
    const k = dayKey();
    w.log[k] = Math.max(0, (w.log[k] || 0) + moved);
    const keys = Object.keys(w.log); if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(x => delete w.log[x]);
    w.page = list[i]; w.ayah = null; touchW(w); save();
    return moved;
  }
  function streak(logs) {
    const has = k => logs.some(l => (l[k] || 0) > 0);
    let n = 0, start = has(daysAgo(0)) ? 0 : 1;
    while (has(daysAgo(start + n))) n++;
    return n;
  }
  function ago(t) {
    if (!t) return "Not started";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "Updated just now";
    if (m < 60) return "Updated " + m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return "Updated " + h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.round(h / 24);
    return "Updated " + d + (d === 1 ? " day ago" : " days ago");
  }
  const posText = w => w.ayah ? "Stopped at " + nm(w.ayah[0]) + " " + w.ayah[1] : rangeText(w.page);

  // ---------- theme ----------
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let styleEl = document.getElementById("wird-pal");
  if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "wird-pal"; document.head.appendChild(styleEl); }
  function applyTheme() {
    const t = state.theme || { pal: "sage", mode: "auto" }, p = PAL[t.pal] || PAL.sage;
    const dark = t.mode === "dark" || (t.mode === "auto" && mq && mq.matches);
    const c = dark ? p.dark : p.light;
    styleEl.textContent = ":root{" + VARS.map((v, i) => v + ":" + c[i]).join(";") + ";color-scheme:" + (dark ? "dark" : "light") + "}";
    let tc = document.querySelector('meta[name="theme-color"]');
    if (!tc) { tc = document.createElement("meta"); tc.setAttribute("name", "theme-color"); document.head.appendChild(tc); }
    tc.setAttribute("content", c[0]);
  }
  if (mq) (mq.addEventListener ? mq.addEventListener("change", applyTheme) : mq.addListener(applyTheme));

  // ---------- pieces ----------
  const STAR = (size, cls) => '<svg class="' + cls + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true"><rect x="19" y="19" width="62" height="62" rx="3"/><rect x="19" y="19" width="62" height="62" rx="3" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="27"/></svg>';
  const ICON = {
    back: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function bars(w) {
    let h = '<div class="bars" role="img" aria-label="Pages over the last 7 days">', max = Math.max(1, w.target || 0, ...[0, 1, 2, 3, 4, 5, 6].map(i => w.log[daysAgo(i)] || 0));
    for (let i = 6; i >= 0; i--) {
      const n = w.log[daysAgo(i)] || 0, d = new Date(Date.now() - i * 86400000);
      h += '<div class="bcol"><div class="btrack"><i style="height:' + Math.round(n / max * 100) + '%"></i>' + (w.target ? '<b style="bottom:' + Math.round(w.target / max * 100) + '%"></b>' : "") + '</div><span>' + (i === 0 ? "Today" : d.toLocaleDateString("en-GB", { weekday: "narrow" })) + "</span><em>" + (n || "") + "</em></div>";
    }
    return h + "</div>";
  }
  function toast(text, undo) {
    let t = root.querySelector(".toast"); if (t) t.remove();
    t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = "<span>" + esc(text) + "</span>" + (undo ? '<button type="button">Undo</button>' : "");
    root.appendChild(t);
    if (undo) t.querySelector("button").onclick = () => { undo(); t.remove(); };
    setTimeout(() => t.remove(), 5000);
  }

  // ---------- home ----------
  function home() {
    const today = new Date(), total = state.wirds.reduce((s, w) => s + todayN(w), 0), st = streak(state.wirds.map(w => w.log));
    let h = '<header class="top"><div class="brand"><span class="wm">Wird</span><span class="ar" lang="ar">وِرد</span></div><div class="acct-slot"></div></header>' +
      '<p class="date">' + today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + "</p>";
    if (state.wirds.length) h += '<div class="summary"><div><strong>' + total + '</strong><span>' + (total === 1 ? "page" : "pages") + ' today</span></div><div><strong>' + st + '</strong><span>day streak</span></div><div><strong>' + state.wirds.length + '</strong><span>' + (state.wirds.length === 1 ? "wird" : "wirds") + "</span></div></div>";
    if (!state.wirds.length) {
      h += '<div class="welcome">' + STAR(64, "orn") + '<h2>Keep your place in every wird</h2><p>The page you\'re on in the Madani mushaf and the ayah you stopped at, one tap away. What would you like to track first?</p>' +
        '<div class="choices"><button class="choice" data-new="khatmah"><strong>Khatmah</strong><span>Read the whole Qur\'an, cover to cover</span></button><button class="choice" data-new="hifz"><strong>Hifz cycle</strong><span>Revise what you\'ve memorised</span></button><button class="choice" data-new="custom"><strong>Custom</strong><span>Any set of pages</span></button></div></div>';
    }
    state.wirds.forEach(w => {
      const list = pagesOf(w), i = Math.max(0, list.indexOf(w.page)), pct = Math.round(i / list.length * 100), tn = todayN(w);
      const goal = w.target ? Math.min(1, tn / w.target) : 0;
      h += '<button class="wcard" data-open="' + w.id + '"><div class="pg">' + STAR(84, "orn") + '<span>' + w.page + '</span></div><div class="wbody"><div class="wtop"><span class="wname">' + esc(w.name) + '</span><span class="pill">' + esc(w.round) + " " + w.cycle + '</span></div>' +
        '<div class="wpos">' + esc(posText(w)) + '</div><div class="wmeta">Juz ' + juzOf(w.page) + ", " + pct + "% through" + (w.target ? ", " + tn + "/" + w.target + " today" : tn ? ", " + tn + " today" : "") + '</div>' +
        '<div class="track"><i style="width:' + pct + '%"></i></div>' + (w.target ? '<div class="track goal"><i style="width:' + Math.round(goal * 100) + '%"></i></div>' : "") + "</div></button>";
    });
    if (state.wirds.length) h += '<button class="addcard" data-new="">+ Add a wird</button>';
    const t = state.theme || { pal: "sage", mode: "auto" };
    h += '<details class="fold"><summary>Appearance</summary><div class="swatches">' +
      Object.keys(PAL).map(k => { const c = PAL[k].light, d = PAL[k].dark; return '<button class="sw' + (t.pal === k ? " on" : "") + '" data-pal="' + k + '" aria-pressed="' + (t.pal === k) + '"><span><i style="background:' + c[0] + '"></i><i style="background:' + c[6] + '"></i><i style="background:' + c[5] + '"></i><i style="background:' + d[0] + '"></i></span>' + PAL[k].name + "</button>"; }).join("") +
      '</div><div class="seg" style="margin-top:12px">' + [["auto", "Match phone"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => '<button class="chip' + (t.mode === k ? " on" : "") + '" data-mode="' + k + '">' + l + "</button>").join("") + "</div></details>";
    h += '<details class="fold"><summary>Backup code</summary><p class="muted small">Copy this to keep a backup, or paste one to restore. Signing in with Google keeps everything synced automatically instead.</p>' +
      '<div class="row"><button class="btn" id="exp">Show code</button><button class="btn" id="copy" hidden>Copy</button></div>' +
      '<textarea id="bk" spellcheck="false" aria-label="Backup code"></textarea>' +
      '<div class="row"><button class="btn" id="imp">Restore from code</button></div><p class="msg" id="bmsg"></p></details>' +
      '<p class="foot">Madani mushaf, 604 pages. Page and ayah data checked against alquran.cloud and quran.com.</p>';
    root.innerHTML = '<div class="wrap">' + h + "</div>";
    if (opts.onHome) opts.onHome(root.querySelector(".acct-slot"));
    root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => go("w/" + b.dataset.open));
    root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => go("new" + (b.dataset.new ? "/" + b.dataset.new : "")));
    const reopen = () => { home(); root.querySelector("details.fold").open = true; };
    root.querySelectorAll("[data-pal]").forEach(b => b.onclick = () => { state.theme = Object.assign({ mode: "auto" }, state.theme, { pal: b.dataset.pal }); save(); applyTheme(); reopen(); });
    root.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.theme = Object.assign({ pal: "sage" }, state.theme, { mode: b.dataset.mode }); save(); applyTheme(); reopen(); });
    $("exp").onclick = () => { $("bk").value = btoa(unescape(encodeURIComponent(JSON.stringify(state)))); $("copy").hidden = false; };
    $("copy").onclick = async () => { try { await navigator.clipboard.writeText($("bk").value); msg("bmsg", "Copied.", 1); } catch (e) { $("bk").select(); msg("bmsg", "Selected. Use your phone's Copy.", 1); } };
    let armed = false;
    $("imp").onclick = () => {
      let d = null; try { d = JSON.parse(decodeURIComponent(escape(atob($("bk").value.trim())))); } catch (e) {}
      if (!d || !Array.isArray(d.wirds)) { msg("bmsg", "That isn't a wird backup code.", 0); return; }
      if (!armed) { armed = true; $("imp").textContent = "Tap again to replace everything"; return; }
      d.wirds.forEach(migrate); d.deleted = d.deleted || {};
      state.wirds.forEach(w => { if (!d.wirds.find(x => x.id === w.id)) d.deleted[w.id] = Date.now(); });
      state = d; save(); applyTheme(); home(); msg("bmsg", "Restored.", 1);
    };
  }
  function msg(id, t, ok) { const e = $(id); if (e) { e.textContent = t; e.className = "msg " + (ok ? "ok" : "err"); } }

  // ---------- add / edit ----------
  let draft = null;
  function newDraft(type) { type = TYPES[type] ? type : "khatmah"; return { id: null, type, name: TYPES[type].name, sel: { by: "surah", items: [] }, ranges: type === "khatmah" ? "1-604" : "", dir: 1, target: 0, start: "" }; }
  function draftFrom(w) { return { id: w.id, type: w.type, name: w.name, sel: w.sel ? JSON.parse(JSON.stringify(w.sel)) : { by: "surah", items: [] }, ranges: w.ranges, dir: w.dir || 1, target: w.target || 0, start: "" }; }
  function draftPages() {
    if (draft.type === "khatmah") return parseRanges("1-604");
    if (draft.type === "hifz" && draft.sel.items.length) return selPages(draft.sel);
    if (draft.type === "hifz") return draft.id ? parseRanges(draft.ranges) : null;
    return parseRanges(draft.ranges);
  }
  function opts2(by, sel) { const n = by === "juz" ? 30 : 114; let h = ""; for (let k = 1; k <= n; k++) h += '<option value="' + k + '"' + (k === (sel || 1) ? " selected" : "") + ">" + (by === "juz" ? "Juz " + k : k + ". " + esc(nm(k))) + "</option>"; return h; }
  function form() {
    const d = draft, editing = !!d.id, pages = draftPages();
    let h = '<header class="bar"><button class="iconbtn" id="back" aria-label="Back">' + ICON.back + '</button><h1>' + (editing ? "Edit wird" : "New wird") + "</h1><span></span></header>";
    h += '<p class="lbl">Type</p><div class="seg">' + Object.keys(TYPES).map(k => '<button class="chip' + (d.type === k ? " on" : "") + '" data-type="' + k + '">' + TYPES[k].label + "</button>").join("") + "</div>";
    h += '<label class="lbl" for="fn">Name</label><input type="text" id="fn" value="' + esc(d.name) + '">';
    if (d.type === "khatmah") h += '<p class="hint">All 604 pages, Al-Fatihah to An-Nas. The khatmah count goes up each time you finish.</p>';
    if (d.type === "hifz") {
      const by = d.sel.by, n = by === "juz" ? 30 : 114;
      h += '<p class="lbl">What have you memorised?</p><div class="seg"><button class="chip' + (by === "surah" ? " on" : "") + '" data-by="surah">By surah</button><button class="chip' + (by === "juz" ? " on" : "") + '" data-by="juz">By juz</button></div>' +
        '<div class="panel"><p class="hint" style="margin-top:0">Add a run in one go</p><div class="row"><select id="rf" aria-label="From">' + opts2(by) + '</select><select id="rt" aria-label="To">' + opts2(by, n) + '</select><button class="btn" id="radd">Add</button></div>' +
        '<p class="hint">Or tap to pick</p><div class="list"><div class="chips">';
      for (let k = 1; k <= n; k++) { const on = d.sel.items.includes(k); h += '<button class="chip' + (on ? " on" : "") + '" data-item="' + k + '" aria-pressed="' + on + '">' + (by === "juz" ? "Juz " + k : k + ". " + esc(nm(k))) + "</button>"; }
      h += '</div></div><div class="row"><button class="btn" id="clr">Clear all</button></div></div>';
      if (editing && !d.sel.items.length) h += '<p class="hint">Currently pages ' + esc(d.ranges) + ". Pick surahs or juz to replace it.</p>";
    }
    if (d.type === "custom") h += '<label class="lbl" for="fr">Pages</label><input type="text" id="fr" value="' + esc(d.ranges) + '" placeholder="e.g. 1-50, 582-604"><p class="hint">Madani page ranges separated by commas.</p>';
    h += '<p class="count"><strong id="pcount">' + (pages ? pages.length + " pages" : "Nothing picked yet") + "</strong>" + (pages && pages.length ? "<span>pages " + esc(compress(pages)) + "</span>" : "") + "</p>";
    h += '<p class="lbl">Direction</p><div class="seg"><button class="chip' + (d.dir === 1 ? " on" : "") + '" data-dir="1">From Al-Fatihah</button><button class="chip' + (d.dir === -1 ? " on" : "") + '" data-dir="-1">From An-Nas</button></div>';
    if (!editing) h += '<label class="lbl" for="fs">Where are you now?</label><input type="number" id="fs" inputmode="numeric" min="1" max="604" value="' + esc(d.start) + '" placeholder="Page number, or leave empty to start at the beginning">';
    h += '<label class="lbl" for="ft">Daily target</label><div class="row"><input type="number" id="ft" inputmode="numeric" min="0" value="' + (d.target || "") + '" placeholder="Pages per day (optional)"></div><div class="chips" style="margin-top:8px">' + [[10, "Half juz"], [20, "1 juz"], [40, "2 juz"]].map(([v, l]) => '<button class="chip" data-tg="' + v + '">' + l + "</button>").join("") + "</div>";
    h += '<button class="btn primary wide" id="fsave" style="margin-top:24px">' + (editing ? "Save changes" : "Create wird") + '</button><p class="msg" id="fmsg"></p>';
    if (editing) h += '<button class="btn danger wide" id="fdel">Delete this wird</button>';
    root.innerHTML = '<div class="wrap">' + h + "</div>";

    const keep = () => { d.name = $("fn").value; if ($("fr")) d.ranges = $("fr").value; if ($("fs")) d.start = $("fs").value; d.target = parseInt($("ft").value, 10) || 0; };
    const rerender = () => { const y = window.scrollY, l = root.querySelector(".list"), ls = l ? l.scrollTop : 0; form(); window.scrollTo(0, y); const l2 = root.querySelector(".list"); if (l2) l2.scrollTop = ls; };
    $("back").onclick = () => go(editing ? "w/" + d.id : "");
    root.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { keep(); const old = TYPES[d.type].name; d.type = b.dataset.type; if (!d.name || d.name === old) d.name = TYPES[d.type].name; if (d.type === "custom" && d.ranges === "1-604" && !editing) d.ranges = ""; rerender(); });
    root.querySelectorAll("[data-by]").forEach(b => b.onclick = () => { keep(); if (d.sel.by !== b.dataset.by) d.sel = { by: b.dataset.by, items: [] }; rerender(); });
    root.querySelectorAll("[data-item]").forEach(b => b.onclick = () => { keep(); const k = +b.dataset.item, it = d.sel.items, i = it.indexOf(k); if (i >= 0) it.splice(i, 1); else it.push(k); it.sort((a, b) => a - b); rerender(); });
    root.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { keep(); d.dir = +b.dataset.dir; rerender(); });
    root.querySelectorAll("[data-tg]").forEach(b => b.onclick = () => { keep(); d.target = +b.dataset.tg; rerender(); });
    if ($("radd")) $("radd").onclick = () => { keep(); let a = +$("rf").value, b = +$("rt").value; if (a > b) [a, b] = [b, a]; for (let k = a; k <= b; k++) if (!d.sel.items.includes(k)) d.sel.items.push(k); d.sel.items.sort((x, y) => x - y); rerender(); };
    if ($("clr")) $("clr").onclick = () => { keep(); d.sel.items = []; rerender(); };
    if ($("fr")) $("fr").oninput = () => { d.ranges = $("fr").value; const p = parseRanges(d.ranges); $("pcount").textContent = p ? p.length + " pages" : "Check the page ranges"; };
    $("fsave").onclick = () => {
      keep();
      const p = draftPages();
      if (!p || !p.length) { msg("fmsg", d.type === "hifz" ? "Pick at least one surah or juz." : "Enter page ranges between 1 and 604, like 1-50, 582-604.", 0); return; }
      const ranges = compress(p), name = d.name.trim() || TYPES[d.type].name;
      if (editing) {
        const w = find(d.id);
        Object.assign(w, { name, type: d.type, round: TYPES[d.type].round, ranges, sel: d.type === "hifz" && d.sel.items.length ? d.sel : w.sel || null, dir: d.dir, target: d.target });
        if (!p.includes(w.page)) { const l = pagesOf(w); w.page = l.find(x => d.dir === 1 ? x > w.page : x < w.page) || l[0]; w.ayah = null; }
        touchW(w); save(); go("w/" + w.id);
      } else {
        const list = d.dir === -1 ? p.slice().reverse() : p;
        let start = list[0];
        const s = parseInt(d.start, 10);
        if (s) { if (s < 1 || s > 604) { msg("fmsg", "Pages run from 1 to 604.", 0); return; } start = p.includes(s) ? s : (list.find(x => d.dir === 1 ? x > s : x < s) || list[0]); }
        const w = { id: Math.random().toString(36).slice(2, 10), name, type: d.type, round: TYPES[d.type].round, ranges, sel: d.type === "hifz" ? d.sel : null, dir: d.dir, target: d.target, page: start, ayah: null, cycle: 1, log: {}, createdAt: Date.now(), updatedAt: Date.now() };
        state.wirds.push(w); save(); go("w/" + w.id);
      }
    };
    let armed = false;
    if ($("fdel")) $("fdel").onclick = () => {
      if (!armed) { armed = true; $("fdel").textContent = "Tap again to delete"; return; }
      state.wirds = state.wirds.filter(x => x.id !== d.id); state.deleted[d.id] = Date.now(); save(); go("");
    };
  }

  // ---------- wird screen ----------
  function detail(w) {
    const list = pagesOf(w), i = Math.max(0, list.indexOf(w.page)), fwd = w.dir !== -1, tn = todayN(w), left = list.length - i;
    const st = streak([w.log]);
    let eta = "";
    if (w.target) { const days = Math.ceil(left / w.target), d = new Date(); d.setDate(d.getDate() + days); eta = "At " + w.target + " pages a day, this " + w.round.toLowerCase() + " finishes around " + shortDate(d) + "."; }
    let h = '<header class="bar"><button class="iconbtn" id="back" aria-label="All wirds">' + ICON.back + '</button><h1>' + esc(w.name) + '</h1><button class="iconbtn" id="edit" aria-label="Edit this wird">' + ICON.edit + "</button></header>" +
      '<div class="dial"><button class="step" id="prev" aria-label="Back one page">' + (fwd ? "−" : "+") + '</button>' +
      '<div class="medal">' + STAR(200, "orn big") + '<input id="pg" type="number" inputmode="numeric" min="1" max="604" value="' + w.page + '" aria-label="Page number"><small>page</small></div>' +
      '<button class="step" id="next" aria-label="Forward one page">' + (fwd ? "+" : "−") + "</button></div>" +
      '<p class="where">' + esc(posText(w)) + "</p>" +
      '<p class="sub">Juz ' + juzOf(w.page) + ", " + (i + 1) + " of " + list.length + " pages, " + esc(w.round.toLowerCase()) + " " + w.cycle + (w.ayah ? "<br>Page " + w.page + ": " + esc(rangeText(w.page)) : "") + '</p><p class="msg center" id="pmsg"></p>' +
      '<div class="quick">' + [2, 5, 10, 20].map(n => '<button class="chip" data-q="' + n + '">+' + n + "</button>").join("") + '<a class="chip ext" href="https://quran.com/page/' + w.page + '" target="_blank" rel="noopener">Open page ' + ICON.ext + "</a></div>" +
      '<section class="stats"><div class="srow"><div><strong>' + tn + (w.target ? "<small>/" + w.target + "</small>" : "") + '</strong><span>pages today</span></div><div><strong>' + st + '</strong><span>day streak</span></div><div><strong>' + left + '</strong><span>pages to go</span></div></div>' + bars(w) + (eta ? '<p class="hint">' + eta + "</p>" : "") + "</section>" +
      '<section><h2>Where did you stop?</h2>';
    ayatOnPage(w.page).forEach(g => {
      h += '<div class="group"><p>' + esc(nm(g.s)) + '</p><div class="chips">';
      for (let a = g.from; a <= g.to; a++) { const on = w.ayah && w.ayah[0] === g.s && w.ayah[1] === a; h += '<button class="chip ay' + (on ? " on" : "") + '" data-s="' + g.s + '" data-a="' + a + '" aria-pressed="' + on + '">' + a + "</button>"; }
      h += "</div></div>";
    });
    h += '<p class="hint">Tap again to clear.</p></section>' +
      '<section><h2>Jump to</h2><div class="row"><select id="js" aria-label="Surah">' + opts2("surah", w.ayah ? w.ayah[0] : ayatOnPage(w.page)[0].s) +
      '</select><input id="ja" type="number" inputmode="numeric" min="1" placeholder="Ayah" aria-label="Ayah" class="ayin"><button class="btn primary" id="jgo">Go</button></div><p class="msg" id="jmsg"></p></section>';
    root.innerHTML = '<div class="wrap">' + h + "</div>";
    const snap = () => JSON.stringify(w);
    const doStep = n => {
      const before = snap(), moved = step(w, n); vibrate(); detail(w);
      if (Math.abs(n) > 1 && moved) toast("Moved " + Math.abs(moved) + " pages to p. " + w.page, () => { Object.assign(w, JSON.parse(before)); touchW(w); save(); detail(w); });
    };
    $("back").onclick = () => go("");
    $("edit").onclick = () => go("w/" + w.id + "/edit");
    $("prev").onclick = () => doStep(-1);
    $("next").onclick = () => doStep(1);
    root.querySelectorAll("[data-q]").forEach(b => b.onclick = () => doStep(+b.dataset.q));
    $("pg").onchange = () => {
      const p = parseInt($("pg").value, 10);
      if (!(p >= 1 && p <= 604)) { msg("pmsg", "Pages run from 1 to 604.", 0); $("pg").value = w.page; return; }
      if (!list.includes(p)) { const nx = list.find(x => fwd ? x > p : x < p) || list[0]; setPage(w, nx); detail(w); msg("pmsg", "Page " + p + " isn't in this wird, so it moved to page " + nx + ".", 0); return; }
      setPage(w, p); detail(w);
    };
    root.querySelectorAll("[data-s]").forEach(c => c.onclick = () => {
      const s = +c.dataset.s, a = +c.dataset.a, on = w.ayah && w.ayah[0] === s && w.ayah[1] === a;
      setPage(w, w.page, on ? null : [s, a]); vibrate(); detail(w);
    });
    $("jgo").onclick = () => {
      const s = +$("js").value, a = parseInt($("ja").value, 10);
      if (!(a >= 1 && a <= Q.n[s - 1])) { msg("jmsg", nm(s) + " has " + Q.n[s - 1] + " ayat.", 0); return; }
      const p = pageOf(s, a);
      if (!list.includes(p)) { msg("jmsg", nm(s) + " " + a + " is on page " + p + ", which isn't in this wird.", 0); return; }
      setPage(w, p, [s, a]); detail(w);
    };
  }

  // ---------- routing ----------
  let current = "";
  function go(r) { if (location.hash.slice(1) !== r) location.hash = r; else route(); }
  function route() {
    const hsh = location.hash;
    let m, w;
    if ((m = hsh.match(/^#new(?:\/(\w+))?/))) { if (!draft || draft.id || draft.fresh !== hsh) { draft = newDraft(m[1]); draft.fresh = hsh; } current = "form"; form(); }
    else if ((m = hsh.match(/^#w\/([a-z0-9]+)\/edit/)) && (w = find(m[1]))) { if (!draft || draft.id !== m[1]) draft = draftFrom(w); current = "form"; form(); }
    else if ((m = hsh.match(/^#w\/([a-z0-9]+)/)) && (w = find(m[1]))) { draft = null; current = "detail:" + w.id; detail(w); }
    else { draft = null; current = "home"; home(); }
    window.scrollTo(0, 0);
  }
  const onKey = e => {
    if (!current.startsWith("detail:") || /input|select|textarea/i.test(e.target.tagName)) return;
    const w = find(current.slice(7)); if (!w) return;
    if (e.key === "ArrowRight") { step(w, 1); detail(w); } else if (e.key === "ArrowLeft") { step(w, -1); detail(w); }
  };
  const onVis = () => { if (!document.hidden && current !== "form") rerenderInPlace(); };
  function rerenderInPlace() {
    const y = window.scrollY;
    if (current === "home") home(); else if (current.startsWith("detail:")) { const w = find(current.slice(7)); if (w) detail(w); else go(""); }
    window.scrollTo(0, y);
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVis);
  applyTheme();
  route();

  return {
    getState: () => state,
    applyRemote(remote) {
      if (!remote || !Array.isArray(remote.wirds)) return state;
      remote.wirds.forEach(migrate);
      state = mergeStates(state, remote);
      save(false);
      applyTheme();
      if (current !== "form") rerenderInPlace();
      return state;
    },
    refreshHome() { if (current === "home") { const y = window.scrollY; home(); window.scrollTo(0, y); } },
    destroy() { window.removeEventListener("hashchange", route); window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); }
  };
}
