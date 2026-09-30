// @ts-nocheck
import {
  MAX_WIRDS, PAGES, ayatCount, ayatOnPage, cleanState, cleanWird, compress, dateAgo, dayKey, daysAgo, juzOf, juzPages,
  mergeStates, paceDays, pageOf, parseRanges, rangeText, selPages, sittingsDone, stableKey, surahName as nm, targetForDays,
} from "./core";
import { DEFAULT_THEME, PAL, themeCss } from "./themes";

export { mergeStates, stableKey, PAL };

const KEY = "wird-bookmarks-v3";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortDate = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const RING_C = 2 * Math.PI * 46;
const WEEKDAY_MON0 = d => (d.getDay() + 6) % 7;

// ---------- app ----------
export function createWirdApp(root, opts = {}) {
  const $ = id => root.querySelector("#" + id);
  const TYPES = { khatmah: { label: "Khatmah", round: "Khatmah", name: "Khatmah" }, hifz: { label: "Hifz cycle", round: "Cycle", name: "Hifz cycle" }, custom: { label: "Custom", round: "Round", name: "Wird" } };
  let state;
  try { state = cleanState(JSON.parse(localStorage.getItem(KEY))); } catch (e) { state = cleanState(null); }

  const save = (touch = true) => {
    if (touch) state.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (touch && opts.onChange) opts.onChange(state);
  };
  const find = id => state.wirds.find(w => w.id === id);
  const pagesOf = w => { const l = parseRanges(w.ranges) || [1]; return w.dir === -1 ? l.slice().reverse() : l; };
  const todayN = w => (w.log && w.log[dayKey()]) || 0;
  const vibrate = () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} };
  const posOf = w => { const l = pagesOf(w), i = l.indexOf(w.page); return { list: l, i: i < 0 ? 0 : i }; };

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
    if (!w.log[k]) delete w.log[k];
    w.page = list[i]; w.ayah = null; touchW(w); save();
    return moved;
  }
  function streak(logs) {
    const has = k => logs.some(l => (l[k] || 0) > 0);
    let n = 0, start = has(daysAgo(0)) ? 0 : 1;
    while (has(daysAgo(start + n))) n++;
    return n;
  }
  const posText = w => w.ayah ? "Stopped at " + nm(w.ayah[0]) + " " + w.ayah[1] : rangeText(w.page);

  // ---------- theme ----------
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let styleEl = document.getElementById("wird-pal");
  if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "wird-pal"; document.head.appendChild(styleEl); }
  function applyTheme() {
    const t = themeCss(state.theme, !!(mq && mq.matches));
    styleEl.textContent = t.css;
    let tc = document.querySelector('meta[name="theme-color"]');
    if (!tc) { tc = document.createElement("meta"); tc.setAttribute("name", "theme-color"); document.head.appendChild(tc); }
    tc.setAttribute("content", t.bg);
  }
  if (mq) (mq.addEventListener ? mq.addEventListener("change", applyTheme) : mq.addListener(applyTheme));

  // ---------- pieces ----------
  // Eight-point star with a progress ring around it.
  const SEAL = (size, cls, frac, met) =>
    '<svg class="' + cls + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">' +
    '<circle class="rbg" cx="50" cy="50" r="46"/><circle class="rfg' + (met ? " met" : "") + '" cx="50" cy="50" r="46" stroke-dasharray="' + (Math.max(0, Math.min(1, frac)) * RING_C).toFixed(1) + " " + RING_C.toFixed(1) + '" transform="rotate(-90 50 50)"/>' +
    '<rect x="21" y="21" width="58" height="58" rx="3"/><rect x="21" y="21" width="58" height="58" rx="3" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="25"/></svg>';
  const STAR = (size, cls) =>
    '<svg class="' + cls + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true"><rect x="19" y="19" width="62" height="62" rx="3"/><rect x="19" y="19" width="62" height="62" rx="3" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="27"/></svg>';
  const ICON = {
    back: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flag: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 21V4M6 5h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function bars(w) {
    let h = '<div class="bars" role="img" aria-label="Pages over the last 7 days">', max = Math.max(1, w.target || 0, ...[0, 1, 2, 3, 4, 5, 6].map(i => w.log[daysAgo(i)] || 0));
    for (let i = 6; i >= 0; i--) {
      const n = w.log[daysAgo(i)] || 0;
      h += '<div class="bcol"><div class="btrack"><i style="height:' + Math.round(n / max * 100) + '%"></i>' + (w.target ? '<b style="bottom:' + Math.round(w.target / max * 100) + '%"></b>' : "") + '</div><span>' + (i === 0 ? "Today" : dateAgo(i).toLocaleDateString("en-GB", { weekday: "narrow" })) + "</span><em>" + (n || "") + "</em></div>";
    }
    return h + "</div>";
  }
  // Last four weeks plus this week so far, columns Monday to Sunday.
  function heat(w) {
    const wd = WEEKDAY_MON0(dateAgo(0)), span = 28 + wd, total = span + 1;
    let h = '<div class="heat" role="img" aria-label="Days you read over the last five weeks">' + ["M", "T", "W", "T", "F", "S", "S"].map(x => "<b>" + x + "</b>").join(""), read = 0;
    for (let i = span; i >= 0; i--) {
      const n = w.log[daysAgo(i)] || 0, lvl = n <= 0 ? 0 : w.target && n >= w.target ? 2 : 1;
      if (n > 0) read++;
      h += '<i class="l' + lvl + (i === 0 ? " now" : "") + '" title="' + esc(shortDate(dateAgo(i)) + ": " + n + (n === 1 ? " page" : " pages")) + '"></i>';
    }
    return { html: h + "</div>", read, total };
  }
  // 30 small cells, one per juz: done, here, still to come, or not part of this wird.
  function juzMap(w, list, i) {
    let h = '<div class="juzmap" role="group" aria-label="Juz map">';
    for (let j = 1; j <= 30; j++) {
      const idx = juzPages(j).map(p => list.indexOf(p)).filter(x => x >= 0);
      const state_ = !idx.length ? "out" : idx.includes(i) ? "here" : Math.max(...idx) < i ? "done" : "todo";
      const target = idx.length ? list[Math.min(...idx)] : 0;
      h += '<button class="jz ' + state_ + '" data-jz="' + target + '" ' + (idx.length ? "" : "disabled ") + 'aria-label="Juz ' + j + (state_ === "here" ? ", you are here" : state_ === "done" ? ", finished" : state_ === "todo" ? ", still to come" : ", not in this wird") + '"><span>' + j + "</span></button>";
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
  // Re-render without dropping keyboard focus.
  function focusSel() {
    const a = document.activeElement;
    if (!a || !root.contains(a) || a === document.body) return null;
    if (a.id) return "#" + a.id;
    for (const k of ["q", "s", "item", "pal", "mode", "type", "by", "dir", "tg", "days", "parts", "open", "new", "jz", "unweak"]) {
      if (a.dataset && a.dataset[k] !== undefined) return "[data-" + k + '="' + a.dataset[k] + '"]' + (k === "s" ? '[data-a="' + a.dataset.a + '"]' : "");
    }
    return null;
  }
  function paint(html) {
    const sel = focusSel();
    root.innerHTML = '<div class="wrap">' + html + "</div>";
    if (sel) { const el = root.querySelector(sel); if (el && el.focus) try { el.focus({ preventScroll: true }); } catch (e) {} }
  }

  // ---------- home ----------
  function home() {
    const today = new Date(), total = state.wirds.reduce((s, w) => s + todayN(w), 0), st = streak(state.wirds.map(w => w.log));
    let h = '<header class="top"><div class="brand"><span class="wm">Wird</span><span class="ar" lang="ar">وِرد</span></div><div class="acct-slot"></div></header>' +
      '<p class="date">' + today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + "</p>";
    if (state.wirds.length) {
      let week = '<div class="week" aria-label="This week">';
      for (let i = 6; i >= 0; i--) { const on = state.wirds.some(w => (w.log[daysAgo(i)] || 0) > 0); week += '<span class="' + (on ? "on" : "") + (i === 0 ? " now" : "") + '"><i></i>' + (i === 0 ? "Today" : dateAgo(i).toLocaleDateString("en-GB", { weekday: "narrow" })) + "</span>"; }
      h += '<div class="summary"><div><strong>' + total + '</strong><span>' + (total === 1 ? "page" : "pages") + ' today</span></div><div><strong>' + st + '</strong><span>day streak</span></div><div><strong>' + state.wirds.length + '</strong><span>' + (state.wirds.length === 1 ? "wird" : "wirds") + "</span></div>" + week + "</div></div>";
    }
    if (!state.wirds.length) {
      h += '<div class="welcome">' + STAR(64, "orn") + '<h2>Keep your place in every wird</h2><p>The page you\'re on in the Madani mushaf and the ayah you stopped at, one tap away. What would you like to track first?</p>' +
        '<div class="choices"><button class="choice" data-new="khatmah"><strong>Khatmah</strong><span>Read the whole Qur\'an, cover to cover</span></button><button class="choice" data-new="hifz"><strong>Hifz cycle</strong><span>Revise what you\'ve memorised</span></button><button class="choice" data-new="custom"><strong>Custom</strong><span>Any set of pages</span></button></div></div>';
    }
    state.wirds.forEach(w => {
      const { list, i } = posOf(w), pct = Math.round(i / list.length * 100), tn = todayN(w);
      const goal = w.target ? Math.min(1, tn / w.target) : 0, met = w.target && tn >= w.target;
      const sit = w.target && w.parts > 1 ? sittingsDone(w.target, w.parts, tn) : -1;
      h += '<button class="wcard' + (met ? " met" : "") + '" data-open="' + esc(w.id) + '"><div class="pg">' + SEAL(88, "orn", w.target ? goal : i / list.length, met) + '<span>' + w.page + '</span></div><div class="wbody"><div class="wtop"><span class="wname">' + esc(w.name) + '</span><span class="pill">' + esc(w.round) + " " + w.cycle + '</span></div>' +
        '<div class="wpos">' + esc(posText(w)) + '</div><div class="wmeta">Juz ' + juzOf(w.page) + ", " + pct + "% through" + (w.target ? ", " + tn + "/" + w.target + " today" : tn ? ", " + tn + " today" : "") + (w.weak.length ? ", " + w.weak.length + " weak" : "") + '</div>' +
        '<div class="track"><i style="width:' + pct + '%"></i></div>' +
        (sit >= 0 ? '<div class="dots" aria-label="' + sit + " of " + w.parts + ' sittings done">' + Array.from({ length: w.parts }, (_, k) => '<i class="' + (k < sit ? "on" : "") + '"></i>').join("") + "</div>" : "") +
        "</div></button>";
    });
    if (state.wirds.length && state.wirds.length < MAX_WIRDS) h += '<button class="addcard" data-new="">+ Add a wird</button>';
    const t = Object.assign({}, DEFAULT_THEME, state.theme);
    h += '<details class="fold"><summary>Appearance</summary><div class="swatches">' +
      Object.keys(PAL).map(k => { const c = PAL[k].light, d = PAL[k].dark; return '<button class="sw' + (t.pal === k ? " on" : "") + '" data-pal="' + k + '" aria-pressed="' + (t.pal === k) + '"><span><i style="background:' + c[0] + '"></i><i style="background:' + c[6] + '"></i><i style="background:' + c[5] + '"></i><i style="background:' + d[0] + '"></i></span>' + PAL[k].name + "</button>"; }).join("") +
      '</div><div class="seg" style="margin-top:12px">' + [["auto", "Match phone"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => '<button class="chip' + (t.mode === k ? " on" : "") + '" data-mode="' + k + '" aria-pressed="' + (t.mode === k) + '">' + l + "</button>").join("") + "</div></details>";
    h += '<details class="fold"><summary>Backup code</summary><p class="muted small">Copy this to keep a backup, or paste one to restore. Signing in with Google keeps everything synced automatically instead.</p>' +
      '<div class="row"><button class="btn" id="exp">Show code</button><button class="btn" id="copy" hidden>Copy</button></div>' +
      '<textarea id="bk" spellcheck="false" aria-label="Backup code"></textarea>' +
      '<div class="row"><button class="btn" id="imp">Restore from code</button></div><p class="msg" id="bmsg" role="status"></p></details>' +
      '<p class="foot">Madani mushaf, 604 pages. Page and ayah data checked against alquran.cloud and quran.com.</p>';
    paint(h);
    if (opts.onHome) opts.onHome(root.querySelector(".acct-slot"));
    root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => go("w/" + b.dataset.open));
    root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => go("new" + (b.dataset.new ? "/" + b.dataset.new : "")));
    const reopen = () => { home(); const f = root.querySelector("details.fold"); if (f) f.open = true; };
    root.querySelectorAll("[data-pal]").forEach(b => b.onclick = () => { state.theme = Object.assign({}, DEFAULT_THEME, state.theme, { pal: b.dataset.pal }); save(); applyTheme(); reopen(); });
    root.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.theme = Object.assign({}, DEFAULT_THEME, state.theme, { mode: b.dataset.mode }); save(); applyTheme(); reopen(); });
    $("exp").onclick = () => { $("bk").value = btoa(unescape(encodeURIComponent(JSON.stringify(state)))); $("copy").hidden = false; };
    $("copy").onclick = async () => { try { await navigator.clipboard.writeText($("bk").value); msg("bmsg", "Copied.", 1); } catch (e) { $("bk").select(); msg("bmsg", "Selected. Use your phone's Copy.", 1); } };
    let armed = false;
    $("imp").onclick = () => {
      let raw = null; try { raw = JSON.parse(decodeURIComponent(escape(atob($("bk").value.trim())))); } catch (e) {}
      if (!raw || !Array.isArray(raw.wirds)) { msg("bmsg", "That isn't a wird backup code.", 0); return; }
      const d = cleanState(raw);
      if (!d.wirds.length) { msg("bmsg", "That backup has no usable wirds.", 0); return; }
      if (!armed) { armed = true; $("imp").textContent = "Tap again to replace everything"; return; }
      const now = Date.now();
      // A restore is a deliberate edit: stamp it as newer so it also wins over the synced copy.
      d.wirds.forEach(w => { w.updatedAt = now; });
      state.wirds.forEach(w => { if (!d.wirds.find(x => x.id === w.id)) d.deleted[w.id] = now; });
      d.theme = d.theme || state.theme;
      state = d; save(); applyTheme(); home(); msg("bmsg", "Restored " + d.wirds.length + (d.wirds.length === 1 ? " wird." : " wirds."), 1);
    };
  }
  function msg(id, t, ok) { const e = $(id); if (e) { e.textContent = t; e.className = "msg " + (ok ? "ok" : "err"); } }

  // ---------- add / edit ----------
  let draft = null;
  function newDraft(type) { type = TYPES[type] ? type : "khatmah"; return { id: null, type, name: TYPES[type].name, sel: { by: "surah", items: [] }, ranges: type === "khatmah" ? "1-604" : "", dir: 1, target: 0, parts: 0, start: "" }; }
  function draftFrom(w) { return { id: w.id, type: w.type, name: w.name, sel: w.sel ? JSON.parse(JSON.stringify(w.sel)) : { by: "surah", items: [] }, ranges: w.ranges, dir: w.dir || 1, target: w.target || 0, parts: w.parts || 0, start: "" }; }
  function draftPages() {
    if (draft.type === "khatmah") return parseRanges("1-604");
    if (draft.type === "hifz" && draft.sel.items.length) return selPages(draft.sel);
    if (draft.type === "hifz") return draft.id ? parseRanges(draft.ranges) : null;
    return parseRanges(draft.ranges);
  }
  function opts2(by, sel) { const n = by === "juz" ? 30 : 114; let h = ""; for (let k = 1; k <= n; k++) h += '<option value="' + k + '"' + (k === (sel || 1) ? " selected" : "") + ">" + (by === "juz" ? "Juz " + k : k + ". " + esc(nm(k))) + "</option>"; return h; }
  // Pages still ahead of the reader in a draft: the whole thing for a new wird, from the bookmark for an existing one.
  function draftRemaining(pages) {
    if (!pages) return 0;
    const w = draft.id ? find(draft.id) : null;
    const from = w ? w.page : parseInt(draft.start, 10) || 0;
    if (!from) return pages.length;
    return Math.max(1, pages.filter(p => (draft.dir === -1 ? p <= from : p >= from)).length);
  }
  function form() {
    const d = draft, editing = !!d.id, pages = draftPages();
    let h = '<header class="bar"><button class="iconbtn" id="back" aria-label="Back">' + ICON.back + '</button><h1>' + (editing ? "Edit wird" : "New wird") + "</h1><span></span></header>";
    h += '<p class="lbl">Type</p><div class="seg">' + Object.keys(TYPES).map(k => '<button class="chip' + (d.type === k ? " on" : "") + '" data-type="' + k + '" aria-pressed="' + (d.type === k) + '">' + TYPES[k].label + "</button>").join("") + "</div>";
    h += '<label class="lbl" for="fn">Name</label><input type="text" id="fn" maxlength="40" value="' + esc(d.name) + '">';
    if (d.type === "khatmah") h += '<p class="hint">All 604 pages, Al-Fatihah to An-Nas. The khatmah count goes up each time you finish.</p>';
    if (d.type === "hifz") {
      const by = d.sel.by, n = by === "juz" ? 30 : 114;
      h += '<p class="lbl">What have you memorised?</p><div class="seg"><button class="chip' + (by === "surah" ? " on" : "") + '" data-by="surah" aria-pressed="' + (by === "surah") + '">By surah</button><button class="chip' + (by === "juz" ? " on" : "") + '" data-by="juz" aria-pressed="' + (by === "juz") + '">By juz</button></div>' +
        '<div class="panel"><p class="hint" style="margin-top:0">Add a run in one go</p><div class="row"><select id="rf" aria-label="From">' + opts2(by) + '</select><select id="rt" aria-label="To">' + opts2(by, n) + '</select><button class="btn" id="radd">Add</button></div>' +
        '<p class="hint">Or tap to pick</p><div class="list"><div class="chips">';
      for (let k = 1; k <= n; k++) { const on = d.sel.items.includes(k); h += '<button class="chip' + (on ? " on" : "") + '" data-item="' + k + '" aria-pressed="' + on + '">' + (by === "juz" ? "Juz " + k : k + ". " + esc(nm(k))) + "</button>"; }
      h += '</div></div><div class="row"><button class="btn" id="clr">Clear all</button></div></div>';
      if (editing && !d.sel.items.length) h += '<p class="hint">Currently pages ' + esc(d.ranges) + ". Pick surahs or juz to replace it.</p>";
    }
    if (d.type === "custom") h += '<label class="lbl" for="fr">Pages</label><input type="text" id="fr" value="' + esc(d.ranges) + '" placeholder="e.g. 1-50, 582-604"><p class="hint">Madani page ranges separated by commas.</p>';
    h += '<p class="count"><strong id="pcount">' + (pages ? pages.length + " pages" : "Nothing picked yet") + "</strong>" + (pages && pages.length ? "<span>pages " + esc(compress(pages)) + "</span>" : "") + "</p>";
    h += '<p class="lbl">Direction</p><div class="seg"><button class="chip' + (d.dir === 1 ? " on" : "") + '" data-dir="1" aria-pressed="' + (d.dir === 1) + '">From Al-Fatihah</button><button class="chip' + (d.dir === -1 ? " on" : "") + '" data-dir="-1" aria-pressed="' + (d.dir === -1) + '">From An-Nas</button></div>';
    if (!editing) h += '<label class="lbl" for="fs">Where are you now?</label><input type="number" id="fs" inputmode="numeric" min="1" max="604" value="' + esc(d.start) + '" placeholder="Page number, or leave empty to start at the beginning">';
    const rem = draftRemaining(pages);
    h += '<label class="lbl" for="ft">Daily target</label><div class="row"><input type="number" id="ft" inputmode="numeric" min="0" max="604" value="' + (d.target || "") + '" placeholder="Pages per day (optional)"></div><div class="chips" style="margin-top:8px">' + [[10, "Half juz"], [20, "1 juz"], [40, "2 juz"]].map(([v, l]) => '<button class="chip' + (d.target === v ? " on" : "") + '" data-tg="' + v + '">' + l + "</button>").join("") + "</div>";
    if (rem > 0) h += '<p class="hint" style="margin-top:12px">Or pick a finish line</p><div class="chips">' + [10, 20, 30, 60, 90].map(n => '<button class="chip' + (d.target === targetForDays(rem, n) ? " on" : "") + '" data-days="' + n + '">' + n + ' days</button>').join("") + "</div>" + (d.target ? '<p class="hint">' + d.target + " pages a day finishes the " + rem + " pages ahead in " + Math.ceil(rem / d.target) + " days.</p>" : "");
    h += '<div id="partsec"' + (d.target ? "" : " hidden") + '><p class="lbl">Split each day into sittings</p><div class="seg">' + [[0, "One go"], [2, "2"], [3, "3"], [4, "4"]].map(([v, l]) => '<button class="chip' + ((d.parts || 0) === v ? " on" : "") + '" data-parts="' + v + '" aria-pressed="' + ((d.parts || 0) === v) + '">' + l + "</button>").join("") + '</div><p class="hint">Smaller sittings tied to your day (commute, after Isha) are easier to keep than one long block.</p></div>';
    h += '<button class="btn primary wide" id="fsave" style="margin-top:24px">' + (editing ? "Save changes" : "Create wird") + '</button><p class="msg" id="fmsg" role="status"></p>';
    if (editing) h += '<button class="btn danger wide" id="fdel">Delete this wird</button>';
    paint(h);

    const keep = () => { d.name = $("fn").value; if ($("fr")) d.ranges = $("fr").value; if ($("fs")) d.start = $("fs").value; d.target = Math.min(PAGES, Math.max(0, parseInt($("ft").value, 10) || 0)); };
    const rerender = () => { const y = window.scrollY, l = root.querySelector(".list"), ls = l ? l.scrollTop : 0; form(); window.scrollTo(0, y); const l2 = root.querySelector(".list"); if (l2) l2.scrollTop = ls; };
    $("back").onclick = () => go(editing ? "w/" + d.id : "");
    root.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { keep(); const old = TYPES[d.type].name; d.type = b.dataset.type; if (!d.name || d.name === old) d.name = TYPES[d.type].name; if (d.type === "custom" && d.ranges === "1-604" && !editing) d.ranges = ""; rerender(); });
    root.querySelectorAll("[data-by]").forEach(b => b.onclick = () => { keep(); if (d.sel.by !== b.dataset.by) d.sel = { by: b.dataset.by, items: [] }; rerender(); });
    root.querySelectorAll("[data-item]").forEach(b => b.onclick = () => { keep(); const k = +b.dataset.item, it = d.sel.items, i = it.indexOf(k); if (i >= 0) it.splice(i, 1); else it.push(k); it.sort((a, b) => a - b); rerender(); });
    root.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { keep(); d.dir = +b.dataset.dir; rerender(); });
    root.querySelectorAll("[data-tg]").forEach(b => b.onclick = () => { keep(); d.target = +b.dataset.tg; rerender(); });
    root.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { keep(); d.target = targetForDays(draftRemaining(draftPages()), +b.dataset.days); rerender(); });
    root.querySelectorAll("[data-parts]").forEach(b => b.onclick = () => { keep(); d.parts = +b.dataset.parts; rerender(); });
    if ($("radd")) $("radd").onclick = () => { keep(); let a = +$("rf").value, b = +$("rt").value; if (a > b) [a, b] = [b, a]; for (let k = a; k <= b; k++) if (!d.sel.items.includes(k)) d.sel.items.push(k); d.sel.items.sort((x, y) => x - y); rerender(); };
    if ($("clr")) $("clr").onclick = () => { keep(); d.sel.items = []; rerender(); };
    $("ft").oninput = () => { const n = parseInt($("ft").value, 10) || 0; $("partsec").hidden = n <= 0; };
    if ($("fr")) $("fr").oninput = () => { d.ranges = $("fr").value; const p = parseRanges(d.ranges); $("pcount").textContent = p ? p.length + " pages" : "Check the page ranges"; };
    $("fsave").onclick = () => {
      keep();
      const p = draftPages();
      if (!p || !p.length) { msg("fmsg", d.type === "hifz" ? "Pick at least one surah or juz." : "Enter page ranges between 1 and 604, like 1-50, 582-604.", 0); return; }
      const ranges = compress(p), name = d.name.replace(/\s+/g, " ").trim().slice(0, 40) || TYPES[d.type].name, parts = d.target ? d.parts || 0 : 0;
      if (editing) {
        const w = find(d.id);
        Object.assign(w, { name, type: d.type, round: TYPES[d.type].round, ranges, sel: d.type === "hifz" && d.sel.items.length ? d.sel : w.sel || null, dir: d.dir, target: d.target, parts });
        w.weak = w.weak.filter(x => p.includes(x));
        if (!p.includes(w.page)) { const l = pagesOf(w); w.page = l.find(x => d.dir === 1 ? x > w.page : x < w.page) || l[0]; w.ayah = null; }
        touchW(w); save(); go("w/" + w.id);
      } else {
        if (state.wirds.length >= MAX_WIRDS) { msg("fmsg", "That's the most wirds you can keep (" + MAX_WIRDS + "). Delete one first.", 0); return; }
        const list = d.dir === -1 ? p.slice().reverse() : p;
        let start = list[0];
        const s = parseInt(d.start, 10);
        if (d.start !== "" && !(s >= 1 && s <= PAGES)) { msg("fmsg", "Pages run from 1 to 604.", 0); return; }
        if (s) start = p.includes(s) ? s : (list.find(x => d.dir === 1 ? x > s : x < s) || list[0]);
        const w = cleanWird({ id: Math.random().toString(36).slice(2, 10), name, type: d.type, ranges, sel: d.type === "hifz" ? d.sel : null, dir: d.dir, target: d.target, parts, page: start, cycle: 1, log: {}, createdAt: Date.now(), updatedAt: Date.now() });
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
  function shareText(w) {
    const { list, i } = posOf(w), tn = todayN(w), st = streak([w.log]);
    return w.name + ": page " + w.page + " (Juz " + juzOf(w.page) + "), " + (i + 1) + " of " + list.length + ". " + tn + (tn === 1 ? " page" : " pages") + " today" + (st ? ", " + st + "-day streak" : "") + ".";
  }
  function detail(w) {
    const { list, i } = posOf(w), fwd = w.dir !== -1, tn = todayN(w), left = list.length - i;
    const st = streak([w.log]), met = w.target && tn >= w.target;
    let eta = "";
    if (w.target) {
      const days = Math.ceil(left / w.target), d = new Date(); d.setDate(d.getDate() + days);
      const pace = paceDays(w);
      eta = "At " + w.target + " pages a day, this " + w.round.toLowerCase() + " finishes around " + shortDate(d) + "." + (pace >= 1 ? " You're about " + pace + (pace === 1 ? " day" : " days") + " ahead this week." : pace <= -1 ? " You're about " + -pace + (pace === -1 ? " day" : " days") + " behind this week." : "");
    }
    const hm = heat(w), weakHere = w.weak.includes(w.page), parts = w.target && w.parts > 1 ? w.parts : 0, done = parts ? sittingsDone(w.target, parts, tn) : 0;
    let h = '<header class="bar"><button class="iconbtn" id="back" aria-label="All wirds">' + ICON.back + '</button><h1>' + esc(w.name) + '</h1><button class="iconbtn" id="edit" aria-label="Edit this wird">' + ICON.edit + "</button></header>" +
      '<div class="dial"><button class="step" id="prev" aria-label="Back one page">' + (fwd ? "−" : "+") + '</button>' +
      '<div class="medal">' + SEAL(200, "orn big", w.target ? Math.min(1, tn / w.target) : i / list.length, met) + '<input id="pg" type="number" inputmode="numeric" min="1" max="604" value="' + w.page + '" aria-label="Page number"><small>page</small></div>' +
      '<button class="step" id="next" aria-label="Forward one page">' + (fwd ? "+" : "−") + "</button></div>" +
      '<p class="where">' + esc(posText(w)) + "</p>" +
      '<p class="sub">Juz ' + juzOf(w.page) + ", " + (i + 1) + " of " + list.length + " pages, " + esc(w.round.toLowerCase()) + " " + w.cycle + (w.ayah ? "<br>Page " + w.page + ": " + esc(rangeText(w.page)) : "") + '</p><p class="msg center" id="pmsg" role="status"></p>' +
      '<div class="quick">' + [2, 5, 10, 20].map(n => '<button class="chip" data-q="' + n + '">+' + n + "</button>").join("") + "</div>" +
      '<div class="quick"><button class="chip flag' + (weakHere ? " on" : "") + '" id="weak" aria-pressed="' + weakHere + '">' + ICON.flag + (weakHere ? " Marked weak" : " Mark weak") + '</button><a class="chip ext" href="https://quran.com/page/' + w.page + '" target="_blank" rel="noopener">Open page ' + ICON.ext + '</a><button class="chip" id="share">' + ICON.share + " Share</button></div>";
    if (parts) {
      const per = w.target / parts, need = Math.max(1, Math.ceil(per * (done + 1) - tn - 1e-9));
      h += '<section class="sit"><div class="dots big" aria-label="' + done + " of " + parts + ' sittings done">' + Array.from({ length: parts }, (_, k) => '<i class="' + (k < done ? "on" : "") + '"><b>' + (k + 1) + "</b></i>").join("") + "</div>" +
        '<p class="hint center">' + (done >= parts ? "Every sitting done today. Alhamdulillah." : "Sitting " + (done + 1) + " of " + parts + ": " + need + (need === 1 ? " more page" : " more pages")) + "</p></section>";
    }
    h += '<section class="stats"><div class="srow"><div><strong>' + tn + (w.target ? "<small>/" + w.target + "</small>" : "") + '</strong><span>pages today</span></div><div><strong>' + st + '</strong><span>day streak</span></div><div><strong>' + left + '</strong><span>pages to go</span></div></div>' + bars(w) +
      '<p class="hint center" style="margin-top:14px">Read on <strong>' + hm.read + "</strong> of the last " + hm.total + " days</p>" + hm.html + (eta ? '<p class="hint">' + eta + "</p>" : "") + "</section>" +
      '<section><h2>Juz map</h2>' + juzMap(w, list, i) + '<p class="hint">Tap a juz to move your place to its first page in this wird.</p></section>';
    if (w.weak.length) h += '<section><h2>Weak pages</h2><div class="chips">' + w.weak.map(p => '<span class="wk"><a class="chip" href="https://quran.com/page/' + p + '" target="_blank" rel="noopener">p. ' + p + '</a><button class="x" data-unweak="' + p + '" aria-label="Unmark page ' + p + '">×</button></span>').join("") + '</div><p class="hint">Tap a page to open it and revise. Your place here does not move.</p></section>';
    h += '<section><h2>Where did you stop?</h2>';
    ayatOnPage(w.page).forEach(g => {
      h += '<div class="group"><p>' + esc(nm(g.s)) + '</p><div class="chips">';
      for (let a = g.from; a <= g.to; a++) { const on = w.ayah && w.ayah[0] === g.s && w.ayah[1] === a; h += '<button class="chip ay' + (on ? " on" : "") + '" data-s="' + g.s + '" data-a="' + a + '" aria-pressed="' + on + '">' + a + "</button>"; }
      h += "</div></div>";
    });
    h += '<p class="hint">Tap again to clear.</p></section>' +
      '<section><h2>Jump to</h2><div class="row"><select id="js" aria-label="Surah">' + opts2("surah", w.ayah ? w.ayah[0] : ayatOnPage(w.page)[0].s) +
      '</select><input id="ja" type="number" inputmode="numeric" min="1" placeholder="Ayah" aria-label="Ayah" class="ayin"><button class="btn primary" id="jgo">Go</button></div><p class="msg" id="jmsg" role="status"></p></section>';
    paint(h);
    const snap = () => JSON.stringify(w);
    const restore = before => { Object.assign(w, JSON.parse(before)); touchW(w); save(); detail(w); };
    const doStep = n => {
      const before = snap(), cyc = w.cycle, moved = step(w, n); vibrate(); detail(w);
      if (n > 0 && w.cycle > cyc) toast(w.round + " " + cyc + " complete. Alhamdulillah!", () => restore(before));
      else if (Math.abs(n) > 1 && moved) toast("Moved " + Math.abs(moved) + " pages to p. " + w.page, () => restore(before));
    };
    $("back").onclick = () => go("");
    $("edit").onclick = () => go("w/" + w.id + "/edit");
    $("prev").onclick = () => doStep(-1);
    $("next").onclick = () => doStep(1);
    root.querySelectorAll("[data-q]").forEach(b => b.onclick = () => doStep(+b.dataset.q));
    $("weak").onclick = () => { w.weak = weakHere ? w.weak.filter(x => x !== w.page) : [...w.weak, w.page].sort((a, b) => a - b); touchW(w); save(); vibrate(); detail(w); };
    root.querySelectorAll("[data-unweak]").forEach(b => b.onclick = () => { w.weak = w.weak.filter(x => x !== +b.dataset.unweak); touchW(w); save(); detail(w); });
    root.querySelectorAll("[data-jz]").forEach(b => b.onclick = () => { const p = +b.dataset.jz; if (!p || p === w.page) return; const before = snap(); setPage(w, p); detail(w); toast("Moved your place to page " + p, () => restore(before)); });
    $("share").onclick = async () => {
      const text = shareText(w);
      try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(text); msg("pmsg", "Copied: " + text, 1); } catch (e) { msg("pmsg", text, 1); }
    };
    $("pg").onchange = () => {
      const p = parseInt($("pg").value, 10);
      if (!(p >= 1 && p <= PAGES)) { msg("pmsg", "Pages run from 1 to 604.", 0); $("pg").value = w.page; return; }
      if (!list.includes(p)) { const nx = list.find(x => fwd ? x > p : x < p) || list[0]; setPage(w, nx); detail(w); msg("pmsg", "Page " + p + " isn't in this wird, so it moved to page " + nx + ".", 0); return; }
      setPage(w, p); detail(w);
    };
    root.querySelectorAll("[data-s]").forEach(c => c.onclick = () => {
      const s = +c.dataset.s, a = +c.dataset.a, on = w.ayah && w.ayah[0] === s && w.ayah[1] === a;
      setPage(w, w.page, on ? null : [s, a]); vibrate(); detail(w);
    });
    $("jgo").onclick = () => {
      const s = +$("js").value, a = parseInt($("ja").value, 10);
      if (!(a >= 1 && a <= ayatCount(s))) { msg("jmsg", nm(s) + " has " + ayatCount(s) + " ayat.", 0); return; }
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
    if (!current.startsWith("detail:") || /input|select|textarea/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
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
      state = mergeStates(state, cleanState(remote));
      save(false);
      applyTheme();
      if (current !== "form") rerenderInPlace();
      return state;
    },
    refreshHome() { if (current === "home") { const y = window.scrollY; home(); window.scrollTo(0, y); } },
    destroy() { window.removeEventListener("hashchange", route); window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); }
  };
}
