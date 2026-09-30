// @ts-nocheck
import {
  MAX_WIRDS, PAGES, ayatCount, ayatOnPage, cleanState, cleanWird, compress, dateAgo, dayKey, daysAgo, juzOf, juzPages,
  mergeStates, paceDays, pageOf, parseRanges, rangeText, selPages, sittingsDone, stableKey, surahName as nm, targetForDays,
} from "./core";
import { DEFAULT_THEME, PAL, themeCss } from "./themes";
import {
  MAX_OFFSET, MAX_REMINDER_PAGES, PRAYERS, PRAYER_LABEL, cleanPrayer, fmtTime, nextUp, parseIcs, planReminders,
  remindersToIcs, timetableFromEvents,
} from "./prayer";
import { webNotifier } from "./notify-web";

export { mergeStates, stableKey, PAL };

const KEY = "wird-bookmarks-v3";
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
const ICAL_KEY = "wird-ical-url"; // the calendar link is a secret, so it stays on this device and is never synced
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
  function stampDay(w, k) { w.logAt = w.logAt || {}; w.logAt[k] = Date.now(); }
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
    stampDay(w, k);
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


  // ---------- prayer reminders ----------
  const getIcal = () => { try { return localStorage.getItem(ICAL_KEY) || ""; } catch (e) { return ""; } };
  const setIcal = v => { try { if (v) localStorage.setItem(ICAL_KEY, v); else localStorage.removeItem(ICAL_KEY); } catch (e) {} };
  const reminderWird = () => find(state.prayer.wird) || state.wirds[0] || null;
  function setPrayer(patch) {
    state.prayer = cleanPrayer(Object.assign({}, state.prayer, patch, { updatedAt: Date.now() }));
    save(); scheduleNotifications();
  }
  // Notifications go through a notifier: browser timers on the web, the phone's own scheduler in the app.
  const notifier = opts.notifier || webNotifier();
  let notif = notifier.current ? notifier.current() : "unknown";
  let exact = "granted";
  const prayerWord = p => PRAYER_LABEL[p];
  function reminderId(r) { const [y, m, d] = r.day.split("-").map(Number); return ((y % 100) * 10000 + m * 100 + d) * 10 + PRAYERS.indexOf(r.prayer) + 1; }
  function reminderMessage(r) {
    const P = state.prayer, w = reminderWird(), when = P.offset === 0 ? "at " : (P.dir === -1 ? "before " : "after ");
    return { title: "Read " + r.pages + (r.pages === 1 ? " page " : " pages ") + when + prayerWord(r.prayer), body: prayerWord(r.prayer) + " jamat " + fmtTime(r.jamat) + (P.offset ? " · " + P.offset + " min " + (P.dir === -1 ? "before" : "after") : "") + (w ? " · " + w.name : "") };
  }
  // Hands the notifier every reminder in its window. Skipped until the permission state is known, so a slow
  // permission check at start-up can never wipe reminders the phone already holds.
  function scheduleNotifications() {
    if (notif === "unknown") return;
    const now = Date.now();
    const list = notif !== "granted" ? [] : planReminders(state.prayer, now, now + notifier.horizonMs).slice(0, notifier.max).map(r => Object.assign({ id: reminderId(r), at: r.at }, reminderMessage(r)));
    Promise.resolve(notifier.sync(list)).catch(() => {});
  }
  async function refreshNotif() {
    let changed = false;
    try { const s2 = await notifier.status(); if (s2 !== notif) { notif = s2; changed = true; } } catch (e) {}
    if (notifier.exact) { try { const e2 = await notifier.exact.status(); if (e2 !== exact) { exact = e2; changed = true; } } catch (e) {} }
    scheduleNotifications();
    if (changed && current === "home") { const y = window.scrollY; home(); window.scrollTo(0, y); }
  }
  let calBusy = false;
  async function syncCalendar(manual) {
    const url = getIcal();
    if (!url || !opts.fetchCalendar || calBusy) { if (manual && !url) msg("pstat", "Paste a calendar link first.", 0); return false; }
    calBusy = true;
    if (manual) msg("pstat", "Reading the calendar…", 1);
    try {
      const r = await opts.fetchCalendar(url);
      if (!r || !r.ok) { if (manual) msg("pstat", (r && r.message) || "Could not read the calendar.", 0); return false; }
      const parsed = parseIcs(r.ics), days = timetableFromEvents(parsed.events, parsed.tz), n = Object.keys(days).length;
      if (!n) { if (manual) msg("pstat", "No prayer times found in that calendar. Events should be named Fajr, Dhuhr, Asr, Maghrib and Isha.", 0); return false; }
      setPrayer({ days: Object.assign({}, state.prayer.days, days), syncedAt: Date.now() });
      if (current === "home") { const y = window.scrollY; home("fold-prayer"); window.scrollTo(0, y); msg("pstat", "Read " + n + (n === 1 ? " day" : " days") + " of prayer times.", 1); }
      return true;
    } catch (e) { if (manual) msg("pstat", "Could not read the calendar. Try again in a moment.", 0); return false; }
    finally { calBusy = false; }
  }
  const staleCalendar = () => state.prayer.mode === "calendar" && getIcal() && Date.now() - state.prayer.syncedAt > 6 * 3600000;
  const mins = ms => Math.max(0, Math.round(ms / 60000));
  const inText = m => (m < 1 ? "now" : m < 60 ? "in " + m + " min" : "in " + Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : ""));
  function nextUpHtml() {
    const P = state.prayer;
    if (!P.prayers.length) return "";
    const n = nextUp(P, Date.now());
    if (!n) return '<div class="nextup idle"><span>Reminders are on, but there are no prayer times yet. Open Prayer reminders to add them.</span></div>';
    const w = reminderWird(), left = n.at - Date.now();
    const timing = P.offset === 0 ? "at jamat" : P.offset + " min " + (P.dir === -1 ? "before" : "after");
    return '<div class="nextup' + (n.due ? " due" : "") + '"><div><strong>' + PRAYER_LABEL[n.prayer] + " jamat " + fmtTime(n.jamat) + "</strong><span>" +
      (n.due ? "Time to read " : "Read ") + n.pages + (n.pages === 1 ? " page" : " pages") + " · " + timing + (w ? " · " + esc(w.name) + ", p. " + w.page : "") + "</span></div><b>" + (n.due ? inText(mins(n.jamat - Date.now())).replace("in ", "") + " left" : inText(mins(left))) + "</b></div>";
  }
  function prayerFold() {
    const P = state.prayer, ns = notif, cal = P.mode === "calendar";
    let h = '<details class="fold" id="fold-prayer"><summary>Prayer reminders' + (P.prayers.length ? ' <span class="badge">On</span>' : "") + '</summary><p class="muted small">A nudge to read a few pages before (or after) the congregation prayer, at whatever timing suits you.</p>';
    h += '<p class="lbl">Remind me for</p><div class="chips">' + PRAYERS.map(p => '<button class="chip' + (P.prayers.includes(p) ? " on" : "") + '" data-pray="' + p + '" aria-pressed="' + P.prayers.includes(p) + '">' + PRAYER_LABEL[p] + "</button>").join("") + "</div>";
    h += '<p class="lbl">When</p><div class="seg"><button class="chip' + (P.dir === -1 ? " on" : "") + '" data-pdir="-1" aria-pressed="' + (P.dir === -1) + '">Before jamat</button><button class="chip' + (P.dir === 1 ? " on" : "") + '" data-pdir="1" aria-pressed="' + (P.dir === 1) + '">After jamat</button></div>';
    h += '<div class="chips" style="margin-top:8px">' + [0, 15, 30, 45, 60].map(n => '<button class="chip' + (P.offset === n ? " on" : "") + '" data-poff="' + n + '">' + (n === 0 ? "At jamat" : n + " min") + "</button>").join("") + '</div><div class="row"><input type="number" id="poff" inputmode="numeric" min="0" max="' + MAX_OFFSET + '" value="' + P.offset + '" aria-label="Minutes from jamat"><span class="muted small">minutes, or type your own</span></div>';
    h += '<p class="lbl">Pages each time</p><div class="chips">' + [2, 3, 4, 5, 10].map(n => '<button class="chip' + (P.pages === n ? " on" : "") + '" data-ppages="' + n + '">' + n + "</button>").join("") + '</div><div class="row"><input type="number" id="ppages" inputmode="numeric" min="1" max="' + MAX_REMINDER_PAGES + '" value="' + P.pages + '" aria-label="Pages each time"><span class="muted small">pages, or type your own</span></div>';
    if (state.wirds.length > 1) h += '<label class="lbl" for="pwird">For which wird</label><select id="pwird">' + state.wirds.map(w => '<option value="' + esc(w.id) + '"' + ((P.wird || state.wirds[0].id) === w.id ? " selected" : "") + ">" + esc(w.name) + "</option>").join("") + "</select>";
    h += '<p class="lbl">Jamat times</p><div class="seg"><button class="chip' + (cal ? " on" : "") + '" data-pmode="calendar" aria-pressed="' + cal + '">From a calendar</button><button class="chip' + (!cal ? " on" : "") + '" data-pmode="manual" aria-pressed="' + !cal + '">Type them in</button></div>';
    if (cal && !opts.fetchCalendar) {
      h += '<p class="hint">Reading a calendar link works in the Wird Android app, where the phone fetches it directly. In a browser, type the times in instead.</p>';
    } else if (cal) {
      h += '<label class="lbl" for="ical" style="margin-top:12px">Calendar link</label><input type="url" id="ical" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://calendar.google.com/…/basic.ics" value="' + esc(getIcal()) + '">' +
        '<div class="row"><button class="btn" id="isync">Read times now</button></div><p class="msg" id="pstat" role="status">' + (P.syncedAt ? "Last read " + new Date(P.syncedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ", " + Object.keys(P.days).length + " days." : "") + "</p>" +
        '<p class="hint">Use a calendar whose events are named Fajr, Dhuhr, Asr, Maghrib and Isha, and end at the iqamah. In Google Calendar: Settings, pick the calendar, then "Secret address in iCal format". The link stays on this phone. Times refresh by themselves every few hours while Wird is open.</p>';
    } else {
      h += '<div class="times">' + PRAYERS.map(p => '<label for="pm-' + p + '">' + PRAYER_LABEL[p] + '</label><input type="time" id="pm-' + p + '" value="' + esc(P.manual[p] || "") + '">').join("") + '</div><p class="hint">Times that do not change from day to day. Leave a prayer empty to skip it.</p>';
    }
    h += '<p class="lbl">Get the reminders</p><div class="row wrapbtn">';
    if (ns === "granted") h += '<button class="btn" id="ptest">Send a test</button><span class="okmark">Notifications on</span>';
    else if (ns === "default" || ns === "unknown") h += '<button class="btn" id="pnotif">Turn on notifications</button>';
    else h += '<span class="muted small">' + (ns === "denied" ? (opts.native ? "Notifications are turned off for Wird in your phone settings." : "Notifications are blocked for this site in your browser settings.") : "This browser cannot show notifications.") + "</span>";
    if (!notifier.reliable) h += '<button class="btn" id="pcal">Add next 14 days to my calendar</button>';
    h += '</div>';
    if (notifier.exact && ns === "granted" && exact !== "granted") h += '<div class="row wrapbtn"><button class="btn" id="pexact">Allow on-time reminders</button><span class="muted small">Without this, Android may deliver them a few minutes late.</span></div>';
    h += '<p class="msg" id="pmsg" role="status"></p>';
    h += notifier.reliable
      ? '<p class="hint">Reminders are scheduled on your phone for the next two weeks and arrive even when Wird is closed. Opening Wird now and then tops them up.</p></details>'
      : '<p class="hint">Notifications only arrive while Wird is open or running in the background, which some phones limit. For alerts that always arrive, add the reminders to your calendar: they are ordinary events with an alert, so your phone handles the rest. Add again every couple of weeks to refresh the times.</p></details>';
    return h;
  }
  function bindPrayer() {
    const open = () => { const y = window.scrollY; home("fold-prayer"); window.scrollTo(0, y); };
    const P = () => state.prayer;
    root.querySelectorAll("[data-pray]").forEach(b => b.onclick = () => { const p = b.dataset.pray, cur = P().prayers; setPrayer({ prayers: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p] }); open(); });
    root.querySelectorAll("[data-pdir]").forEach(b => b.onclick = () => { setPrayer({ dir: +b.dataset.pdir }); open(); });
    root.querySelectorAll("[data-poff]").forEach(b => b.onclick = () => { setPrayer({ offset: +b.dataset.poff }); open(); });
    root.querySelectorAll("[data-ppages]").forEach(b => b.onclick = () => { setPrayer({ pages: +b.dataset.ppages }); open(); });
    root.querySelectorAll("[data-pmode]").forEach(b => b.onclick = () => { setPrayer({ mode: b.dataset.pmode }); open(); });
    if ($("poff")) $("poff").onchange = () => { setPrayer({ offset: parseInt($("poff").value, 10) }); open(); };
    if ($("ppages")) $("ppages").onchange = () => { setPrayer({ pages: parseInt($("ppages").value, 10) }); open(); };
    if ($("pwird")) $("pwird").onchange = () => { setPrayer({ wird: $("pwird").value }); open(); };
    PRAYERS.forEach(p => { if ($("pm-" + p)) $("pm-" + p).onchange = () => { const m = Object.assign({}, P().manual); if ($("pm-" + p).value) m[p] = $("pm-" + p).value; else delete m[p]; setPrayer({ manual: m }); open(); }; });
    if ($("ical")) $("ical").onchange = () => { setIcal($("ical").value.trim()); };
    if ($("isync")) $("isync").onclick = () => { setIcal($("ical").value.trim()); syncCalendar(true); };
    if ($("pnotif")) $("pnotif").onclick = async () => { try { notif = await notifier.request(); } catch (e) {} await refreshNotif(); open(); };
    if ($("pexact")) $("pexact").onclick = async () => { await notifier.exact.open(); await refreshNotif(); open(); };
    if ($("ptest")) $("ptest").onclick = async () => {
      const r = { prayer: P().prayers[0] || "dhuhr", jamat: Date.now() + 30 * 60000, pages: P().pages, day: "test" }, m = reminderMessage(r);
      const ok = await notifier.test(m.title, m.body); msg("pmsg", ok ? "Sent. It should appear in a moment." : "Could not show a notification. Check your settings.", ok ? 1 : 0);
    };
    if ($("pcal")) $("pcal").onclick = () => {
      const now = Date.now(), list = planReminders(P(), now, now + 14 * 86400000);
      if (!P().prayers.length) { msg("pmsg", "Pick at least one prayer first.", 0); return; }
      if (!list.length) { msg("pmsg", "No prayer times yet. Read a calendar or type the times in first.", 0); return; }
      const w = reminderWird(), ics = remindersToIcs(list, { wirdName: w && w.name, page: w && w.page, offset: P().offset, dir: P().dir });
      try {
        const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), a = document.createElement("a");
        a.href = url; a.download = "wird-reminders.ics"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        msg("pmsg", list.length + " reminders ready. Open the file to add them to your calendar.", 1);
      } catch (e) { msg("pmsg", "Could not create the file on this device.", 0); }
    };
  }

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
    if (opts.onTheme) opts.onTheme(t.dark);
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
    for (const k of ["q", "s", "item", "pal", "mode", "type", "by", "dir", "tg", "days", "parts", "open", "new", "jz", "unweak", "pray", "pdir", "poff", "ppages", "pmode"]) {
      if (a.dataset && a.dataset[k] !== undefined) return "[data-" + k + '="' + a.dataset[k] + '"]' + (k === "s" ? '[data-a="' + a.dataset.a + '"]' : "");
    }
    return null;
  }
  function paint(html) {
    const sel = focusSel(), openIds = [...root.querySelectorAll("details[open]")].map(d => d.id).filter(Boolean);
    root.innerHTML = '<div class="wrap">' + html + "</div>";
    openIds.forEach(id => { const d = root.querySelector("#" + id); if (d) d.open = true; });
    if (sel) { const el = root.querySelector(sel); if (el && el.focus) try { el.focus({ preventScroll: true }); } catch (e) {} }
  }

  // ---------- home ----------
  function home(openFold) {
    const today = new Date(), total = state.wirds.reduce((s, w) => s + todayN(w), 0), st = streak(state.wirds.map(w => w.log));
    let h = '<header class="top"><div class="brand"><span class="wm">Wird</span><span class="ar" lang="ar">وِرد</span></div><div class="acct-slot"></div></header>' +
      '<p class="date">' + today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + "</p>";
    if (state.wirds.length) {
      let week = '<div class="week" aria-label="This week">';
      for (let i = 6; i >= 0; i--) { const on = state.wirds.some(w => (w.log[daysAgo(i)] || 0) > 0); week += '<span class="' + (on ? "on" : "") + (i === 0 ? " now" : "") + '"><i></i>' + (i === 0 ? "Today" : dateAgo(i).toLocaleDateString("en-GB", { weekday: "narrow" })) + "</span>"; }
      h += '<div class="summary"><div><strong>' + total + '</strong><span>' + (total === 1 ? "page" : "pages") + ' today</span></div><div><strong>' + st + '</strong><span>day streak</span></div><div><strong>' + state.wirds.length + '</strong><span>' + (state.wirds.length === 1 ? "wird" : "wirds") + "</span></div>" + week + "</div></div>" + nextUpHtml();
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
    h += '<details class="fold" id="fold-appearance"><summary>Appearance</summary><div class="swatches">' +
      Object.keys(PAL).map(k => { const c = PAL[k].light, d = PAL[k].dark; return '<button class="sw' + (t.pal === k ? " on" : "") + '" data-pal="' + k + '" aria-pressed="' + (t.pal === k) + '"><span><i style="background:' + c[0] + '"></i><i style="background:' + c[6] + '"></i><i style="background:' + c[5] + '"></i><i style="background:' + d[0] + '"></i></span>' + PAL[k].name + "</button>"; }).join("") +
      '</div><div class="seg" style="margin-top:12px">' + [["auto", "Match phone"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => '<button class="chip' + (t.mode === k ? " on" : "") + '" data-mode="' + k + '" aria-pressed="' + (t.mode === k) + '">' + l + "</button>").join("") + "</div></details>";
    h += prayerFold();
    h += '<details class="fold" id="fold-backup"><summary>Backup code</summary><p class="muted small">Copy this to keep a backup, or paste one to restore. It is also how you move your wirds to another phone or to the app.</p>' +
      '<div class="row"><button class="btn" id="exp">Show code</button><button class="btn" id="copy" hidden>Copy</button></div>' +
      '<textarea id="bk" spellcheck="false" aria-label="Backup code"></textarea>' +
      '<div class="row"><button class="btn" id="imp">Restore from code</button></div><p class="msg" id="bmsg" role="status"></p></details>' +
      '<p class="foot">Madani mushaf, 604 pages. Page and ayah data checked against alquran.cloud and quran.com.<br>Wird ' + APP_VERSION + '</p>';
    paint(h);
    if (openFold) { const f = root.querySelector("#" + openFold); if (f) f.open = true; }
    bindPrayer();
    if (opts.onHome) opts.onHome(root.querySelector(".acct-slot"));
    root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => go("w/" + b.dataset.open));
    root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => go("new" + (b.dataset.new ? "/" + b.dataset.new : "")));
    const reopen = () => home("fold-appearance");
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
      state.wirds.forEach(w => { if (!d.wirds.find(x => x.id === w.id)) { d.deleted[w.id] = now; d.gone = [w, ...d.gone.filter(x => x.id !== w.id)]; } });
      d.theme = d.theme || state.theme;
      if (!raw.prayer) d.prayer = state.prayer;
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
    h += '<p class="count"><strong id="pcount">' + (pages ? pages.length + " pages" : "Nothing picked yet") + "</strong>" + (pages && pages.length ? "<span>p. " + esc(compress(pages)) + "</span>" : "") + "</p>";
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
      const gone = find(d.id);
      state.wirds = state.wirds.filter(x => x.id !== d.id); state.deleted[d.id] = Date.now();
      state.gone = [gone, ...(state.gone || []).filter(x => x.id !== d.id)].slice(0, 30);
      save(); go("");
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
      '<div class="quick"><button class="chip flag' + (weakHere ? " on" : "") + '" id="weak" aria-label="Mark this page as weak" aria-pressed="' + weakHere + '">' + ICON.flag + (weakHere ? " Weak ✓" : " Weak") + '</button><a class="chip ext" href="https://quran.com/page/' + w.page + '" target="_blank" rel="noopener">Open page ' + ICON.ext + '</a><button class="chip" id="share">' + ICON.share + " Share</button></div>";
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
    // Undo puts today's count back, so it is stamped as a fresh change and wins over the synced copy.
    const restore = before => { Object.assign(w, JSON.parse(before)); stampDay(w, dayKey()); touchW(w); save(); detail(w); };
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
      if (opts.share) { if (await opts.share(text)) return; }
      else { try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === "AbortError") return; } }
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
  const onVis = () => { if (!document.hidden) { refreshNotif(); if (staleCalendar()) syncCalendar(false); if (current !== "form") rerenderInPlace(); } };
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
  scheduleNotifications();
  refreshNotif();
  if (staleCalendar()) setTimeout(() => syncCalendar(false), 800);
  // Keep the "next up" line fresh, top up notification timers, and refresh stale calendar data.
  const ticker = setInterval(() => {
    if (current === "home") { const el = root.querySelector(".nextup"); if (el || state.prayer.prayers.length) { const html = nextUpHtml(); if (el && html) el.outerHTML = html; } }
  }, 30000);
  const topUp = setInterval(() => { refreshNotif(); if (staleCalendar()) syncCalendar(false); }, 30 * 60000);

  return {
    getState: () => state,
    applyRemote(remote) {
      if (!remote || !Array.isArray(remote.wirds)) return state;
      state = mergeStates(state, cleanState(remote));
      save(false);
      applyTheme();
      scheduleNotifications();
      if (current !== "form") rerenderInPlace();
      return state;
    },
    refreshHome() { if (current === "home") { const y = window.scrollY; home(); window.scrollTo(0, y); } },
    destroy() { clearInterval(ticker); clearInterval(topUp); if (!notifier.reliable) Promise.resolve(notifier.sync([])).catch(() => {}); window.removeEventListener("hashchange", route); window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); }
  };
}
