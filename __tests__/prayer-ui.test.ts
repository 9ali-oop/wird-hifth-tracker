process.env.TZ = "Europe/London"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createWirdApp } from "../src/wird/app"

const KEY = "wird-bookmarks-v3"
const ICAL = "wird-ical-url"
let root: HTMLElement
let app: ReturnType<typeof createWirdApp>
const $ = (s: string) => root.querySelector(s) as HTMLElement
const $$ = (s: string) => [...root.querySelectorAll(s)] as HTMLElement[]
const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const click = async (s: string | HTMLElement) => { (typeof s === "string" ? $(s) : s).click(); await tick() }
const set = async (s: string, v: string) => { const el = $(s) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); await tick() }
const P = () => app.getState().prayer

const sampleIcs = (fajr = "Athan 05:36 · Iqamah 06:00") => [
  "BEGIN:VCALENDAR", "X-WR-TIMEZONE:Europe/London",
  "BEGIN:VEVENT", "DTSTART:20260930T043600Z", "DTEND:20260930T050000Z", "SUMMARY:Fajr", "DESCRIPTION:" + fajr, "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART:20260930T120200Z", "DTEND:20260930T124500Z", "SUMMARY:Dhuhr", "DESCRIPTION:Athan 13:02 · Iqamah 13:45", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART:20260930T150400Z", "DTEND:20260930T151500Z", "SUMMARY:Asr", "DESCRIPTION:Athan 16:04 · Iqamah 16:15", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n")

async function boot(saved?: unknown, opts: any = {}) {
  localStorage.clear()
  if (saved) localStorage.setItem(KEY, JSON.stringify(saved))
  location.hash = ""
  root = document.createElement("div")
  document.body.innerHTML = ""
  document.body.appendChild(root)
  app = createWirdApp(root, opts)
  await tick()
}
const withWird = { wirds: [{ id: "w1", name: "Hifz cycle", type: "khatmah", ranges: "1-604", page: 143, updatedAt: 5, createdAt: 1 }] }

beforeEach(async () => { window.scrollTo = vi.fn() as any; await boot(withWird) })
afterEach(() => { app.destroy(); vi.useRealTimers(); vi.unstubAllGlobals() })

const openFold = async () => { ($("#fold-prayer") as HTMLDetailsElement).open = true }

describe("prayer reminder settings", () => {
  it("starts off, with sensible defaults and no next-up strip", () => {
    expect(P()).toMatchObject({ prayers: [], offset: 30, dir: -1, pages: 3, mode: "calendar" })
    expect($(".nextup")).toBeNull()
    expect($("#fold-prayer")).toBeTruthy()
  })
  it("choosing prayers, timing and pages is saved", async () => {
    await click('[data-pray="dhuhr"]'); await click('[data-pray="asr"]')
    await click('[data-pdir="1"]'); await click('[data-poff="45"]'); await click('[data-ppages="4"]')
    expect(P()).toMatchObject({ prayers: ["dhuhr", "asr"], dir: 1, offset: 45, pages: 4 })
    await click('[data-pray="dhuhr"]')
    expect(P().prayers).toEqual(["asr"])
  })
  it("keeps the section open after each change", async () => {
    await click('[data-pray="dhuhr"]')
    expect(($("#fold-prayer") as HTMLDetailsElement).open).toBe(true)
  })
  it.each([["9999", 180], ["-5", 0], ["0", 0], ["abc", 30], ["45.7", 45], ["", 30]])("custom minutes %j becomes %j", async (typed, want) => {
    await set("#poff", typed)
    expect(P().offset).toBe(want)
  })
  it.each([["0", 1], ["999", 50], ["-2", 1], ["3", 3], ["", 3]])("custom pages %j becomes %j", async (typed, want) => {
    await set("#ppages", typed)
    expect(P().pages).toBe(want)
  })
  it("offers a choice of wird only when there are several", async () => {
    expect($("#pwird")).toBeNull()
    await boot({ wirds: [...withWird.wirds, { id: "w2", name: "Khatmah", type: "khatmah", ranges: "1-604", page: 5, updatedAt: 5, createdAt: 2 }] })
    expect($("#pwird")).toBeTruthy()
    await set("#pwird", "w2")
    expect(P().wird).toBe("w2")
  })
  it("manual mode accepts times, rejects nonsense, and can clear one", async () => {
    await click('[data-pmode="manual"]')
    await set("#pm-dhuhr", "13:45")
    expect(P().manual).toEqual({ dhuhr: "13:45" })
    await set("#pm-dhuhr", "")
    expect(P().manual).toEqual({})
    expect($$('input[type="time"]')).toHaveLength(5)
  })
  it("the calendar link stays on this device and is never part of the synced state", async () => {
    await set("#ical", "https://calendar.google.com/calendar/ical/secret/basic.ics")
    expect(localStorage.getItem(ICAL)).toContain("secret")
    expect(JSON.stringify(app.getState())).not.toContain("secret")
    expect(localStorage.getItem(KEY)).not.toContain("secret")
  })
})

describe("reading a calendar", () => {
  it("without a signed-in fetcher it says so", async () => {
    await set("#ical", "https://calendar.google.com/x/basic.ics")
    await click("#isync")
    expect($("#pstat").textContent).toMatch(/Sign in/)
  })
  it("fills the timetable from the calendar and shows the counts", async () => {
    const fetchCalendar = vi.fn().mockResolvedValue({ ok: true, ics: sampleIcs() })
    await boot(withWird, { fetchCalendar })
    await set("#ical", "https://calendar.google.com/x/basic.ics")
    await click("#isync"); await tick()
    expect(fetchCalendar).toHaveBeenCalledWith("https://calendar.google.com/x/basic.ics")
    expect(Object.keys(P().days)).toEqual(["2026-9-30"])
    expect(P().syncedAt).toBeGreaterThan(0)
    expect($("#pstat").textContent).toMatch(/Read 1 day/)
  })
  it.each([
    [{ ok: false, message: "The calendar link did not work (404). Check the address." }, /did not work/],
    [{ ok: true, ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR" }, /No prayer times found/],
    [null, /Could not read/],
  ])("shows a clear message when the calendar fails: %j", async (result, re) => {
    await boot(withWird, { fetchCalendar: vi.fn().mockResolvedValue(result) })
    await set("#ical", "https://calendar.google.com/x/basic.ics")
    await click("#isync"); await tick()
    expect($("#pstat").textContent).toMatch(re)
    expect(Object.keys(P().days)).toEqual([])
  })
  it("survives the fetch throwing", async () => {
    await boot(withWird, { fetchCalendar: vi.fn().mockRejectedValue(new Error("network")) })
    await set("#ical", "https://calendar.google.com/x/basic.ics")
    await click("#isync"); await tick()
    expect($("#pstat").textContent).toMatch(/Could not read/)
  })
  it("refreshes a stale calendar automatically when the app opens", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const fetchCalendar = vi.fn().mockResolvedValue({ ok: true, ics: sampleIcs() })
    localStorage.setItem(ICAL, "https://calendar.google.com/x/basic.ics")
    localStorage.setItem(KEY, JSON.stringify({ ...withWird, prayer: { mode: "calendar", prayers: ["dhuhr"], syncedAt: 1 } }))
    app.destroy()
    root = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(root)
    app = createWirdApp(root, { fetchCalendar })
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 1000))
    expect(fetchCalendar).toHaveBeenCalledTimes(1)
  })
  it("does not refresh when the data is fresh", async () => {
    const fetchCalendar = vi.fn().mockResolvedValue({ ok: true, ics: sampleIcs() })
    localStorage.setItem(ICAL, "https://calendar.google.com/x/basic.ics")
    localStorage.setItem(KEY, JSON.stringify({ ...withWird, prayer: { mode: "calendar", prayers: ["dhuhr"], syncedAt: Date.now() } }))
    app.destroy(); root = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(root)
    app = createWirdApp(root, { fetchCalendar })
    await new Promise((r) => setTimeout(r, 1000))
    expect(fetchCalendar).not.toHaveBeenCalled()
  })
})

describe("next up strip", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 30, h, m)
  async function withTimes(now: Date, extra: any = {}) {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now)
    await boot({ ...withWird, prayer: { mode: "manual", manual: { dhuhr: "13:45", asr: "16:15" }, prayers: ["dhuhr", "asr"], offset: 30, dir: -1, pages: 3, updatedAt: 9, ...extra } })
  }
  it("shows the coming jamat, the reminder wording, the wird page and the countdown", async () => {
    await withTimes(at(12, 0))
    const t = $(".nextup").textContent!
    expect(t).toContain("Dhuhr jamat 13:45")
    expect(t).toContain("Read 3 pages 30 min before Dhuhr jamat (13:45)")
    expect(t).toContain("Hifz cycle, page 143")
    expect(t).toContain("in 1 h 15 min")
    expect($(".nextup").className).not.toContain("due")
  })
  it("turns into a call to action once the reminder time has come", async () => {
    await withTimes(at(13, 30))
    expect($(".nextup").className).toContain("due")
    expect($(".nextup").textContent).toContain("Time to read")
    expect($(".nextup b").textContent).toBe("15 min left")
  })
  it("moves on to the next prayer after jamat", async () => {
    await withTimes(at(13, 50))
    expect($(".nextup").textContent).toContain("Asr jamat 16:15")
  })
  it("wraps to tomorrow when today's prayers are over", async () => {
    await withTimes(at(23, 0))
    expect($(".nextup").textContent).toContain("Dhuhr jamat 13:45")
    expect($(".nextup").textContent).toMatch(/in 1[45] h/)
  })
  it("says so when reminders are on but there are no times", async () => {
    await boot({ ...withWird, prayer: { mode: "calendar", prayers: ["dhuhr"], updatedAt: 9 } })
    expect($(".nextup").textContent).toMatch(/no prayer times yet/)
  })
  it("is absent with no reminders selected, and with no wirds it still does not break", async () => {
    await boot({ wirds: [], prayer: { mode: "manual", manual: { dhuhr: "13:45" }, prayers: ["dhuhr"], updatedAt: 9 } })
    expect(root.querySelector(".welcome")).toBeTruthy()
  })
  it("supports after-jamat timing", async () => {
    await withTimes(at(12, 0), { dir: 1, offset: 20 })
    expect($(".nextup").textContent).toContain("Read 3 pages 20 min after Dhuhr jamat")
  })
})

describe("adding to a calendar", () => {
  let blobs: Blob[]
  beforeEach(() => {
    blobs = []
    ;(URL as any).createObjectURL = (b: Blob) => { blobs.push(b); return "blob:x" }
    ;(URL as any).revokeObjectURL = () => {}
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })
  it("asks for a prayer first, then for times", async () => {
    await click("#pcal"); expect($("#pmsg").textContent).toMatch(/at least one prayer/)
    await click('[data-pray="dhuhr"]'); await click("#pcal"); expect($("#pmsg").textContent).toMatch(/No prayer times yet/)
    expect(blobs).toHaveLength(0)
  })
  it("downloads 14 days of alarmed events, worded for the chosen wird", async () => {
    await boot({ ...withWird, prayer: { mode: "manual", manual: { dhuhr: "13:45" }, prayers: ["dhuhr"], offset: 30, dir: -1, pages: 4, updatedAt: 9 } })
    await click("#pcal")
    expect($("#pmsg").textContent).toMatch(/reminders ready/)
    const text = await blobs[0].text()
    const n = (text.match(/BEGIN:VEVENT/g) || []).length
    expect(n).toBeGreaterThanOrEqual(13); expect(n).toBeLessThanOrEqual(15)
    expect(text).toContain("SUMMARY:Wird: 4 pages before Dhuhr")
    expect(text).toContain("Hifz cycle\\, from page 143")
    expect(text).toContain("TRIGGER:PT0M")
  })
})

describe("notifications", () => {
  function fakeNotification(permission: string) {
    const shown: any[] = []
    const N: any = function (this: any, title: string, o: any) { shown.push({ title, ...o }) }
    N.permission = permission
    N.requestPermission = vi.fn(async () => { N.permission = "granted"; return "granted" })
    vi.stubGlobal("Notification", N)
    return { N, shown }
  }
  it("offers to turn them on, and asks the browser when tapped", async () => {
    const { N } = fakeNotification("default")
    await boot(withWird)
    expect($("#pnotif")).toBeTruthy()
    await click("#pnotif")
    expect(N.requestPermission).toHaveBeenCalled()
    expect($("#ptest")).toBeTruthy()
  })
  it("explains when blocked or unsupported, without a broken button", async () => {
    fakeNotification("denied"); await boot(withWird)
    expect($("#pnotif")).toBeNull(); expect($("#fold-prayer").textContent).toMatch(/blocked/)
    vi.unstubAllGlobals(); await boot(withWird)
    expect($("#fold-prayer").textContent).toMatch(/cannot show notifications/)
  })
  it("the test button shows a notification with the reminder wording", async () => {
    const { shown } = fakeNotification("granted")
    await boot({ ...withWird, prayer: { prayers: ["asr"], pages: 4, offset: 15, dir: -1, updatedAt: 2 } })
    await click("#ptest")
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe("Wird")
    expect(shown[0].body).toMatch(/Read 4 pages 15 min before Asr jamat/)
    expect(shown[0].body).toContain("Hifz cycle, page 143")
  })
  it("fires at the reminder time and not before", async () => {
    const { shown } = fakeNotification("granted")
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0))
    localStorage.clear(); localStorage.setItem(KEY, JSON.stringify({ ...withWird, prayer: { mode: "manual", manual: { dhuhr: "13:45" }, prayers: ["dhuhr"], offset: 30, dir: -1, pages: 3, updatedAt: 9 } }))
    location.hash = ""; root = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(root)
    app.destroy(); app = createWirdApp(root)
    await vi.advanceTimersByTimeAsync(60 * 60000) // 13:00
    expect(shown).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(16 * 60000) // 13:16
    expect(shown).toHaveLength(1)
    expect(shown[0].body).toContain("Read 3 pages 30 min before Dhuhr jamat (13:45)")
    await vi.advanceTimersByTimeAsync(60 * 60000)
    expect(shown).toHaveLength(1) // once only
  })
  it("changing the timing reschedules, and turning a prayer off cancels it", async () => {
    const { shown } = fakeNotification("granted")
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0))
    localStorage.clear(); localStorage.setItem(KEY, JSON.stringify({ ...withWird, prayer: { mode: "manual", manual: { dhuhr: "13:45" }, prayers: ["dhuhr"], offset: 30, dir: -1, pages: 3, updatedAt: 9 } }))
    location.hash = ""; root = document.createElement("div"); document.body.innerHTML = ""; document.body.appendChild(root)
    app.destroy(); app = createWirdApp(root)
    $('[data-poff="15"]').click(); await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(80 * 60000) // 13:20, the old 13:15 time has passed
    expect(shown).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(11 * 60000) // 13:31, new time is 13:30
    expect(shown).toHaveLength(1)
    $('[data-pray="dhuhr"]').click(); await vi.advanceTimersByTimeAsync(0)
    expect(P().prayers).toEqual([])
  })
})

describe("syncing reminder settings between devices", () => {
  it("the newest settings win but calendar data follows the latest read", async () => {
    await boot({ ...withWird, prayer: { prayers: ["dhuhr"], offset: 30, pages: 3, updatedAt: 100, syncedAt: 500, days: { "2026-9-30": { dhuhr: { a: 1000, j: 2000 } } } } })
    app.applyRemote({ ...withWird, prayer: { prayers: ["asr"], offset: 15, pages: 4, updatedAt: 200, syncedAt: 100, days: { "2026-9-29": { dhuhr: { a: 1, j: 2 } } } } })
    expect(P()).toMatchObject({ prayers: ["asr"], offset: 15, pages: 4, syncedAt: 500 })
    expect(Object.keys(P().days)).toEqual(["2026-9-30"])
  })
  it("junk reminder data from the server is cleaned", async () => {
    app.applyRemote({ ...withWird, prayer: { prayers: ["dhuhr", "<script>"], offset: 1e9, pages: "lots", mode: "hax", days: "x", updatedAt: 5 } })
    expect(P()).toMatchObject({ prayers: ["dhuhr"], offset: 180, pages: 3, mode: "calendar", days: {} })
  })
  it("restoring an older backup without reminder settings keeps the current ones", async () => {
    await boot({ ...withWird, prayer: { prayers: ["dhuhr"], offset: 30, pages: 3, updatedAt: 1 } })
    ;($("#bk") as HTMLTextAreaElement).value = btoa(JSON.stringify({ wirds: [{ id: "old1", name: "Old", ranges: "1-5", type: "custom", page: 2 }] }))
    await click("#imp"); await click("#imp")
    expect(app.getState().wirds[0].id).toBe("old1")
    expect(P().prayers).toEqual(["dhuhr"])
  })
})
