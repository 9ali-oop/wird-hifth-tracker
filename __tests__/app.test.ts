import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createWirdApp } from "../src/wird/app"
import { dayKey } from "../src/wird/core"

const KEY = "wird-bookmarks-v3"
let root: HTMLElement
let app: ReturnType<typeof createWirdApp>

const $ = (sel: string) => root.querySelector(sel) as HTMLElement
const $$ = (sel: string) => [...root.querySelectorAll(sel)] as HTMLElement[]
// The app navigates by setting location.hash, whose event fires asynchronously, so every action waits a tick.
const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const click = async (sel: string | HTMLElement) => { (typeof sel === "string" ? $(sel) : sel).click(); await tick() }
const type = async (sel: string, v: string) => { const el = $(sel) as HTMLInputElement; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); await tick() }
const go = async (hash: string) => { location.hash = hash; await tick() }
const state = () => JSON.parse(localStorage.getItem(KEY) || "null")
const only = () => app.getState().wirds[0]

async function boot(saved?: unknown) {
  localStorage.clear()
  if (saved) localStorage.setItem(KEY, JSON.stringify(saved))
  location.hash = ""
  root = document.createElement("div")
  document.body.innerHTML = ""
  document.body.appendChild(root)
  app = createWirdApp(root)
  await tick() // let a hashchange left over from the previous test fire before the test starts
}
async function makeKhatmah(start = "") {
  await go("#new/khatmah")
  if (start) await type("#fs", start)
  await click("#fsave")
}

beforeEach(async () => {
  window.scrollTo = vi.fn() as any
  await boot()
})
afterEach(() => { app.destroy(); vi.useRealTimers() })

describe("first run", () => {
  it("shows a welcome screen with no wirds and no baked-in defaults", async () => {
    expect($(".welcome")).toBeTruthy()
    expect(app.getState().wirds).toEqual([])
    expect($$(".hero")).toHaveLength(0)
    expect(root.textContent).not.toMatch(/562|248/)
  })
  it("offers the three wird types", async () => {
    expect($$(".choice").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Khatmah"), expect.stringContaining("Hifz revision"), expect.stringContaining("Something else"),
    ])
  })
})

describe("creating wirds", () => {
  it("creates a khatmah from page 1 by default", async () => {
    await makeKhatmah()
    expect(location.hash).toMatch(/^#w\//)
    expect(only()).toMatchObject({ type: "khatmah", round: "Khatmah", ranges: "1-604", page: 1, cycle: 1 })
  })
  it("starts at the page you give, and snaps into the range when it is outside it", async () => {
    await makeKhatmah("300")
    expect(only().page).toBe(300)
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "10-20"); await type("#fs", "5"); await click("#fsave")
    expect(app.getState().wirds[1].page).toBe(10)
  })
  it.each(["0", "605", "-3", "abc"])("rejects starting page %j", async (bad) => {
    await go("#new/khatmah")
    await type("#fs", bad)
    await click("#fsave")
    if (bad === "abc") { expect(app.getState().wirds).toHaveLength(1); return } // number input drops non-numeric text: treated as empty
    expect($("#fmsg").textContent).toMatch(/1 to 604/)
    expect(app.getState().wirds).toHaveLength(0)
  })
  it("hifz by surah: picks pages and counts them", async () => {
    await go("#new/hifz")
    expect($("#pcount").textContent).toBe("Nothing picked yet")
    await click("#fsave")
    expect($("#fmsg").textContent).toMatch(/at least one/)
    await click('[data-tab="surah"]')
    await click('[data-surah="1"]'); await click('[data-surah="114"]')
    expect($("#pcount").textContent).toBe("2 pages")
    await click("#fsave")
    expect(only()).toMatchObject({ type: "hifz", round: "Cycle", ranges: "1, 604" })
  })
  it("hifz run: juz 29 to 30 is pages 562-604, also with An-Nas first", async () => {
    await go("#new/hifz")
    await click('[data-juz="29"]'); await click('[data-juz="30"]')
    expect($("#pcount").textContent).toBe("43 pages")
    await click('[data-dir="-1"]')
    await click("#fsave")
    expect(only()).toMatchObject({ ranges: "562-604", dir: -1, page: 604 })
  })
  it("custom: rejects bad ranges and accepts good ones", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]')
    for (const bad of ["", "0-5", "1-605", "5-1", "x"]) { await type("#fr", bad); await click("#fsave"); expect(app.getState().wirds).toHaveLength(0) }
    await type("#fr", "1-248, 562-604"); await click("#fsave")
    expect(only().ranges).toBe("1-248, 562-604")
  })
  it("trims and caps names, falls back to the type name when empty", async () => {
    await go("#new/khatmah"); await type("#fn", "   "); await click("#fsave")
    expect(only().name).toBe("Khatmah")
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "1-2"); await type("#fn", "x".repeat(200)); await click("#fsave")
    expect(app.getState().wirds[1].name).toHaveLength(40)
  })
  it("daily target is clamped to 0..604 and pairs with sittings", async () => {
    await go("#new/khatmah"); await type("#ft", "99999"); await click("#fsave")
    expect(only().target).toBe(604)
    await go("#new/khatmah"); await type("#ft", "-4"); await click("#fsave")
    expect(app.getState().wirds[1].target).toBe(0)
    await go("#new/khatmah"); await type("#ft", "40"); await click('[data-parts="4"]'); await click("#fsave")
    expect(app.getState().wirds[2]).toMatchObject({ target: 40, parts: 4 })
  })
  it("finish-line chips set a target from the pages ahead", async () => {
    await go("#new/khatmah")
    await click('[data-days="30"]')
    expect(($("#ft") as HTMLInputElement).value).toBe("21")
  })
  it("refuses to create more than 30 wirds", async () => {
    for (let i = 0; i < 31; i++) { await go("#new/khatmah"); await click("#fsave"); if (app.getState().wirds.length === 30) break }
    await go("#new/khatmah"); await click("#fsave")
    expect(app.getState().wirds).toHaveLength(30)
    expect($("#fmsg").textContent).toMatch(/most wirds/)
  })
})

describe("stepping through pages", () => {
  it("+ and - move one page and log today's pages", async () => {
    await makeKhatmah()
    await click("#next"); await click("#next"); await click("#next")
    expect(only().page).toBe(4)
    expect(only().log[dayKey()]).toBe(3)
    await click("#prev")
    expect(only().page).toBe(3)
    expect(only().log[dayKey()]).toBe(2)
  })
  it("cannot go before page 1 on the first cycle, and the log never goes negative", async () => {
    await makeKhatmah()
    await click("#prev")
    expect(only()).toMatchObject({ page: 1, cycle: 1 })
    expect(only().log[dayKey()]).toBeUndefined()
  })
  it("wraps 604 to 1 and counts a completed khatmah, with a celebration toast and undo", async () => {
    await makeKhatmah("604")
    await click("#next")
    expect(only()).toMatchObject({ page: 1, cycle: 2 })
    expect($(".toast").textContent).toMatch(/Khatmah 1 complete/)
    await click(".toast button")
    expect(only()).toMatchObject({ page: 604, cycle: 1 })
  })
  it("stepping back from page 1 of cycle 2 returns to 604 of cycle 1", async () => {
    await makeKhatmah("604"); await click("#next"); await click("#prev")
    expect(only()).toMatchObject({ page: 604, cycle: 1 })
  })
  it("quick +20 moves 20 pages, logs them and offers undo", async () => {
    await makeKhatmah()
    await click('[data-q="20"]')
    expect(only().page).toBe(21)
    expect(only().log[dayKey()]).toBe(20)
    await click(".toast button")
    expect(only().page).toBe(1)
    expect(only().log[dayKey()]).toBeUndefined()
  })
  it("quick +20 across the end wraps and logs exactly 20", async () => {
    await makeKhatmah("600"); await click('[data-q="20"]')
    expect(only()).toMatchObject({ page: 16, cycle: 2 })
    expect(only().log[dayKey()]).toBe(20)
  })
  it("a backwards wird (An-Nas first) steps down through the pages", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "560-604"); await click('[data-dir="-1"]'); await click("#fsave")
    expect(only().page).toBe(604)
    await click("#next")
    expect(only().page).toBe(603)
    expect($("#next").textContent).toBe("−") // the number goes down, so the sign is minus
  })
  it("a hifz wird only visits the memorised pages", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "1-2, 10"); await click("#fsave")
    await click("#next"); await click("#next")
    expect(only().page).toBe(10)
    await click("#next")
    expect(only()).toMatchObject({ page: 1, cycle: 2 })
  })
  it("typing a page: valid, out of bounds, and outside the wird", async () => {
    await makeKhatmah()
    await type("#pg", "77"); expect(only().page).toBe(77)
    await type("#pg", "0"); expect($("#pmsg").textContent).toMatch(/1 to 604/); expect(only().page).toBe(77)
    await type("#pg", "605"); expect(only().page).toBe(77)
    await type("#pg", ""); expect(only().page).toBe(77)
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "10-20"); await click("#fsave")
    await type("#pg", "50"); expect(app.getState().wirds[1].page).toBe(10)
    expect($("#pmsg").textContent).toMatch(/isn't in this wird/)
  })
  it("arrow keys step when nothing is focused", async () => {
    await makeKhatmah()
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))
    expect(only().page).toBe(2)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true }))
    expect(only().page).toBe(2)
  })
})

describe("ayah bookmark and jump", () => {
  it("tapping an ayah bookmarks it, again clears it", async () => {
    await makeKhatmah()
    await click('[data-s="1"][data-a="4"]')
    expect(only().ayah).toEqual([1, 4])
    expect($(".where").textContent).toBe("Stopped at Al-Fatihah 4")
    await click('[data-s="1"][data-a="4"]')
    expect(only().ayah).toBeNull()
  })
  it("moving a page clears the ayah bookmark", async () => {
    await makeKhatmah(); await click('[data-s="1"][data-a="4"]'); await click("#next")
    expect(only().ayah).toBeNull()
  })
  it("jump validates the ayah number against the surah", async () => {
    await makeKhatmah()
    ;($("#js") as HTMLSelectElement).value = "2"
    await type("#ja", "287"); await click("#jgo"); expect($("#jmsg").textContent).toMatch(/286 ayat/)
    await type("#ja", "0"); await click("#jgo"); expect($("#jmsg").textContent).toMatch(/286 ayat/)
    await type("#ja", ""); await click("#jgo"); expect($("#jmsg").textContent).toMatch(/286 ayat/)
    await type("#ja", "255"); await click("#jgo")
    expect(only()).toMatchObject({ page: 42, ayah: [2, 255] })
  })
  it("jump refuses an ayah on a page outside the wird", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "1-2"); await click("#fsave")
    ;($("#js") as HTMLSelectElement).value = "36"; await type("#ja", "1"); await click("#jgo")
    expect($("#jmsg").textContent).toMatch(/isn't in this wird/)
    expect(only().page).toBe(1)
  })
})

describe("weak pages, juz map, sittings", () => {
  it("marks and unmarks weak pages without moving the bookmark", async () => {
    await makeKhatmah("10")
    await click("#weak")
    expect(only().weak).toEqual([10])
    await click("#next"); await click("#weak")
    expect(only().weak).toEqual([10, 11])
    await go("#progress")
    expect($(".wk a").getAttribute("href")).toBe("https://quran.com/page/10")
    await click('[data-unweak="10"]')
    expect(only().weak).toEqual([11])
    expect(only().page).toBe(11)
  })
  it("editing the page set drops weak pages that are no longer part of the wird", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "1-20"); await click("#fsave"); await type("#pg", "15"); await click("#weak")
    expect(only().weak).toEqual([15])
    await go("#w/" + only().id + "/edit"); await type("#fr", "1-10"); await click("#fsave")
    expect(only().weak).toEqual([])
  })
  it("juz map: tapping a juz moves you to its first page, with undo", async () => {
    await makeKhatmah(); await go("#progress")
    await click('[data-jz="562"]')
    expect(only().page).toBe(562)
    expect($$(".jz.here")).toHaveLength(1)
    expect($(".jz.here").textContent).toBe("29")
    expect($$(".jz.done")).toHaveLength(28)
    await click(".toast button")
    expect(only().page).toBe(1)
  })
  it("juz map disables juz that are not in the wird", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "562-604"); await click("#fsave"); await go("#progress")
    expect($$(".jz.out")).toHaveLength(28)
    expect($$(".jz.out").every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
  it("sittings fill as pages are logged against the daily target", async () => {
    await go("#new/khatmah"); await type("#ft", "40"); await click('[data-parts="4"]'); await click("#fsave")
    expect($$(".dots.big i.on")).toHaveLength(0)
    expect($(".sit .hint").textContent).toMatch(/Sitting 1 of 4: 10 more pages/)
    await click('[data-q="10"]')
    expect($$(".dots.big i.on")).toHaveLength(1)
    await click('[data-q="20"]'); await click('[data-q="10"]')
    expect($$(".dots.big i.on")).toHaveLength(4)
    expect($(".sit .hint").textContent).toMatch(/Every sitting done/)
    await click("#back")
    expect($(".hero").className).toContain("met")
  })
})

describe("editing and deleting", () => {
  it("edit keeps position and log, and changing the pages snaps the bookmark forward", async () => {
    await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "1-100"); await click("#fsave"); await type("#pg", "50")
    await go("#w/" + only().id + "/edit"); await type("#fr", "60-100"); await click("#fsave")
    expect(only().page).toBe(60)
    expect(only().ranges).toBe("60-100")
  })
  it("delete needs a second tap and leaves a tombstone", async () => {
    await makeKhatmah()
    const id = only().id
    await go("#w/" + id + "/edit"); await click("#fdel")
    expect(app.getState().wirds).toHaveLength(1)
    await click("#fdel")
    expect(app.getState().wirds).toHaveLength(0)
    expect(app.getState().deleted[id]).toBeGreaterThan(0)
    expect($(".welcome")).toBeTruthy()
  })
  it("an unknown or deleted wird route falls back to home", async () => {
    await go("#w/doesnotexist")
    expect($(".welcome")).toBeTruthy()
    await go("#garbage")
    expect($(".welcome")).toBeTruthy()
  })
})

describe("persistence and corrupt storage", () => {
  it("survives a reload", async () => {
    await makeKhatmah("123"); await click("#next")
    app.destroy()
    app = createWirdApp(root)
    expect(only()).toMatchObject({ page: 124 })
    expect($(".hero, .dial")).toBeTruthy()
  })
  it.each(["not json", "null", "[]", '{"wirds":"x"}', '{"wirds":[1,null,{"id":5}]}'])("starts clean from corrupt storage %j", async (raw) => {
    localStorage.setItem(KEY, raw)
    app.destroy(); app = createWirdApp(root)
    expect(app.getState().wirds).toEqual([])
    expect($(".welcome")).toBeTruthy()
  })
  it("survives localStorage being unavailable for writes", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })
    await expect((async () => { await makeKhatmah(); await click("#next") })()).resolves.toBeUndefined()
    expect(only().page).toBe(2)
    spy.mockRestore()
  })
  it("loads an old (v3) wird without weak, parts or type", async () => {
    const old = { wirds: [{ id: "old1", name: "Hifz wird", round: "Cycle", ranges: "1-248, 562-604", page: 300 + 0, cycle: 4, today: { date: dayKey(), n: 6 }, updatedAt: 5 }] }
    await boot({ ...old, wirds: [{ ...old.wirds[0], page: 100 }] })
    expect(only()).toMatchObject({ type: "hifz", round: "Cycle", page: 100, weak: [], parts: 0 })
    expect(only().log[dayKey()]).toBe(6)
  })
})

describe("security: hostile data", () => {
  it("escapes names, ids and never runs injected markup", async () => {
    await boot({ wirds: [{ id: '"><img src=x onerror="window.__pwned=1">', name: '<img src=x onerror="window.__pwned=1">', ranges: "1-10", type: "custom", page: 1 }] })
    expect((window as any).__pwned).toBeUndefined()
    expect(root.querySelector("img")).toBeNull()
    expect($(".hname").textContent).toContain("<img")
  })
  it("a hostile backup code is cleaned before it is loaded", async () => {
    const bad = { wirds: [{ id: '"><script>window.__pwned=1</script>', name: "<b>x</b>", ranges: "1-3", type: "custom", page: "1<script>", target: "abc" }] }
    await go("#settings")
    ;($("#bk") as HTMLTextAreaElement).value = btoa(unescape(encodeURIComponent(JSON.stringify(bad))))
    await click("#imp"); await click("#imp")
    expect(root.querySelector("script")).toBeNull()
    expect(only().id).toMatch(/^[a-z0-9]+$/)
    expect(only().page).toBe(1)
    expect(only().target).toBe(0)
  })
})

describe("backup and restore", () => {
  it("restore needs a valid code, asks twice, and stamps wirds as newer", async () => {
    await makeKhatmah("77"); await go("#settings")
    await click("#exp")
    const code = ($("#bk") as HTMLTextAreaElement).value
    // wipe, then restore
    app.destroy(); await boot(); await go("#settings")
    ;($("#bk") as HTMLTextAreaElement).value = "garbage"
    await click("#imp"); expect($("#bmsg").textContent).toMatch(/isn't a wird backup/)
    ;($("#bk") as HTMLTextAreaElement).value = btoa(JSON.stringify({ wirds: [] })); await click("#imp")
    expect($("#bmsg").textContent).toMatch(/no usable wirds/)
    ;($("#bk") as HTMLTextAreaElement).value = code
    const before = Date.now()
    await click("#imp"); expect(app.getState().wirds).toHaveLength(0)
    await click("#imp")
    expect(only().page).toBe(77)
    expect(only().updatedAt).toBeGreaterThanOrEqual(before)
  })
  it("restoring tombstones wirds that are not in the backup", async () => {
    await makeKhatmah(); const gone = only().id; await go("#settings")
    ;($("#bk") as HTMLTextAreaElement).value = btoa(JSON.stringify({ wirds: [{ id: "keep1", name: "K", ranges: "1-5", type: "custom", page: 2 }] }))
    await click("#imp"); await click("#imp")
    expect(app.getState().deleted[gone]).toBeGreaterThan(0)
    expect(app.getState().wirds.map((w: any) => w.id)).toEqual(["keep1"])
  })
})

describe("themes", () => {
  it("switching palette and mode is saved and applied", async () => {
    await go("#settings")
    await click('[data-pal="ocean"]')
    expect(state().theme.pal).toBe("ocean")
    expect(document.getElementById("wird-pal")!.textContent).toContain("--bg:#EAF0F4")
    await click('[data-mode="dark"]')
    expect(document.getElementById("wird-pal")!.textContent).toContain("--bg:#0D1720")
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#0D1720")
    expect(document.getElementById("wird-pal")!.textContent).toContain("--motif:")
  })
  it("keeps keyboard focus on the palette button after a re-render", async () => {
    await go("#settings")
    const b = $('[data-pal="rose"]'); b.focus(); b.click()
    expect((document.activeElement as HTMLElement).dataset.pal).toBe("rose")
  })
  it("every palette can be selected", async () => {
    await go("#settings")
    for (const k of $$("[data-pal]").map((b) => b.dataset.pal)) { await click(`[data-pal="${k}"]`); expect(state().theme.pal).toBe(k) }
    expect($$("[data-pal]").length).toBe(8)
  })
})

describe("sync merge entry point", () => {
  it("applyRemote cleans and merges a server copy", async () => {
    await makeKhatmah("10")
    const s = app.getState()
    const remote = { wirds: [{ ...s.wirds[0], page: 200, updatedAt: s.wirds[0].updatedAt + 1000 }, { id: "srv1", name: "From phone", ranges: "1-30", type: "custom", page: 5, updatedAt: 1 }], deleted: {}, updatedAt: s.updatedAt + 1000 }
    app.applyRemote(remote)
    expect(app.getState().wirds).toHaveLength(2)
    expect(app.getState().wirds.find((w: any) => w.id === s.wirds[0].id).page).toBe(200)
    expect(app.getState().wirds.find((w: any) => w.id === "srv1").name).toBe("From phone")
  })
  it("applyRemote ignores junk", async () => {
    await makeKhatmah("10")
    expect(() => { app.applyRemote(null as any); app.applyRemote({ wirds: "x" } as any); app.applyRemote({ wirds: [{ id: 1 }] } as any) }).not.toThrow()
    expect(app.getState().wirds).toHaveLength(1)
  })
})

describe("home summary", () => {
  it("shows today's pages, streak and the week strip", async () => {
    await makeKhatmah(); await click('[data-q="5"]'); await click("#back")
    expect($(".hnum strong").textContent).toBe("6") // no daily goal, so the ring shows the page
    expect($(".streak b").textContent).toBe("1")
    expect($$(".week .on")).toHaveLength(1)
  })
  it("the streak counts yesterday but not a gap", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 30, 12, 0))
    await boot({ wirds: [{ id: "s1", name: "S", ranges: "1-604", type: "khatmah", page: 5, log: { "2026-9-29": 3, "2026-9-28": 3, "2026-9-26": 3 }, updatedAt: 1 }] })
    expect($(".streak b").textContent).toBe("2")
  })
  it("late-night reading before 3am counts for the day before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 30, 1, 30))
    await makeKhatmah(); await click("#next")
    expect(Object.keys(only().log)).toEqual(["2026-9-29"])
  })
})

describe("merge-safe history", () => {
  it("every change to today's count, including undo, is stamped", async () => {
    await makeKhatmah(); await click('[data-q="5"]')
    const k = dayKey(), t1 = only().logAt[k]
    expect(t1).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 5))
    await click(".toast button")
    expect(only().log[k]).toBeUndefined()
    expect(only().logAt[k]).toBeGreaterThan(t1)
  })
  it("a deleted wird is kept hidden, so a later edit elsewhere can bring it back whole", async () => {
    await makeKhatmah("50"); const id = only().id
    await go("#w/" + id + "/edit"); await click("#fdel"); await click("#fdel")
    expect(app.getState().wirds).toHaveLength(0)
    expect(app.getState().gone.map((w: any) => w.id)).toEqual([id])
    expect($(".welcome")).toBeTruthy()
  })
})

describe("picking any mix of ranges", () => {
  it("juz 2-6 and 12-15 in one wird, by tapping", async () => {
    await go("#new/hifz")
    for (const j of [2, 3, 4, 5, 6, 12, 13, 14, 15]) await click(`[data-juz="${j}"]`)
    expect($$(".pk").map((e) => e.firstChild!.textContent)).toEqual(["Juz 2 to 6", "Juz 12 to 15"])
    expect($("#pcount").textContent).toBe("180 pages")
    await click("#fsave")
    expect(only().ranges).toBe("22-121, 222-301")
    expect(only().sel).toEqual({ juz: [2, 3, 4, 5, 6, 12, 13, 14, 15], surah: [], pages: "" })
  })
  it("mixes juz, surahs and pages, and each run can be removed", async () => {
    await go("#new/hifz")
    await click('[data-juz="30"]')
    await click('[data-tab="surah"]'); await click('[data-surah="18"]')
    await click('[data-tab="pages"]'); await type("#fr", "1-3")
    expect($$(".pk").map((e) => e.firstChild!.textContent)).toEqual(["Juz 30", "Al-Kahf", "Pages 1 to 3"])
    await click('[data-run="surah:18:18"]')
    expect($$(".pk").map((e) => e.firstChild!.textContent)).toEqual(["Juz 30", "Pages 1 to 3"])
    await click("#fsave")
    expect(only().ranges).toBe("1-3, 582-604")
  })
  it("a surah run can be added in one go, and search filters the list", async () => {
    await go("#new/hifz"); await click('[data-tab="surah"]')
    ;($("#rf") as HTMLSelectElement).value = "67"; ;($("#rt") as HTMLSelectElement).value = "114"
    await click("#radd")
    expect($$(".pk").map((e) => e.firstChild!.textContent)).toEqual(["Al-Mulk to An-Nas"])
    await type("#sq", "kahf")
    expect($$(".srow").filter((r) => !r.hidden).map((r) => r.dataset.surah)).toEqual(["18"])
  })
  it("editing an old wird made from page ranges shows them as editable runs", async () => {
    await boot({ wirds: [{ id: "old1", name: "Old", type: "hifz", round: "Cycle", ranges: "1-248, 562-604", page: 5, updatedAt: 1, createdAt: 1 }] })
    await go("#w/old1/edit")
    expect($$(".pk").map((e) => e.firstChild!.textContent)).toEqual(["Pages 1 to 248", "Pages 562 to 604"])
  })
  it("old saved selections by juz or surah still load", async () => {
    await boot({ wirds: [{ id: "old2", name: "Old", type: "hifz", ranges: "582-604", sel: { by: "juz", items: [30] }, page: 590, updatedAt: 1, createdAt: 1 }] })
    expect(only().sel).toEqual({ juz: [30], surah: [], pages: "" })
  })
})

describe("today screen", () => {
  it("logs pages straight from the hero, with undo", async () => {
    await makeKhatmah(); await go("")
    await click('[data-q="5"]')
    expect(only().page).toBe(6)
    expect($(".hnum strong").textContent).toBe("6") // no target: the ring shows the page
    await click(".toast button")
    expect(only().page).toBe(1)
  })
  it("switches between wirds and remembers the choice", async () => {
    await makeKhatmah(); await go("#new/custom"); await click('[data-tab="pages"]'); await type("#fr", "5-9"); await click("#fsave"); await go("")
    expect($$(".sp")).toHaveLength(2)
    const first = app.getState().wirds[0].id
    await click(`[data-focus="${first}"]`)
    expect($(".hname").textContent).toBe("Khatmah")
    expect(localStorage.getItem("wird-focus")).toBe(first)
  })
  it("has a tab bar on the main screens only", async () => {
    await makeKhatmah(); await go("")
    expect($(".tabs")).toBeTruthy()
    await go("#progress"); expect($(".tab.on").textContent).toBe("Progress")
    await go("#settings"); expect($(".tab.on").textContent).toBe("Settings")
    await go("#w/" + only().id); expect($(".tabs")).toBeNull()
  })
})
