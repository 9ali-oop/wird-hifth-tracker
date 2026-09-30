// Phone-only features, loaded when running inside the Android (or iOS) app.
import { Capacitor, CapacitorHttp, SystemBars, SystemBarsStyle, registerPlugin } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"
import { Share } from "@capacitor/share"
import { readCalendar } from "./wird/calendar"
import type { NotifStatus, Notifier } from "./wird/notify-web"

const CHANNEL = "reminders"
export const TEST_ID = 1
const map = (s: string): NotifStatus => (s === "granted" ? "granted" : s === "denied" ? "denied" : "default")

// Reminders are handed to the phone, so they arrive with the app closed and survive a restart.
export function nativeNotifier(): Notifier {
  let channel: Promise<void> | null = null
  const ensureChannel = () =>
    (channel ||= LocalNotifications.createChannel({
      id: CHANNEL, name: "Prayer reminders", description: "A nudge to read a few pages around the jamat", importance: 4, visibility: 1, vibration: true,
    }).catch(() => {}))
  let chain: Promise<void> = Promise.resolve()
  return {
    reliable: true,
    horizonMs: 14 * 86400000,
    max: 60,
    async status() { try { return map((await LocalNotifications.checkPermissions()).display) } catch { return "unsupported" } },
    async request() { try { return map((await LocalNotifications.requestPermissions()).display) } catch { return "unsupported" } },
    sync(list) {
      // Serialised, so two quick changes can't interleave their cancel and schedule calls.
      chain = chain
        .then(async () => {
          await ensureChannel()
          const pending = await LocalNotifications.getPending()
          const ours = pending.notifications.filter((n) => n.id !== TEST_ID)
          if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
          if (!list.length) return
          await LocalNotifications.schedule({
            notifications: list.map((r) => ({ id: r.id, title: r.title, body: r.body, channelId: CHANNEL, schedule: { at: new Date(r.at), allowWhileIdle: true } })),
          })
        })
        .catch(() => {})
      return chain
    },
    async test(title, body) {
      try {
        await ensureChannel()
        await LocalNotifications.schedule({ notifications: [{ id: TEST_ID, title, body, channelId: CHANNEL, schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true } }] })
        return true
      } catch { return false }
    },
    exact: Capacitor.getPlatform() === "android"
      ? {
          async status() { try { return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted" ? "granted" : "denied" } catch { return "granted" } },
          async open() { try { await LocalNotifications.changeExactNotificationSetting() } catch {} },
        }
      : undefined,
  }
}

// Native HTTP is not subject to CORS, so the phone can read a calendar link directly. No server involved.
export const fetchCalendar = (url: string) =>
  readCalendar(url, async (u) => {
    const r = await CapacitorHttp.get({ url: u, responseType: "text", headers: { Accept: "text/calendar, text/plain, */*" }, connectTimeout: 15000, readTimeout: 20000 })
    return { status: r.status, data: r.data, url: r.url }
  })

export async function share(text: string): Promise<boolean> {
  try { await Share.share({ text }); return true } catch { return false }
}

export function setBars(dark: boolean) {
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}

// Text shared into the app (Android share sheet > Wird). take() returns a share that arrived before the app loaded.
type ShareInPlugin = { take(): Promise<{ text?: string | null }>; addListener(e: "shared", cb: (d: { text: string }) => void): Promise<unknown> }
const ShareIn = registerPlugin<ShareInPlugin>("ShareIn")
export function onSharedText(cb: (text: string) => void) {
  if (Capacitor.getPlatform() !== "android") return
  ShareIn.take().then((r) => { if (r && r.text) cb(r.text) }).catch(() => {})
  ShareIn.addListener("shared", (d) => { if (d && d.text) cb(d.text) }).catch(() => {})
}
