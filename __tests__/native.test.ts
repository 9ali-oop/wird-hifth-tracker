import { beforeEach, describe, expect, it, vi } from "vitest"

const LN = vi.hoisted(() => ({
  pending: [] as { id: number }[],
  scheduled: [] as any[],
  createChannel: vi.fn(async () => {}),
  checkPermissions: vi.fn(async () => ({ display: "prompt" })),
  requestPermissions: vi.fn(async () => ({ display: "granted" })),
  getPending: vi.fn(async () => ({ notifications: LN.pending })),
  cancel: vi.fn(async ({ notifications }: any) => { const ids = notifications.map((n: any) => n.id); LN.pending = LN.pending.filter((p) => !ids.includes(p.id)) }),
  schedule: vi.fn(async ({ notifications }: any) => { LN.scheduled.push(...notifications); LN.pending.push(...notifications.map((n: any) => ({ id: n.id }))) }),
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: "denied" })),
  changeExactNotificationSetting: vi.fn(async () => ({ exact_alarm: "granted" })),
}))
const HTTP = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: LN }))
vi.mock("@capacitor/share", () => ({ Share: { share: vi.fn(async () => ({})) } }))
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
  CapacitorHttp: HTTP,
  SystemBars: { setStyle: vi.fn(async () => {}) },
  SystemBarsStyle: { Dark: "DARK", Light: "LIGHT" },
  registerPlugin: () => SHARE,
}))
const SHARE = vi.hoisted(() => ({ listeners: [] as any[], pending: "Khatmah (11)\nPage (1) to page (10)" as string | null,
  take: vi.fn(async () => { const t = SHARE.pending; SHARE.pending = null; return { text: t } }),
  addListener: vi.fn(async (_e: string, cb: any) => { SHARE.listeners.push(cb) }) }))
import { TEST_ID, fetchCalendar, nativeNotifier, onSharedText } from "../src/native"

const ICS = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260930T120200Z\r\nDTEND:20260930T124500Z\r\nSUMMARY:Dhuhr\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
const at = (m: number) => Date.now() + m * 60000

beforeEach(() => { LN.pending = []; LN.scheduled = []; vi.clearAllMocks() })

describe("native notifier", () => {
  it("maps permission states", async () => {
    const n = nativeNotifier()
    expect(await n.status()).toBe("default")
    expect(await n.request()).toBe("granted")
    LN.checkPermissions.mockResolvedValueOnce({ display: "denied" })
    expect(await n.status()).toBe("denied")
    LN.checkPermissions.mockRejectedValueOnce(new Error("no plugin"))
    expect(await n.status()).toBe("unsupported")
  })
  it("replaces its pending reminders on every sync, on a dedicated channel, allowed while idle", async () => {
    const n = nativeNotifier()
    await n.sync([{ id: 101, at: at(10), title: "a", body: "b" }, { id: 102, at: at(20), title: "c", body: "d" }])
    expect(LN.pending.map((p) => p.id)).toEqual([101, 102])
    await n.sync([{ id: 102, at: at(25), title: "c2", body: "d2" }, { id: 103, at: at(30), title: "e", body: "f" }])
    expect(LN.pending.map((p) => p.id).sort()).toEqual([102, 103])
    const last = LN.scheduled.at(-1)
    expect(last).toMatchObject({ channelId: "reminders", schedule: { allowWhileIdle: true } })
    expect(last.schedule.at).toBeInstanceOf(Date)
    expect(LN.createChannel).toHaveBeenCalledTimes(1)
  })
  it("keeps a test notification that is still pending", async () => {
    const n = nativeNotifier()
    await n.test("t", "b")
    await n.sync([])
    expect(LN.pending.map((p) => p.id)).toEqual([TEST_ID])
  })
  it("serialises overlapping syncs so the last one wins", async () => {
    const n = nativeNotifier()
    const a = n.sync([{ id: 201, at: at(5), title: "", body: "" }])
    const b = n.sync([{ id: 202, at: at(6), title: "", body: "" }])
    await Promise.all([a, b])
    expect(LN.pending.map((p) => p.id)).toEqual([202])
  })
  it("never throws when the plugin fails", async () => {
    LN.getPending.mockRejectedValueOnce(new Error("boom"))
    const n = nativeNotifier()
    await expect(n.sync([{ id: 1, at: at(1), title: "", body: "" }])).resolves.toBeUndefined()
    LN.schedule.mockRejectedValueOnce(new Error("boom"))
    expect(await n.test("a", "b")).toBe(false)
  })
  it("exposes Android's exact alarm setting", async () => {
    const n = nativeNotifier()
    expect(await n.exact!.status()).toBe("denied")
    await n.exact!.open()
    expect(LN.changeExactNotificationSetting).toHaveBeenCalled()
  })
})

describe("native calendar fetch", () => {
  it("reads a Google calendar link with native HTTP", async () => {
    HTTP.get.mockResolvedValueOnce({ status: 200, data: ICS, url: "https://calendar.google.com/calendar/ical/x/basic.ics" })
    const r = await fetchCalendar("webcal://calendar.google.com/calendar/ical/x/basic.ics")
    expect(r.ok).toBe(true)
    expect(HTTP.get).toHaveBeenCalledWith(expect.objectContaining({ url: "https://calendar.google.com/calendar/ical/x/basic.ics", responseType: "text" }))
  })
  it("rejects a non-calendar host without making a request", async () => {
    const r = await fetchCalendar("https://example.com/cal.ics")
    expect(r).toMatchObject({ ok: false })
    expect(HTTP.get).not.toHaveBeenCalled()
  })
})

describe("text shared into the app", () => {
  it("delivers a share that arrived before start-up, then later ones", async () => {
    const got: string[] = []
    onSharedText((t) => got.push(t))
    await new Promise((r) => setTimeout(r, 0))
    expect(got).toEqual(["Khatmah (11)\nPage (1) to page (10)"])
    SHARE.listeners[0]({ text: "Page (11) to page (20)" })
    expect(got).toHaveLength(2)
  })
})
