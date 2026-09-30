// @ts-nocheck
import {
  MAX_WIRDS, PAGES, ayatCount, ayatOnPage, cleanState, cleanWird, compress, dateAgo, dayKey, daysAgo, juzOf, juzPages,
  mergeStates, paceDays, pageOf, parseRanges, rangeText, selPages, sittingsDone, stableKey, surahName as nm, targetForDays,
  describeSel, emptySel, groupDue, parseGroupMessage, portionMessage, tickMessage, absPage, fromAbs,
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
const WEEKDAY_MON0 = d => (d.getDay() + 6) % 7;

// ---------- app ----------
export function createWirdApp(root, opts = {}) {
  const $ = id => root.querySelector("#" + id);
  const TYPES = { khatmah: { label: "Khatmah", round: "Khatmah", name: "Khatmah" }, hifz: { label: "Hifz revision", round: "Cycle", name: "Hifz revision" }, custom: { label: "Other", round: "Round", name: "My wird" }, group: { label: "Group", round: "Khatmah", name: "Group khatmah" } };
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
    if (changed && (current === "home" || current === "settings")) rerenderInPlace();
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
      if (current === "settings") { const y = window.scrollY; settings("fold-prayer"); window.scrollTo(0, y); msg("pstat", "Read " + n + (n === 1 ? " day" : " days") + " of prayer times.", 1); }
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
    if (!n) return '<div class="nextup idle"><span>Reminders are on, but there are no prayer times yet. Add them in Settings.</span></div>';
    const w = reminderWird(), left = n.at - Date.now();
    const timing = P.offset === 0 ? "at jamat" : P.offset + " min " + (P.dir === -1 ? "before" : "after");
    return '<div class="nextup' + (n.due ? " due" : "") + '"><div><strong>' + PRAYER_LABEL[n.prayer] + " jamat " + fmtTime(n.jamat) + "</strong><span>" +
      (n.due ? "Time to read " : "Read ") + n.pages + (n.pages === 1 ? " page" : " pages") + " · " + timing + (w ? " · " + esc(w.name) + ", p. " + w.page : "") + "</span></div><b>" + (n.due ? inText(mins(n.jamat - Date.now())).replace("in ", "") + " left" : inText(mins(left))) + "</b></div>";
  }
  function prayerFold() {
    const P = state.prayer, ns = notif, cal = P.mode === "calendar";
    let h = '<details class="card fold" id="fold-prayer"><summary><h2>Prayer reminders</h2>' + (P.prayers.length ? '<span class="badge">On</span>' : '<span class="muted small">Off</span>') + '</summary><p class="muted small">A nudge to read a few pages before (or after) the congregation prayer, at whatever timing suits you.</p>';
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
    const open = () => { const y = window.scrollY; settings("fold-prayer"); window.scrollTo(0, y); };
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
  const I = (d, sw = 1.9) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON = {
    back: I("M15 5l-7 7 7 7", 2.2),
    edit: I("M4 20h4L19 9l-4-4L4 16v4z"),
    ext: I("M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"),
    flag: I("M6 21V4M6 5h11l-2 4 2 4H6"),
    share: I("M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"),
    today: I("M12 3.5 3.5 10.5V20h6v-6h5v6h6v-9.5z"),
    stats: I("M5 20V11M12 20V5M19 20v-6"),
    gear: I("M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5l1.6 1.2-2 3.4-1.9-.8a7 7 0 0 1-2 1.2l-.3 2h-4l-.3-2a7 7 0 0 1-2-1.2l-1.9.8-2-3.4 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 2-3.4 1.9.8a7 7 0 0 1 2-1.2l.3-2h4l.3 2a7 7 0 0 1 2 1.2l1.9-.8 2 3.4-1.6 1.2a7 7 0 0 1 0 3z", 1.6),
    flame: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 22c4 0 7-2.8 7-6.8 0-3.4-2.2-5.6-3.6-7.4-.4 1.8-1.4 3-2.6 3.6.4-3.4-1-6.6-4.2-8.4.4 3-1 5.2-2.6 7.2C4.6 12.1 5 13.4 5 15.2 5 19.2 8 22 12 22z" fill="currentColor"/></svg>',
    plus: I("M12 5v14M5 12h14", 2.2),
    check: I("M5 12.5l4.5 4.5L19 7.5", 2.4),
    book: I("M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"),
    loop: I("M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"),
    list: I("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01", 2.2),
    group: I("M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6"),
    send: I("M21 3 10 14M21 3l-7 18-4-7-7-4z"),
  };
  const RC = r => 2 * Math.PI * r;
  const ring = (size, frac, cls) => {
    const r = 44, c = RC(r), f = Math.max(0, Math.min(1, frac));
    return '<svg class="ring ' + (cls || "") + '" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true"><circle class="rt" cx="50" cy="50" r="' + r + '"/>' +
      (f > 0 ? '<circle class="rp" cx="50" cy="50" r="' + r + '" stroke-dasharray="' + (f * c).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 50 50)"/>' : "") + "</svg>";
  };
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  function nav(tab) {
    const item = (k, href, icon, label) => '<a class="tab' + (tab === k ? " on" : "") + '" href="#' + href + '"' + (tab === k ? ' aria-current="page"' : "") + ">" + icon + "<span>" + label + "</span></a>";
    return '<nav class="tabs" aria-label="Main">' + item("today", "", ICON.today, "Today") + item("progress", "progress", ICON.stats, "Progress") + item("settings", "settings", ICON.gear, "Settings") + "</nav>";
  }
  function bars(w) {
    let h = '<div class="bars" role="img" aria-label="Pages over the last 7 days">', max = Math.max(1, w.target || 0, ...[0, 1, 2, 3, 4, 5, 6].map(i => w.log[daysAgo(i)] || 0));
    for (let i = 6; i >= 0; i--) {
      const n = w.log[daysAgo(i)] || 0;
      h += '<div class="bcol"><em>' + (n || "") + '</em><div class="btrack"><i style="height:' + Math.round(n / max * 100) + '%"></i>' + (w.target ? '<b style="bottom:' + Math.round(w.target / max * 100) + '%"></b>' : "") + '</div><span>' + (i === 0 ? "Today" : dateAgo(i).toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)) + "</span></div>";
    }
    return h + "</div>";
  }
  function heat(w) {
    const wd = WEEKDAY_MON0(dateAgo(0)), span = 28 + wd, total = span + 1;
    let h = '<div class="heat" role="img" aria-label="Days you read over the last five weeks">' + ["M", "T", "W", "T", "F", "S", "S"].map(x => "<b>" + x + "</b>").join(""), read = 0;
    for (let i = span; i >= 0; i--) {
      const n = w.log[daysAgo(i)] || 0, lvl = n <= 0 ? 0 : w.target && n >= w.target ? 2 : 1;
      if (n > 0) read++;
      h += '<i class="l' + lvl + (i === 0 ? " now" : "") + '" title="' + esc(shortDate(dateAgo(i)) + ": " + plural(n, "page", "pages")) + '"></i>';
    }
    return { html: h + "</div>", read, total };
  }
  function juzMap(w, list, i) {
    let h = '<div class="juzmap" role="group" aria-label="Juz map">';
    for (let j = 1; j <= 30; j++) {
      const idx = juzPages(j).map(p => list.indexOf(p)).filter(x => x >= 0);
      const st = !idx.length ? "out" : idx.includes(i) ? "here" : Math.max(...idx) < i ? "done" : "todo";
      const target = idx.length ? list[Math.min(...idx)] : 0;
      h += '<button class="jz ' + st + '" data-jz="' + target + '" ' + (idx.length ? "" : "disabled ") + 'aria-label="Juz ' + j + (st === "here" ? ", you are here" : st === "done" ? ", finished" : st === "todo" ? ", still to come" : ", not in this wird") + '">' + j + "</button>";
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
  function focusSel() {
    const a = document.activeElement;
    if (!a || !root.contains(a) || a === document.body) return null;
    if (a.id) return "#" + a.id;
    for (const k of ["q", "s", "surah", "juz", "pal", "mode", "type", "tab", "dir", "tg", "days", "parts", "open", "new", "jz", "unweak", "pray", "pdir", "poff", "ppages", "pmode", "focus", "run"]) {
      if (a.dataset && a.dataset[k] !== undefined) return "[data-" + k + '="' + a.dataset[k] + '"]' + (k === "s" ? '[data-a="' + a.dataset.a + '"]' : "");
    }
    return null;
  }
  function paint(html, tab) {
    const sel = focusSel(), openIds = [...root.querySelectorAll("details[open]")].map(d => d.id).filter(Boolean);
    root.innerHTML = '<div class="wrap' + (tab ? " has-tabs" : "") + '">' + html + "</div>" + (tab ? nav(tab) : "");
    openIds.forEach(id => { const d = root.querySelector("#" + id); if (d) d.open = true; });
    if (sel) { const el = root.querySelector(sel); if (el && el.focus) try { el.focus({ preventScroll: true }); } catch (e) {} }
  }
  function msg(id, t, ok) { const e = $(id); if (e) { e.textContent = t; e.className = "msg " + (ok ? "ok" : "err"); } }

  // The wird shown on Today and Progress. Remembered per device.
  const FOCUS_KEY = "wird-focus";
  const focusW = () => { let id = ""; try { id = localStorage.getItem(FOCUS_KEY) || ""; } catch (e) {} return find(id) || state.wirds[0] || null; };
  const setFocus = id => { try { localStorage.setItem(FOCUS_KEY, id); } catch (e) {} };
  function switcher(w) {
    if (state.wirds.length < 2) return "";
    return '<div class="switch" role="tablist" aria-label="Your wirds">' + state.wirds.map(x => '<button role="tab" class="sp' + (x === w ? " on" : "") + '" data-focus="' + esc(x.id) + '" aria-selected="' + (x === w) + '">' + esc(x.name) + "</button>").join("") + "</div>";
  }
  function bindSwitch(render) { root.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => { setFocus(b.dataset.focus); render(); }); }
  function finishText(w, left) {
    if (!w.target) return "";
    const d = new Date(); d.setDate(d.getDate() + Math.ceil(left / w.target));
    return shortDate(d);
  }

  // ---------- today ----------
  function home() {
    const w = focusW(), st = streak(state.wirds.map(x => x.log));
    const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    let h = '<header class="top"><div><p class="eyebrow">' + today + '</p><h1 class="title">Today <span class="ar" lang="ar">وِرد</span></h1></div>' +
      (state.wirds.length ? '<div class="streak' + (st ? " on" : "") + '" aria-label="' + plural(st, "day", "days") + ' streak">' + ICON.flame + "<b>" + st + "</b></div>" : "") + "</header>";
    if (!w) {
      h += '<section class="welcome"><div class="wring">' + ring(120, 0.72, "big") + '<span class="ar" lang="ar">وِرد</span></div><h2>Keep your place in every wird</h2><p>Track your page, the ayah you stopped at, and a gentle daily goal.</p>' +
        '<div class="choices">' + typeCard("khatmah", ICON.book, "Khatmah", "Read the whole Qur'an, cover to cover") + typeCard("hifz", ICON.loop, "Hifz revision", "Cycle through what you've memorised") + typeCard("group", ICON.group, "Group khatmah", "Tick off your daily share with a WhatsApp group") + typeCard("custom", ICON.list, "Something else", "Any juz, surahs or pages") + "</div></section>";
      paint(h, "today"); bindHome(null); return;
    }
    if (w.type === "group") { h += switcher(w) + groupHero(w) + nextUpHtml() + weekCard(); if (state.wirds.length < MAX_WIRDS) h += '<button class="addrow" data-new="">' + ICON.plus + "<span>Add a wird</span></button>"; paint(h, "today"); bindHome(w); bindGroup(w); return; }
    const { list, i } = posOf(w), tn = todayN(w), goal = w.target || 0, met = goal && tn >= goal, left = list.length - i;
    const sit = goal && w.parts > 1 ? sittingsDone(goal, w.parts, tn) : -1;
    h += switcher(w);
    h += '<section class="hero' + (met ? " met" : "") + '"><div class="hero-top"><span class="hname">' + esc(w.name) + '</span><span class="hpill">' + esc(w.round) + " " + w.cycle + "</span></div>" +
      '<div class="hring">' + ring(196, goal ? tn / goal : i / list.length, "hero-ring") + '<div class="hnum"><strong>' + (goal ? tn : w.page) + "</strong><span>" + (goal ? "of " + goal + " pages today" : "page") + "</span>" + (met ? '<em class="done-badge">' + ICON.check + "Done</em>" : "") + "</div></div>" +
      (sit >= 0 ? '<div class="dots" aria-label="' + sit + " of " + w.parts + ' sittings done">' + Array.from({ length: w.parts }, (_, k) => '<i class="' + (k < sit ? "on" : "") + '"></i>').join("") + "</div>" : "") +
      '<p class="hpos"><b>Page ' + w.page + "</b> · Juz " + juzOf(w.page) + '</p><p class="hsub">' + esc(posText(w)) + "</p>" +
      '<div class="hquick" role="group" aria-label="Log pages read">' + [1, 2, 5, 10].map(n => '<button class="qb" data-q="' + n + '" aria-label="Log ' + plural(n, "page", "pages") + '">+' + n + "</button>").join("") + "</div>" +
      '<button class="cta" data-open="' + esc(w.id) + '">Open page ' + w.page + "</button></section>";
    h += nextUpHtml();
    h += weekCard();
    const pct = Math.round(i / list.length * 100);
    h += '<section class="card"><div class="card-h"><h2>' + esc(w.round) + " " + w.cycle + '</h2><span class="muted">' + pct + '%</span></div><div class="track"><i style="width:' + pct + '%"></i></div><p class="muted small">' +
      plural(left, "page", "pages") + " to go" + (goal ? " · finishes around " + finishText(w, left) : "") + "</p></section>";
    if (state.wirds.length < MAX_WIRDS) h += '<button class="addrow" data-new="">' + ICON.plus + "<span>Add a wird</span></button>";
    paint(h, "today");
    bindHome(w);
  }
  function weekCard() {
    let week = "", days = 0;
    for (let d = 6; d >= 0; d--) {
      const on = state.wirds.some(x => (x.log[daysAgo(d)] || 0) > 0); if (on) days++;
      week += '<span class="' + (on ? "on" : "") + (d === 0 ? " now" : "") + '"><i>' + (on ? ICON.check : "") + "</i>" + (d === 0 ? "Today" : dateAgo(d).toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)) + "</span>";
    }
    return '<section class="card"><div class="card-h"><h2>This week</h2><span class="muted">' + days + " of 7 days</span></div><div class=\"week\">" + week + "</div></section>";
  }

  // ---------- group khatmah ----------
  // One big tick for today's portion (or everything owed), then one tap to send the tick to the group.
  const span = (a, b) => "Pages " + a + "–" + b;
  const tickedToday = w => w.lastTick && w.lastTick.day === dayKey();
  function groupHero(w) {
    const due = groupDue(w), done = tickedToday(w), size = w.target || 10;
    let h = '<section class="hero group' + (done ? " met" : "") + '"><div class="hero-top"><span class="hname">' + esc(w.name) + '</span><span class="hpill">Khatmah ' + w.cycle + "</span></div>";
    if (done) {
      const t = w.lastTick;
      h += '<div class="gdone"><span class="gcheck">' + ICON.check + '</span><strong>' + span(t.from, t.to) + '</strong><span>done today. Alhamdulillah.</span></div>' +
        '<button class="cta" id="gsend">' + ICON.send + "Send ✅ to the group</button>" + (tickMessage(t.from, t.to, size) !== "✅" ? '<p class="gnext">Sends: ' + esc(tickMessage(t.from, t.to, size)) + "</p>" : "") +
        '<p class="gnext">Next: ' + span(due.from, due.to) + ' · <button class="linkbtn light" id="gahead">read ahead</button></p>';
    } else {
      h += '<p class="glabel">' + (due.behind ? "Catch up with the group" : "Today's portion") + "</p><p class=\"gspan\">" + span(due.from, due.to) + "</p>" +
        '<p class="hsub">' + esc(rangeText(due.from).split(" to ")[0]) + " · Juz " + juzOf(due.from) + (due.behind ? " · " + plural(due.behind, "portion", "portions") + " behind" : "") + "</p>" +
        '<button class="gtick" id="gtick" aria-label="Mark ' + span(due.from, due.to) + ' as read">' + ICON.check + "</button><p class=\"hsub\">Tap when you've read it</p>";
    }
    h += '<div class="gtools">' + (w.role === "organiser" ? '<button class="gbtn" id="gpost">' + ICON.send + "Post next portion</button>" : "") + '<button class="gbtn" id="gpaste">Update from the group</button><a class="gbtn" href="https://quran.com/page/' + due.from + '" target="_blank" rel="noopener">Open page ' + due.from + "</a></div>";
    h += '<div class="gpastebox" id="gbox" hidden><textarea id="gtext" placeholder="Paste the group\'s message, e.g. Khatmah (11) Page (232) to page (241)" aria-label="Group message"></textarea><div class="row"><button class="btn primary" id="gapply">Use this</button></div><p class="msg" id="gmsg" role="status"></p></div>';
    return h + "</section>";
  }
  async function sendText(text) {
    if (opts.share && await opts.share(text)) return true;
    try { if (!opts.share && navigator.share) { await navigator.share({ text }); return true; } } catch (e) { if (e && e.name === "AbortError") return true; }
    try { window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank"); return true; } catch (e) { return false; }
  }
  // Applies a message from the group (pasted, or shared into the app from WhatsApp).
  function applyGroupMessage(w, text) {
    const r = parseGroupMessage(text);
    if (!r) return "No page range found. It should look like Page (232) to page (241).";
    const cyc = r.khatmah || (w.groupCycle || w.cycle);
    w.groupAt = r.from; w.groupCycle = cyc;
    if (r.to - r.from + 1 >= 3 && r.to - r.from + 1 <= 60 && !/✅|✔|☑/.test(String(text))) w.target = r.to - r.from + 1;
    // A member who has not started yet, or is in an older khatmah the group finished, joins where the group is.
    if (absPage(w.cycle, w.page) < absPage(cyc, 1) && r.khatmah && r.khatmah > w.cycle) { w.cycle = r.khatmah; w.page = r.from; }
    touchW(w); save();
    const due = groupDue(w);
    return due.behind ? "Group is on " + span(r.from, r.to) + ". You're " + plural(due.behind, "portion", "portions") + " behind." : "Up to date with the group.";
  }
  function bindGroup(w) {
    const size = w.target || 10;
    if ($("gtick")) $("gtick").onclick = () => {
      const due = groupDue(w), before = JSON.stringify(w), cyc = w.cycle;
      step(w, due.pages);
      w.lastTick = { from: due.from, to: due.to, day: dayKey() };
      touchW(w); save(); vibrate(); home();
      toast(w.cycle > cyc ? "Khatmah " + cyc + " complete. Alhamdulillah!" : "Ticked " + span(due.from, due.to), () => { Object.assign(w, JSON.parse(before)); stampDay(w, dayKey()); touchW(w); save(); home(); });
    };
    if ($("gsend")) $("gsend").onclick = () => sendText(tickMessage(w.lastTick.from, w.lastTick.to, size));
    if ($("gahead")) $("gahead").onclick = () => { w.lastTick = null; touchW(w); save(); home(); };
    if ($("gpost")) $("gpost").onclick = () => {
      const base = w.groupAt ? absPage(w.groupCycle || w.cycle, w.groupAt) + size : absPage(w.cycle, w.page);
      const f = fromAbs(base), to = Math.min(604, f.page + size - 1);
      w.groupAt = f.page; w.groupCycle = f.cycle; touchW(w); save();
      sendText(portionMessage(f.cycle, f.page, to)); home();
    };
    if ($("gpaste")) $("gpaste").onclick = async () => {
      $("gbox").hidden = false;
      try { const t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ""; if (parseGroupMessage(t)) $("gtext").value = t; } catch (e) {}
      $("gtext").focus();
    };
    if ($("gapply")) $("gapply").onclick = () => { const m = applyGroupMessage(w, $("gtext").value); const ok = !/^No page/.test(m); if (ok) { home(); toast(m); } else msg("gmsg", m, 0); };
  }

  function typeCard(type, icon, title, sub) { return '<button class="choice" data-new="' + type + '"><span class="cicon">' + icon + "</span><span><strong>" + title + "</strong><small>" + sub + "</small></span></button>"; }
  function bindHome(w) {
    if (opts.onHome) opts.onHome(null);
    root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => go("new" + (b.dataset.new ? "/" + b.dataset.new : "")));
    if (!w) return;
    bindSwitch(home);
    root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => go("w/" + b.dataset.open));
    root.querySelectorAll("[data-q]").forEach(b => b.onclick = () => {
      const before = JSON.stringify(w), cyc = w.cycle, moved = step(w, +b.dataset.q); vibrate(); home();
      const undo = () => { Object.assign(w, JSON.parse(before)); stampDay(w, dayKey()); touchW(w); save(); home(); };
      if (w.cycle > cyc) toast(w.round + " " + cyc + " complete. Alhamdulillah!", undo); else if (moved) toast("Logged " + plural(moved, "page", "pages") + ". Now on page " + w.page + ".", undo);
    });
  }

  // ---------- progress ----------
  function progress() {
    const w = focusW();
    let h = '<header class="top"><div><p class="eyebrow">Your consistency</p><h1 class="title">Progress</h1></div></header>';
    if (!w) { h += '<section class="card empty"><p>Add a wird to see your progress here.</p><button class="btn primary" data-new="">Add a wird</button></section>'; paint(h, "progress"); root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => go("new")); return; }
    const { list, i } = posOf(w), tn = todayN(w), left = list.length - i, st = streak([w.log]), hm = heat(w), pace = paceDays(w);
    h += switcher(w);
    h += '<section class="stats">' +
      '<div><strong>' + tn + (w.target ? "<small>/" + w.target + "</small>" : "") + "</strong><span>pages today</span></div>" +
      "<div><strong>" + st + "</strong><span>day streak</span></div>" +
      "<div><strong>" + left + "</strong><span>pages to go</span></div>" +
      "<div><strong>" + (w.target ? finishText(w, left) : "–") + "</strong><span>" + (w.target ? (pace >= 1 ? pace + (pace === 1 ? " day" : " days") + " ahead" : pace <= -1 ? -pace + (pace === -1 ? " day" : " days") + " behind" : "on pace") : "set a daily goal") + "</span></div></section>";
    h += '<section class="card"><div class="card-h"><h2>Last 7 days</h2></div>' + bars(w) + "</section>";
    h += '<section class="card"><div class="card-h"><h2>Consistency</h2><span class="muted">' + hm.read + " of " + hm.total + " days</span></div>" + hm.html + "</section>";
    h += '<section class="card"><div class="card-h"><h2>Juz map</h2><span class="muted">' + esc(w.round) + " " + w.cycle + "</span></div>" + juzMap(w, list, i) + '<p class="hint">Tap a juz to move your place to its first page.</p></section>';
    if (w.weak.length) h += '<section class="card"><div class="card-h"><h2>Weak pages</h2><span class="muted">' + w.weak.length + '</span></div><div class="chips">' + w.weak.map(p => '<span class="wk"><a class="chip" href="https://quran.com/page/' + p + '" target="_blank" rel="noopener">p. ' + p + '</a><button class="x" data-unweak="' + p + '" aria-label="Unmark page ' + p + '">×</button></span>').join("") + "</div></section>";
    paint(h, "progress");
    bindSwitch(progress);
    const restore = before => { Object.assign(w, JSON.parse(before)); touchW(w); save(); progress(); };
    root.querySelectorAll("[data-jz]").forEach(b => b.onclick = () => { const p = +b.dataset.jz; if (!p || p === w.page) return; const before = JSON.stringify(w); setPage(w, p); progress(); toast("Moved your place to page " + p, () => restore(before)); });
    root.querySelectorAll("[data-unweak]").forEach(b => b.onclick = () => { w.weak = w.weak.filter(x => x !== +b.dataset.unweak); touchW(w); save(); progress(); });
  }

  // ---------- settings ----------
  function settings(openFold) {
    const t = Object.assign({}, DEFAULT_THEME, state.theme);
    let h = '<header class="top"><div><p class="eyebrow">Wird ' + APP_VERSION + '</p><h1 class="title">Settings</h1></div></header>';
    h += '<section class="card"><div class="card-h"><h2>Your wirds</h2></div><div class="rows">' + state.wirds.map(w => '<a class="row-link" href="#w/' + esc(w.id) + '/edit"><span><strong>' + esc(w.name) + "</strong><small>" + plural(parseRanges(w.ranges).length, "page", "pages") + (w.target ? " · " + w.target + " a day" : "") + "</small></span>" + ICON.edit + "</a>").join("") +
      (state.wirds.length < MAX_WIRDS ? '<button class="row-link add" data-new="">' + ICON.plus + "<span>Add a wird</span></button>" : "") + "</div></section>";
    h += '<section class="card" id="appearance"><div class="card-h"><h2>Appearance</h2></div><div class="swatches">' +
      Object.keys(PAL).map(k => { const c = PAL[k].light, d = PAL[k].dark; return '<button class="sw' + (t.pal === k ? " on" : "") + '" data-pal="' + k + '" aria-pressed="' + (t.pal === k) + '"><span class="dot2"><i style="background:' + c[6] + '"></i><i style="background:' + c[5] + '"></i><i style="background:' + d[0] + '"></i></span>' + PAL[k].name + "</button>"; }).join("") +
      '</div><div class="seg" style="margin-top:12px">' + [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => '<button class="chip' + (t.mode === k ? " on" : "") + '" data-mode="' + k + '" aria-pressed="' + (t.mode === k) + '">' + l + "</button>").join("") + "</div></section>";
    h += prayerFold();
    h += '<details class="card fold" id="fold-backup"><summary><h2>Backup code</h2></summary><p class="muted small">Copy this to keep a backup, or paste one to restore. It is also how you move your wirds to another phone or to the app.</p>' +
      '<div class="row"><button class="btn" id="exp">Show code</button><button class="btn" id="copy" hidden>Copy</button></div>' +
      '<textarea id="bk" spellcheck="false" aria-label="Backup code"></textarea>' +
      '<div class="row"><button class="btn" id="imp">Restore from code</button></div><p class="msg" id="bmsg" role="status"></p></details>' +
      '<p class="foot">Madani mushaf, 604 pages. Page and ayah data checked against alquran.cloud and quran.com.<br>Wird ' + APP_VERSION + "</p>";
    paint(h, "settings");
    if (openFold) { const f = root.querySelector("#" + openFold); if (f) f.open = true; }
    bindPrayer();
    root.querySelectorAll("[data-new]").forEach(b => b.onclick = () => go("new"));
    const again = () => { const y = window.scrollY; settings(); window.scrollTo(0, y); };
    root.querySelectorAll("[data-pal]").forEach(b => b.onclick = () => { state.theme = Object.assign({}, DEFAULT_THEME, state.theme, { pal: b.dataset.pal }); save(); applyTheme(); again(); });
    root.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.theme = Object.assign({}, DEFAULT_THEME, state.theme, { mode: b.dataset.mode }); save(); applyTheme(); again(); });
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
      d.wirds.forEach(w => { w.updatedAt = now; });
      state.wirds.forEach(w => { if (!d.wirds.find(x => x.id === w.id)) { d.deleted[w.id] = now; d.gone = [w, ...d.gone.filter(x => x.id !== w.id)]; } });
      d.theme = d.theme || state.theme;
      if (!raw.prayer) d.prayer = state.prayer;
      state = d; save(); applyTheme(); settings("fold-backup"); msg("bmsg", "Restored " + plural(d.wirds.length, "wird", "wirds") + ".", 1);
    };
  }

  // ---------- add / edit ----------
  let draft = null;
  function newDraft(type) { type = TYPES[type] ? type : "khatmah"; return { id: null, type, name: TYPES[type].name, sel: emptySel(), mode: "juz", dir: 1, target: type === "group" ? 10 : 0, parts: 0, start: "", q: "", khatmah: "1", role: "member" }; }
  function draftFrom(w) {
    const sel = w.type === "khatmah" ? emptySel() : w.sel ? { ...emptySel(), ...JSON.parse(JSON.stringify(w.sel)) } : { ...emptySel(), pages: w.ranges };
    return { khatmah: String(w.cycle), role: w.role || "member", id: w.id, type: w.type, name: w.name, sel, mode: sel.juz.length || (!sel.surah.length && !sel.pages) ? "juz" : sel.surah.length ? "surah" : "pages", dir: w.dir || 1, target: w.target || 0, parts: w.parts || 0, start: w.type === "group" ? String(w.page) : "", q: "" };
  }
  function draftPages() {
    if (draft.type === "khatmah" || draft.type === "group") return parseRanges("1-604");
    const p = selPages(draft.sel);
    return p.length ? p : null;
  }
  function draftRemaining(pages) {
    if (!pages) return 0;
    const w = draft.id ? find(draft.id) : null;
    const from = w ? w.page : parseInt(draft.start, 10) || 0;
    if (!from) return pages.length;
    return Math.max(1, pages.filter(p => (draft.dir === -1 ? p <= from : p >= from)).length);
  }
  function form() {
    const d = draft, editing = !!d.id, pages = draftPages(), picking = d.type !== "khatmah" && d.type !== "group";
    let h = '<header class="bar"><button class="iconbtn" id="back" aria-label="Back">' + ICON.back + '</button><h1>' + (editing ? "Edit wird" : "New wird") + "</h1><span></span></header>";
    h += '<p class="lbl">What kind?</p><div class="types">' + [["khatmah", ICON.book, "Khatmah"], ["group", ICON.group, "Group"], ["hifz", ICON.loop, "Hifz"], ["custom", ICON.list, "Other"]].map(([k, ic, l]) => '<button class="tcard' + (d.type === k ? " on" : "") + '" data-type="' + k + '" aria-pressed="' + (d.type === k) + '">' + ic + "<span>" + l + "</span></button>").join("") + "</div>";
    h += '<label class="lbl" for="fn">Name</label><input type="text" id="fn" maxlength="40" value="' + esc(d.name) + '">';
    if (d.type === "group") {
      h += '<p class="hint">Everyone reads the same portion each day. Tap the tick when you have read yours, then send it to the group.</p>';
      h += '<p class="lbl">Pages each day</p><div class="chips">' + [[5, "5"], [10, "10"], [20, "1 juz"]].map(([v, l]) => '<button class="chip' + (d.target === v ? " on" : "") + '" data-tg="' + v + '">' + l + "</button>").join("") + '</div><div class="row"><input type="number" id="ft" inputmode="numeric" min="1" max="604" value="' + (d.target || "") + '" aria-label="Pages per day"></div>';
      h += '<label class="lbl" for="fs">' + (editing ? "Your next page" : "Where is the group now?") + '</label><input type="number" id="fs" inputmode="numeric" min="1" max="604" value="' + esc(d.start) + '" placeholder="First page of today\'s portion, e.g. 232">';
      h += '<label class="lbl" for="fk">Khatmah number</label><input type="number" id="fk" inputmode="numeric" min="1" max="9999" value="' + esc(d.khatmah || "1") + '">';
      h += '<p class="lbl">Your role</p><div class="seg"><button class="chip' + (d.role !== "organiser" ? " on" : "") + '" data-role="member" aria-pressed="' + (d.role !== "organiser") + '">I tick</button><button class="chip' + (d.role === "organiser" ? " on" : "") + '" data-role="organiser" aria-pressed="' + (d.role === "organiser") + '">I post the portions</button></div>';
      h += '<div class="savebar"><button class="btn primary wide" id="fsave">' + (editing ? "Save changes" : "Join the khatmah") + '</button></div><p class="msg" id="fmsg" role="status"></p>';
      if (editing) h += '<button class="btn danger wide" id="fdel">Delete this wird</button>';
      paint(h); bindForm(editing); return;
    }
    if (!picking) h += '<p class="hint">All 604 pages, Al-Fatihah to An-Nas. The count goes up each time you finish.</p>';
    else {
      h += '<p class="lbl">' + (d.type === "hifz" ? "What have you memorised?" : "What's included?") + '</p><div class="seg">' + [["juz", "Juz"], ["surah", "Surahs"], ["pages", "Pages"]].map(([k, l]) => '<button class="chip' + (d.mode === k ? " on" : "") + '" data-tab="' + k + '" aria-pressed="' + (d.mode === k) + '">' + l + "</button>").join("") + "</div>";
      if (d.mode === "juz") {
        h += '<div class="jgrid" id="jgrid">' + Array.from({ length: 30 }, (_, k) => k + 1).map(j => '<button class="jt' + (d.sel.juz.includes(j) ? " on" : "") + '" data-juz="' + j + '" aria-pressed="' + d.sel.juz.includes(j) + '" aria-label="Juz ' + j + '">' + j + "</button>").join("") + '</div><p class="hint">Tap a juz, or drag across a row of them. Pick as many runs as you like.</p>';
      } else if (d.mode === "surah") {
        h += '<input type="search" id="sq" placeholder="Search surahs" value="' + esc(d.q) + '" aria-label="Search surahs" autocomplete="off"><div class="slist" id="slist">';
        for (let k = 1; k <= 114; k++) { const on = d.sel.surah.includes(k); h += '<button class="srow' + (on ? " on" : "") + '" data-surah="' + k + '" data-name="' + esc((k + " " + nm(k)).toLowerCase()) + '" aria-pressed="' + on + '"><span class="sn">' + k + '</span><span class="st">' + esc(nm(k)) + '<small>' + plural(ayatCount(k), "ayah", "ayat") + '</small></span><span class="sc">' + (on ? ICON.check : "") + "</span></button>"; }
        h += '</div><div class="row"><select id="rf" aria-label="From surah">' + opts2("surah", 1) + '</select><select id="rt" aria-label="To surah">' + opts2("surah", 114) + '</select><button class="btn" id="radd">Add run</button></div>';
      } else {
        h += '<input type="text" id="fr" inputmode="numeric" value="' + esc(d.sel.pages) + '" placeholder="e.g. 1-50, 562-604"><p class="hint">Madani page numbers. Separate ranges with commas.</p>';
      }
      const runs = describeSel(d.sel);
      h += '<div class="picked" aria-live="polite">' + (runs.length ? runs.map(r => '<span class="pk">' + esc(r.label) + '<button class="x" data-run="' + r.kind + ":" + r.from + ":" + r.to + '" aria-label="Remove ' + esc(r.label) + '">×</button></span>').join("") + (runs.length > 1 ? '<button class="linkbtn" id="clr">Clear</button>' : "") : '<span class="muted small">Nothing picked yet</span>') + "</div>";
    }
    h += '<p class="count"><strong id="pcount">' + (pages ? plural(pages.length, "page", "pages") : "Nothing picked yet") + "</strong>" + (pages && pages.length ? "<span>about " + (Math.round(pages.length / 20 * 10) / 10) + " juz</span>" : "") + "</p>";
    const rem = draftRemaining(pages);
    h += '<p class="lbl">Daily goal</p><div class="chips">' + [[2, "2 pages"], [5, "5"], [10, "10"], [20, "1 juz"], [40, "2 juz"]].map(([v, l]) => '<button class="chip' + (d.target === v ? " on" : "") + '" data-tg="' + v + '">' + l + "</button>").join("") + '</div><div class="row"><input type="number" id="ft" inputmode="numeric" min="0" max="604" value="' + (d.target || "") + '" placeholder="Or type pages a day" aria-label="Pages per day"></div>';
    if (rem > 0) h += '<p class="hint">Or finish in</p><div class="chips">' + [7, 14, 30, 60, 90].map(n => '<button class="chip' + (d.target && d.target === targetForDays(rem, n) ? " on" : "") + '" data-days="' + n + '">' + n + " days</button>").join("") + "</div>" + (d.target ? '<p class="hint strong">' + d.target + " a day finishes the " + rem + " pages ahead in " + plural(Math.ceil(rem / d.target), "day", "days") + ".</p>" : "");
    h += '<details class="more" id="more"><summary>More options</summary>';
    h += '<p class="lbl">Direction</p><div class="seg"><button class="chip' + (d.dir === 1 ? " on" : "") + '" data-dir="1" aria-pressed="' + (d.dir === 1) + '">From Al-Fatihah</button><button class="chip' + (d.dir === -1 ? " on" : "") + '" data-dir="-1" aria-pressed="' + (d.dir === -1) + '">From An-Nas</button></div>';
    if (!editing) h += '<label class="lbl" for="fs">Start from page</label><input type="number" id="fs" inputmode="numeric" min="1" max="604" value="' + esc(d.start) + '" placeholder="Leave empty to start at the beginning">';
    h += '<div id="partsec"' + (d.target ? "" : " hidden") + '><p class="lbl">Split each day into sittings</p><div class="seg">' + [[0, "One go"], [2, "2"], [3, "3"], [4, "4"]].map(([v, l]) => '<button class="chip' + ((d.parts || 0) === v ? " on" : "") + '" data-parts="' + v + '" aria-pressed="' + ((d.parts || 0) === v) + '">' + l + "</button>").join("") + '</div><p class="hint">Smaller sittings tied to your day (commute, after Isha) are easier to keep than one long block.</p></div></details>';
    h += '<div class="savebar"><button class="btn primary wide" id="fsave">' + (editing ? "Save changes" : "Create wird") + '</button></div><p class="msg" id="fmsg" role="status"></p>';
    if (editing) h += '<button class="btn danger wide" id="fdel">Delete this wird</button>';
    paint(h);
    bindForm(editing);
  }
  function opts2(by, sel) { const n = by === "juz" ? 30 : 114; let h = ""; for (let k = 1; k <= n; k++) h += '<option value="' + k + '"' + (k === (sel || 1) ? " selected" : "") + ">" + (by === "juz" ? "Juz " + k : k + ". " + esc(nm(k))) + "</option>"; return h; }
  function toggleIn(list, v, on) { const i = list.indexOf(v); if (on && i < 0) list.push(v); if (!on && i >= 0) list.splice(i, 1); list.sort((a, b) => a - b); }
  function bindForm(editing) {
    const d = draft;
    const keep = () => { d.name = $("fn").value; if ($("fk")) d.khatmah = $("fk").value; if ($("fr")) d.sel.pages = $("fr").value; if ($("fs")) d.start = $("fs").value; if ($("sq")) d.q = $("sq").value; d.target = Math.min(PAGES, Math.max(0, parseInt($("ft").value, 10) || 0)); };
    const rerender = () => { const y = window.scrollY, l = root.querySelector(".slist"), ls = l ? l.scrollTop : 0; form(); window.scrollTo(0, y); const l2 = root.querySelector(".slist"); if (l2) l2.scrollTop = ls; };
    $("back").onclick = () => go(editing ? "w/" + d.id : "");
    root.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { keep(); const old = TYPES[d.type].name; d.type = b.dataset.type; if (!d.name || d.name === old) d.name = TYPES[d.type].name; rerender(); });
    root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { keep(); d.mode = b.dataset.tab; rerender(); });
    root.querySelectorAll("[data-surah]").forEach(b => b.onclick = () => { keep(); const k = +b.dataset.surah; toggleIn(d.sel.surah, k, !d.sel.surah.includes(k)); rerender(); });
    root.querySelectorAll("[data-run]").forEach(b => b.onclick = () => {
      keep(); const [kind, a, z] = b.dataset.run.split(":"), from = +a, to = +z;
      if (kind === "pages") d.sel.pages = compress((parseRanges(d.sel.pages) || []).filter(p => p < from || p > to));
      else d.sel[kind] = d.sel[kind].filter(x => x < from || x > to);
      rerender();
    });
    root.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { keep(); d.dir = +b.dataset.dir; rerender(); });
    root.querySelectorAll("[data-tg]").forEach(b => b.onclick = () => { keep(); d.target = +b.dataset.tg; rerender(); });
    root.querySelectorAll("[data-days]").forEach(b => b.onclick = () => { keep(); d.target = targetForDays(draftRemaining(draftPages()), +b.dataset.days); rerender(); });
    root.querySelectorAll("[data-parts]").forEach(b => b.onclick = () => { keep(); d.parts = +b.dataset.parts; rerender(); });
    if ($("radd")) $("radd").onclick = () => { keep(); let a = +$("rf").value, b = +$("rt").value; if (a > b) [a, b] = [b, a]; for (let k = a; k <= b; k++) toggleIn(d.sel.surah, k, true); rerender(); };
    if ($("clr")) $("clr").onclick = () => { keep(); d.sel = emptySel(); rerender(); };
    if ($("sq")) $("sq").oninput = () => { d.q = $("sq").value; const q = d.q.trim().toLowerCase(); root.querySelectorAll(".srow").forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); }); };
    if ($("sq") && d.q) $("sq").oninput();
    if ($("fr")) $("fr").oninput = () => { d.sel.pages = $("fr").value; const p = draftPages(); $("pcount").textContent = parseRanges(d.sel.pages) || !d.sel.pages.trim() ? (p ? plural(p.length, "page", "pages") : "Nothing picked yet") : "Check the page ranges"; };
    if ($("fr")) $("fr").onchange = () => { const p = parseRanges($("fr").value); if (p) { d.sel.pages = compress(p); rerender(); } };
    $("ft").oninput = () => { const n = parseInt($("ft").value, 10) || 0; if ($("partsec")) $("partsec").hidden = n <= 0; };
    root.querySelectorAll("[data-role]").forEach(b => b.onclick = () => { keep(); d.role = b.dataset.role; rerender(); });
    bindJuzGrid(keep, rerender);
    $("fsave").onclick = () => {
      keep();
      if (d.type === "group") return saveGroup(editing);
      if (d.type !== "khatmah" && d.sel.pages.trim() && !parseRanges(d.sel.pages)) { msg("fmsg", "Enter page ranges between 1 and 604, like 1-50, 562-604.", 0); return; }
      const p = draftPages();
      if (!p || !p.length) { msg("fmsg", "Pick at least one juz, surah or page range.", 0); return; }
      const ranges = compress(p), name = d.name.replace(/\s+/g, " ").trim().slice(0, 40) || TYPES[d.type].name, parts = d.target ? d.parts || 0 : 0;
      const sel = d.type === "khatmah" ? null : { juz: d.sel.juz, surah: d.sel.surah, pages: parseRanges(d.sel.pages) ? compress(parseRanges(d.sel.pages)) : "" };
      if (editing) {
        const w = find(d.id);
        Object.assign(w, { name, type: d.type, round: TYPES[d.type].round, ranges, sel, dir: d.dir, target: d.target, parts });
        w.weak = w.weak.filter(x => p.includes(x));
        if (!p.includes(w.page)) { const l = pagesOf(w); w.page = l.find(x => d.dir === 1 ? x > w.page : x < w.page) || l[0]; w.ayah = null; }
        touchW(w); save(); go("w/" + w.id);
      } else {
        if (state.wirds.length >= MAX_WIRDS) { msg("fmsg", "That's the most wirds you can keep (" + MAX_WIRDS + "). Delete one first.", 0); return; }
        const list = d.dir === -1 ? p.slice().reverse() : p;
        let start = list[0];
        const s = parseInt(d.start, 10);
        if (d.start !== "" && !(s >= 1 && s <= PAGES)) { msg("fmsg", "Pages run from 1 to 604.", 0); const m = $("more"); if (m) m.open = true; return; }
        if (s) start = p.includes(s) ? s : (list.find(x => d.dir === 1 ? x > s : x < s) || list[0]);
        const w = cleanWird({ id: Math.random().toString(36).slice(2, 10), name, type: d.type, ranges, sel, dir: d.dir, target: d.target, parts, page: start, cycle: 1, log: {}, createdAt: Date.now(), updatedAt: Date.now() });
        state.wirds.push(w); setFocus(w.id); save(); go("w/" + w.id);
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
  function saveGroup(editing) {
    const d = draft, s = parseInt(d.start, 10), k = parseInt(d.khatmah, 10) || 1, size = Math.max(1, Math.min(PAGES, d.target || 10));
    if (d.start !== "" && !(s >= 1 && s <= PAGES)) { msg("fmsg", "Pages run from 1 to 604.", 0); return; }
    const name = d.name.replace(/\s+/g, " ").trim().slice(0, 40) || TYPES.group.name;
    if (editing) {
      const w = find(d.id);
      Object.assign(w, { name, type: "group", round: "Khatmah", ranges: "1-604", sel: null, target: size, parts: 0, role: d.role, cycle: Math.min(9999, Math.max(1, k)) });
      if (s) { w.page = s; w.ayah = null; }
      touchW(w); save(); go("");
      return;
    }
    if (state.wirds.length >= MAX_WIRDS) { msg("fmsg", "That's the most wirds you can keep (" + MAX_WIRDS + "). Delete one first.", 0); return; }
    const w = cleanWird({ id: Math.random().toString(36).slice(2, 10), name, type: "group", ranges: "1-604", target: size, page: s || 1, cycle: k, role: d.role, groupAt: s || 0, groupCycle: k, log: {}, createdAt: Date.now(), updatedAt: Date.now() });
    state.wirds.push(w); setFocus(w.id); save(); go("");
  }
  // Tap toggles a juz. Pressing and dragging across tiles sets the whole run to the state of the first tile.
  function bindJuzGrid(keep, rerender) {
    const grid = $("jgrid"); if (!grid) return;
    const d = draft;
    let anchor = 0, mode = true, moved = false, lastJ = 0;
    const tileAt = (x, y) => { const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null; const t = el && el.closest ? el.closest("[data-juz]") : null; return t && grid.contains(t) ? +t.dataset.juz : 0; };
    const paintRun = j => { const a = Math.min(anchor, j), b = Math.max(anchor, j); grid.querySelectorAll("[data-juz]").forEach(t => { const k = +t.dataset.juz; t.classList.toggle("live", k >= a && k <= b); t.classList.toggle("on", k >= a && k <= b ? mode : d.sel.juz.includes(k)); }); };
    grid.addEventListener("pointerdown", e => { const t = e.target.closest("[data-juz]"); if (!t) return; anchor = lastJ = +t.dataset.juz; mode = !d.sel.juz.includes(anchor); moved = false; try { grid.setPointerCapture(e.pointerId); } catch (x) {} });
    grid.addEventListener("pointermove", e => { if (!anchor) return; const j = tileAt(e.clientX, e.clientY); if (j && j !== lastJ) { lastJ = j; moved = true; paintRun(j); e.preventDefault(); } });
    const end = () => { if (!anchor) return; if (moved) { keep(); const a = Math.min(anchor, lastJ), b = Math.max(anchor, lastJ); for (let k = a; k <= b; k++) toggleIn(d.sel.juz, k, mode); vibrate(); rerender(); } anchor = 0; };
    grid.addEventListener("pointerup", end);
    grid.addEventListener("pointercancel", () => { anchor = 0; rerender(); });
    grid.querySelectorAll("[data-juz]").forEach(b => b.onclick = () => { if (moved) { moved = false; return; } keep(); const k = +b.dataset.juz; toggleIn(d.sel.juz, k, !d.sel.juz.includes(k)); rerender(); });
  }

  // ---------- reading screen ----------
  function shareText(w) {
    const { list, i } = posOf(w), tn = todayN(w), st = streak([w.log]);
    return w.name + ": page " + w.page + " (Juz " + juzOf(w.page) + "), " + (i + 1) + " of " + list.length + ". " + plural(tn, "page", "pages") + " today" + (st ? ", " + st + "-day streak" : "") + ".";
  }
  function detail(w) {
    const { list, i } = posOf(w), fwd = w.dir !== -1, tn = todayN(w), goal = w.target || 0;
    const weakHere = w.weak.includes(w.page), parts = goal && w.parts > 1 ? w.parts : 0, done = parts ? sittingsDone(goal, parts, tn) : 0;
    let h = '<header class="bar"><button class="iconbtn" id="back" aria-label="Back to today">' + ICON.back + '</button><h1>' + esc(w.name) + '</h1><button class="iconbtn" id="edit" aria-label="Edit this wird">' + ICON.edit + "</button></header>";
    h += '<p class="rsub">' + esc(w.round) + " " + w.cycle + " · " + (i + 1) + " of " + list.length + (goal ? " · " + tn + "/" + goal + " today" : tn ? " · " + tn + " today" : "") + "</p>";
    h += '<div class="dial"><button class="step" id="prev" aria-label="Back one page">' + (fwd ? "−" : "+") + '</button>' +
      '<div class="medal">' + ring(210, goal ? tn / goal : i / list.length, "big") + '<div class="mnum"><small>Page</small><input id="pg" type="number" inputmode="numeric" min="1" max="604" value="' + w.page + '" aria-label="Page number"><small>Juz ' + juzOf(w.page) + "</small></div></div>" +
      '<button class="step" id="next" aria-label="Forward one page">' + (fwd ? "+" : "−") + "</button></div>" +
      '<p class="where">' + esc(posText(w)) + "</p>" + (w.ayah ? '<p class="sub">Page ' + w.page + ": " + esc(rangeText(w.page)) + "</p>" : "") + '<p class="msg center" id="pmsg" role="status"></p>' +
      '<div class="quick">' + [2, 5, 10, 20].map(n => '<button class="chip" data-q="' + n + '">+' + n + "</button>").join("") + "</div>";
    if (parts) {
      const per = goal / parts, need = Math.max(1, Math.ceil(per * (done + 1) - tn - 1e-9));
      h += '<section class="sit"><div class="dots big" aria-label="' + done + " of " + parts + ' sittings done">' + Array.from({ length: parts }, (_, k) => '<i class="' + (k < done ? "on" : "") + '"><b>' + (k + 1) + "</b></i>").join("") + "</div>" +
        '<p class="hint center">' + (done >= parts ? "Every sitting done today. Alhamdulillah." : "Sitting " + (done + 1) + " of " + parts + ": " + plural(need, "more page", "more pages")) + "</p></section>";
    }
    h += '<div class="actions"><button class="act flag' + (weakHere ? " on" : "") + '" id="weak" aria-label="Mark this page as weak" aria-pressed="' + weakHere + '">' + ICON.flag + "<span>" + (weakHere ? "Weak" : "Mark weak") + '</span></button><a class="act" href="https://quran.com/page/' + w.page + '" target="_blank" rel="noopener">' + ICON.ext + '<span>Open page</span></a><button class="act" id="share">' + ICON.share + "<span>Share</span></button></div>";
    h += '<details class="card fold" id="stop"' + (w.ayah ? "" : "") + '><summary><h2>Where did you stop?</h2><span class="muted small">' + (w.ayah ? esc(nm(w.ayah[0]) + " " + w.ayah[1]) : "Optional") + "</span></summary>";
    ayatOnPage(w.page).forEach(g => {
      h += '<div class="group"><p>' + esc(nm(g.s)) + '</p><div class="chips">';
      for (let a = g.from; a <= g.to; a++) { const on = w.ayah && w.ayah[0] === g.s && w.ayah[1] === a; h += '<button class="chip ay' + (on ? " on" : "") + '" data-s="' + g.s + '" data-a="' + a + '" aria-pressed="' + on + '">' + a + "</button>"; }
      h += "</div></div>";
    });
    h += '<p class="hint">Tap again to clear.</p></details>' +
      '<details class="card fold" id="jump"><summary><h2>Jump to an ayah</h2></summary><div class="row"><select id="js" aria-label="Surah">' + opts2("surah", w.ayah ? w.ayah[0] : ayatOnPage(w.page)[0].s) +
      '</select><input id="ja" type="number" inputmode="numeric" min="1" placeholder="Ayah" aria-label="Ayah" class="ayin"><button class="btn primary" id="jgo">Go</button></div><p class="msg" id="jmsg" role="status"></p></details>';
    paint(h);
    const restore = before => { Object.assign(w, JSON.parse(before)); stampDay(w, dayKey()); touchW(w); save(); detail(w); };
    const doStep = n => {
      const before = JSON.stringify(w), cyc = w.cycle, moved = step(w, n); vibrate(); detail(w);
      if (n > 0 && w.cycle > cyc) toast(w.round + " " + cyc + " complete. Alhamdulillah!", () => restore(before));
      else if (Math.abs(n) > 1 && moved) toast("Moved " + Math.abs(moved) + " pages to p. " + w.page, () => restore(before));
    };
    $("back").onclick = () => go("");
    $("edit").onclick = () => go("w/" + w.id + "/edit");
    $("prev").onclick = () => doStep(-1);
    $("next").onclick = () => doStep(1);
    root.querySelectorAll("[data-q]").forEach(b => b.onclick = () => doStep(+b.dataset.q));
    $("weak").onclick = () => { w.weak = weakHere ? w.weak.filter(x => x !== w.page) : [...w.weak, w.page].sort((a, b) => a - b); touchW(w); save(); vibrate(); detail(w); };
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
    else if ((m = hsh.match(/^#w\/([a-z0-9]+)/)) && (w = find(m[1]))) { draft = null; setFocus(w.id); current = "detail:" + w.id; detail(w); }
    else if (hsh === "#progress") { draft = null; current = "progress"; progress(); }
    else if (hsh === "#settings") { draft = null; current = "settings"; settings(); }
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
    if (current === "home") home(); else if (current === "progress") progress(); else if (current === "settings") settings();
    else if (current.startsWith("detail:")) { const w = find(current.slice(7)); if (w) detail(w); else go(""); }
    window.scrollTo(0, y);
  }
  // A message shared into the app (e.g. the group's daily post, long-pressed in WhatsApp > Share > Wird).
  function receiveShared(text) {
    const groups = state.wirds.filter(x => x.type === "group");
    if (!groups.length || !parseGroupMessage(text)) return false;
    const w = groups.find(x => x.id === (focusW() || {}).id) || groups[0];
    setFocus(w.id);
    const m = applyGroupMessage(w, text);
    go(""); home(); toast(m);
    return true;
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
    receiveShared,
    refreshHome() { if (current === "home") { const y = window.scrollY; home(); window.scrollTo(0, y); } },
    destroy() { clearInterval(ticker); clearInterval(topUp); if (!notifier.reliable) Promise.resolve(notifier.sync([])).catch(() => {}); window.removeEventListener("hashchange", route); window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis); }
  };
}
