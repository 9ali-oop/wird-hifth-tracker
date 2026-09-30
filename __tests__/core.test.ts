import { afterEach, describe, expect, it, vi } from "vitest"
import { QDATA as Q } from "../src/wird/quran-data"
import { groupDue, parseGroupMessage, tickMessage, portionMessage, cleanWird as cw } from "../src/wird/core"
import {
  ayatOnPage, cleanState, cleanWird, compress, dayKey, daysAgo, juzOf, juzPages, mergeStates, pageEnd, pageOf,
  paceDays, parseRanges, rangeText, selPages, sittingsDone, stableKey, surahPages, targetForDays,
} from "../src/wird/core"

const mk = (over: any = {}) => ({
  id: "abc123", name: "Hifz", type: "hifz", round: "Cycle", ranges: "1-10", dir: 1, target: 0, page: 1,
  ayah: null, cycle: 1, log: {}, createdAt: 1, updatedAt: 1, ...over,
})

afterEach(() => vi.useRealTimers())

describe("Qur'an data integrity (Madani 604 mushaf)", () => {
  it("has 604 pages, 114 surahs and 6236 ayat", () => {
    expect(Q.p).toHaveLength(604)
    expect(Q.n).toHaveLength(114)
    expect(Q.names).toHaveLength(114)
    expect(Q.n.reduce((a, b) => a + b, 0)).toBe(6236)
  })
  it("page starts are strictly increasing and valid ayat", () => {
    for (let i = 0; i < 604; i++) {
      const [s, a] = Q.p[i]
      expect(s).toBeGreaterThanOrEqual(1)
      expect(s).toBeLessThanOrEqual(114)
      expect(a).toBeGreaterThanOrEqual(1)
      expect(a).toBeLessThanOrEqual(Q.n[s - 1])
      if (i) {
        const [ps, pa] = Q.p[i - 1]
        expect(s * 1000 + a).toBeGreaterThan(ps * 1000 + pa)
      }
    }
  })
  it("known anchors: page 1 Fatihah, 2 Baqarah, 50 Al Imran, 582 juz 30, 604 last", () => {
    expect(Q.p[0]).toEqual([1, 1])
    expect(Q.p[1]).toEqual([2, 1])
    expect(Q.p[49]).toEqual([3, 1])
    expect(Q.p[581]).toEqual([78, 1])
    expect(pageOf(114, 1)).toBe(604)
    expect(pageOf(2, 255)).toBe(42) // Ayat al-Kursi
    expect(pageOf(18, 1)).toBe(293) // Al-Kahf
    expect(pageOf(36, 1)).toBe(440) // Ya-Sin
    expect(pageOf(67, 1)).toBe(562) // Al-Mulk, juz 29
  })
  it("every page holds at least one ayah and pages tile the Qur'an with no gap or overlap", () => {
    let total = 0
    for (let p = 1; p <= 604; p++) {
      const g = ayatOnPage(p)
      expect(g.length).toBeGreaterThan(0)
      g.forEach((x) => { expect(x.to).toBeGreaterThanOrEqual(x.from); total += x.to - x.from + 1 })
    }
    expect(total).toBe(6236)
  })
  it("pageOf is the inverse of ayatOnPage for every ayah", () => {
    for (let p = 1; p <= 604; p++) {
      const g = ayatOnPage(p)
      const first = g[0], last = g[g.length - 1]
      expect(pageOf(first.s, first.from)).toBe(p)
      expect(pageOf(last.s, last.to)).toBe(p)
    }
  })
  it("pageEnd of the last page is An-Nas 6", () => {
    expect(pageEnd(604)).toEqual([114, 6])
    expect(rangeText(604)).toContain("An-Nas")
    expect(rangeText(1)).toBe("Al-Fatihah 1 to 7")
  })
})

describe("juz maths", () => {
  it("juz starts on the right page and covers all 604 pages once", () => {
    const seen = new Set<number>()
    for (let j = 1; j <= 30; j++) juzPages(j).forEach((p) => { expect(seen.has(p)).toBe(false); seen.add(p); expect(juzOf(p)).toBe(j) })
    expect(seen.size).toBe(604)
    expect(juzPages(1)[0]).toBe(1)
    expect(juzPages(30)[0]).toBe(582)
    expect(juzPages(30).at(-1)).toBe(604)
  })
  it("juz 29 and 30 are exactly surahs 67 to 114", () => {
    const juz = [...juzPages(29), ...juzPages(30)]
    const surahs = selPages({ by: "surah", items: Array.from({ length: 48 }, (_, i) => 67 + i) })
    // the juz boundary falls between pages, surah 67 starts mid page 562
    expect(juz[0]).toBe(562)
    expect(surahs[0]).toBe(562)
    expect(surahs.at(-1)).toBe(604)
  })
  it("surah page spans are contiguous", () => {
    expect(surahPages(1)).toEqual([1])
    expect(surahPages(2)[0]).toBe(2)
    expect(surahPages(2).at(-1)).toBe(49)
    expect(surahPages(114)).toEqual([604])
    expect(surahPages(112)).toEqual([604])
  })
})

describe("parseRanges / compress boundaries", () => {
  it("accepts good ranges", () => {
    expect(parseRanges("1-3")).toEqual([1, 2, 3])
    expect(parseRanges("1 - 3, 5")).toEqual([1, 2, 3, 5])
    expect(parseRanges("1 to 2")).toEqual([1, 2])
    expect(parseRanges("604")).toEqual([604])
    expect(parseRanges("1-604")).toHaveLength(604)
    expect(parseRanges("5, 3, 3, 1-2")).toEqual([1, 2, 3, 5])
    expect(parseRanges("3–5")).toEqual([3, 4, 5]) // en dash
  })
  it.each(["", "  ", null, undefined, "0", "605", "0-5", "1-605", "5-1", "a", "1-", "-5", "1--5", "1-2-3", "1.5", "-1", "1,,", "١٢", "1;2", "1000", "0604"])(
    "rejects %j", (bad) => {
      const r = parseRanges(bad as any)
      if (bad === "1,,") expect(r).toEqual([1]) // empty parts are ignored
      else expect(r).toBeNull()
    })
  it("compress round trips", () => {
    expect(compress([1, 2, 3, 5, 7, 8])).toBe("1-3, 5, 7-8")
    expect(compress([])).toBe("")
    for (const s of ["1-248, 562-604", "1-604", "7", "1-2, 4-5, 9"]) expect(compress(parseRanges(s)!)).toBe(s)
  })
})

describe("planning helpers", () => {
  it("targetForDays", () => {
    expect(targetForDays(604, 30)).toBe(21)
    expect(targetForDays(604, 29)).toBe(21)
    expect(targetForDays(604, 604)).toBe(1)
    expect(targetForDays(0, 30)).toBe(1)
    expect(targetForDays(604, 0)).toBe(604)
    expect(targetForDays(10, 1)).toBe(10)
  })
  it("sittingsDone", () => {
    expect(sittingsDone(40, 4, 0)).toBe(0)
    expect(sittingsDone(40, 4, 9)).toBe(0)
    expect(sittingsDone(40, 4, 10)).toBe(1)
    expect(sittingsDone(40, 4, 25)).toBe(2)
    expect(sittingsDone(40, 4, 40)).toBe(4)
    expect(sittingsDone(40, 4, 400)).toBe(4)
    expect(sittingsDone(0, 4, 40)).toBe(0)
    expect(sittingsDone(40, 0, 40)).toBe(0)
    expect(sittingsDone(10, 3, 10)).toBe(3) // float safety
  })
})

describe("days and streak keys", () => {
  it("the day rolls over at 3am, not midnight", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 2, 30)) // 02:30
    expect(dayKey()).toBe("2026-9-29")
    vi.setSystemTime(new Date(2026, 8, 30, 3, 5))
    expect(dayKey()).toBe("2026-9-30")
  })
  it("daysAgo crosses month and year ends", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0))
    expect(daysAgo(0)).toBe("2026-1-1")
    expect(daysAgo(1)).toBe("2025-12-31")
    expect(daysAgo(366)).toBe("2024-12-31")
  })
  it("pace is zero without a target, positive when ahead", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0))
    expect(paceDays({ log: {} })).toBe(0)
    expect(paceDays({ target: 10, log: { [daysAgo(0)]: 10 } })).toBe(-6)
    expect(paceDays({ target: 10, log: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [daysAgo(i), 20])) })).toBe(7)
  })
})

describe("cleaning untrusted state", () => {
  it("drops garbage and keeps a valid wird", () => {
    expect(cleanState(null).wirds).toEqual([])
    expect(cleanState("x").wirds).toEqual([])
    expect(cleanState({ wirds: "no" }).wirds).toEqual([])
    expect(cleanState({ wirds: [null, 3, "x", {}] }).wirds).toEqual([])
    expect(cleanState({ wirds: [mk()] }).wirds).toHaveLength(1)
  })
  it("neutralises hostile ids, names and numbers", () => {
    const w = cleanWird(mk({ id: '"><img src=x onerror=alert(1)>', name: "<b>x</b>".repeat(30), page: "9999", target: -5, cycle: 1e12, parts: 99, log: { "2026-9-30": "7", bad: 3, "2026-9-29": -1 } }))!
    expect(w.id).toMatch(/^[a-z0-9]+$/)
    expect(w.name.length).toBeLessThanOrEqual(40)
    expect(w.page).toBe(1) // 9999 clamps to 604, which is outside ranges 1-10, so it falls back to the first page
    expect(w.target).toBe(0)
    expect(w.cycle).toBe(9999)
    expect(w.parts).toBe(8)
    expect(w.log).toEqual({ "2026-9-30": 7 })
  })
  it("recovers a wird whose page is outside its ranges", () => {
    expect(cleanWird(mk({ ranges: "5-10", page: 1 }))!.page).toBe(5)
    expect(cleanWird(mk({ ranges: "5-10", page: 1, dir: -1 }))!.page).toBe(10)
  })
  it("drops a hifz or custom wird with unusable ranges, keeps a khatmah", () => {
    expect(cleanWird(mk({ ranges: "junk" }))).toBeNull()
    expect(cleanWird(mk({ type: "khatmah", round: "Khatmah", ranges: "junk" }))!.ranges).toBe("1-604")
  })
  it("validates ayah, sel and weak pages", () => {
    const w = cleanWird(mk({ ayah: [2, 9999], sel: { by: "surah", items: [1, 1, 999, "2"] }, weak: [1, 1, 3, 99, "x"] }))!
    expect(w.ayah).toBeNull() // Al-Baqarah has 286 ayat, 9999 is rejected
    expect(w.sel).toEqual({ juz: [], surah: [1, 2], pages: "" })
    expect(w.weak).toEqual([1, 3])
    expect(cleanWird(mk({ ayah: [2, 286] }))!.ayah).toEqual([2, 286])
    expect(cleanWird(mk({ ayah: [1, 8] }))!.ayah).toBeNull()
    expect(cleanWird(mk({ ayah: [1, 0] }))!.ayah).toBeNull()
    expect(cleanWird(mk({ ayah: "x" }))!.ayah).toBeNull()
  })
  it("migrates the old today field", () => {
    const w = cleanWird(mk({ today: { date: "2026-9-30", n: 4 } }))!
    expect(w.log).toEqual({ "2026-9-30": 4 })
    expect(w.today).toBeUndefined()
  })
  it("de-duplicates ids and caps the number of wirds", () => {
    expect(cleanState({ wirds: [mk(), mk()] }).wirds).toHaveLength(1)
    const many = Array.from({ length: 80 }, (_, i) => mk({ id: "w" + i }))
    expect(cleanState({ wirds: many }).wirds).toHaveLength(30)
  })
  it("cleans theme and deleted map", () => {
    const s = cleanState({ wirds: [], theme: { pal: "<x>", mode: "purple" }, deleted: { ok1: 5, "bad id": 5, x: "nope" } })
    expect(s.theme).toEqual({ pal: "sage", mode: "auto" })
    expect(s.deleted).toEqual({ ok1: 5 })
  })
  it("trims a very long log to the most recent days", () => {
    const log: any = {}
    for (let i = 0; i < 500; i++) { const d = new Date(2024, 0, 1 + i); log[`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`] = 1 }
    const w = cleanWird(mk({ log }))!
    expect(Object.keys(w.log)).toHaveLength(400)
    expect(w.log["2024-1-1"]).toBeUndefined()
    expect(w.log["2025-5-14"]).toBe(1)
  })
})

describe("merging two devices", () => {
  const A = (over: any = {}) => ({ v: 5, wirds: [mk(over)], deleted: {}, updatedAt: 10 })
  it("newest wird wins for position", () => {
    const m = mergeStates(A({ page: 3, updatedAt: 5 }), A({ page: 7, updatedAt: 9 }))
    expect(m.wirds[0].page).toBe(7)
  })
  it("is symmetric, including on equal timestamps", () => {
    const a = A({ page: 3, updatedAt: 5, name: "x" }), b = A({ page: 7, updatedAt: 5, name: "y" })
    expect(stableKey(mergeStates(a, b))).toBe(stableKey(mergeStates(b, a)))
  })
  it("is idempotent", () => {
    const a = A({ page: 3, log: { "2026-9-30": 4 } }), b = A({ page: 7, updatedAt: 9, log: { "2026-9-29": 2 } })
    const m = mergeStates(a, b)
    expect(stableKey(mergeStates(m, m))).toBe(stableKey(m))
    expect(stableKey(mergeStates(m, a))).toBe(stableKey(m))
  })
  it("keeps days only one side knows about", () => {
    const m = mergeStates(A({ updatedAt: 5, log: { "2026-9-28": 6 } }), A({ updatedAt: 9, log: { "2026-9-29": 2 } }))
    expect(m.wirds[0].log).toEqual({ "2026-9-28": 6, "2026-9-29": 2 })
  })
  it("a lowered count (undo) on the newer device sticks", () => {
    const m = mergeStates(A({ updatedAt: 5, log: { "2026-9-30": 10 } }), A({ updatedAt: 9, log: { "2026-9-30": 4 } }))
    expect(m.wirds[0].log["2026-9-30"]).toBe(4)
  })
  it("keeps wirds that exist on one side only, and respects deletions", () => {
    const a = { v: 5, wirds: [mk({ id: "one" })], deleted: {}, updatedAt: 1 }
    const b = { v: 5, wirds: [mk({ id: "two" })], deleted: {}, updatedAt: 2 }
    expect(mergeStates(a, b).wirds.map((w: any) => w.id).sort()).toEqual(["one", "two"])
    const c = { v: 5, wirds: [], deleted: { one: 50 }, updatedAt: 3 }
    expect(mergeStates(a, c).wirds).toEqual([])
    // recreated after deletion (newer than the tombstone) survives
    const d = { v: 5, wirds: [mk({ id: "one", updatedAt: 99 })], deleted: {}, updatedAt: 99 }
    expect(mergeStates(d, c).wirds).toHaveLength(1)
  })
  it("handles null on either side", () => {
    const a = A()
    expect(mergeStates(null, a)).toBe(a)
    expect(mergeStates(a, null)).toBe(a)
  })
})

describe("group messages", () => {
  it.each([
    ["Khatmah (11)\nPage (232) to page (241)", { khatmah: 11, from: 232, to: 241 }],
    ["Khatma  (1)\nPage (32) to page (41)\nبارك الله في الجميع", { khatmah: 1, from: 32, to: 41 }],
    ["First khatmah \n\nFrom page (22) to page (31)", { khatmah: null, from: 22, to: 31 }],
    ["Page (142) to (191) ✅", { khatmah: null, from: 142, to: 191 }],
    ["pages 10-20", { khatmah: null, from: 10, to: 20 }],
    ["ختمة (٣)\nصفحة (٢٢) الى صفحة (٣١)", { khatmah: 3, from: 22, to: 31 }],
  ])("reads %j", (msg, want) => { expect(parseGroupMessage(msg)).toEqual(want) })
  it.each(["✅", "Where is today's pages", "Page 431", "Page (300) to page (200)", "Page (600) to page (700)", "", null])("ignores %j", (m) => {
    expect(parseGroupMessage(m)).toBeNull()
  })
  it("works out what is due, including catch-up and the end of the mushaf", () => {
    const w = (o: any) => cw({ id: "g1", type: "group", page: 232, cycle: 11, target: 10, ...o })!
    expect(groupDue(w({}))).toMatchObject({ from: 232, to: 241, pages: 10, behind: 0 })
    expect(groupDue(w({ page: 142, groupAt: 182, groupCycle: 11 }))).toMatchObject({ from: 142, to: 191, pages: 50, behind: 4 })
    expect(groupDue(w({ page: 250, groupAt: 182, groupCycle: 11 }))).toMatchObject({ from: 250, to: 259, behind: 0 })
    expect(groupDue(w({ page: 601 }))).toMatchObject({ from: 601, to: 604, pages: 4 })
    expect(groupDue(w({ page: 595, cycle: 10, groupAt: 2, groupCycle: 11 }))).toMatchObject({ from: 595, to: 11, pages: 21, behind: 2 })
  })
  it("words messages the way the group does", () => {
    expect(tickMessage(232, 241, 10)).toBe("✅")
    expect(tickMessage(601, 604, 10)).toBe("✅")
    expect(tickMessage(142, 191, 10)).toBe("Page (142) to (191) ✅")
    expect(portionMessage(11, 242, 251)).toBe("Khatmah (11)\nPage (242) to page (251)")
  })
  it("cleans group fields", () => {
    const g = cw({ id: "g", type: "group", groupAt: 9999, role: "boss", lastTick: { from: "x" } })!
    expect(g).toMatchObject({ ranges: "1-604", target: 10, groupAt: 0, role: "member", lastTick: null })
  })
})
