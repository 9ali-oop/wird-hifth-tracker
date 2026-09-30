// Notifications. The app hands a notifier the full list of upcoming reminders; the notifier replaces whatever it had.
export type NotifStatus = "granted" | "default" | "denied" | "unsupported"
export type Planned = { id: number; at: number; title: string; body: string }
export type Notifier = {
  /** True when reminders fire with the app closed (scheduled by the phone), false for browser timers. */
  reliable: boolean
  /** How far ahead to schedule, and at most how many (iOS keeps only 64 pending). */
  horizonMs: number
  max: number
  current?(): NotifStatus
  status(): Promise<NotifStatus>
  request(): Promise<NotifStatus>
  sync(list: Planned[]): Promise<void>
  test(title: string, body: string): Promise<boolean>
  /** Android 12+: whether reminders may use exact alarms, and a way to open that setting. */
  exact?: { status(): Promise<"granted" | "denied">; open(): Promise<void> }
}

// In a browser, timers only run while the page is open, so this is best effort and only looks a day ahead.
export function webNotifier(): Notifier {
  let timers: ReturnType<typeof setTimeout>[] = []
  const cur = (): NotifStatus => (typeof Notification === "undefined" ? "unsupported" : (Notification.permission as NotifStatus))
  async function show(title: string, body: string, tag: string): Promise<boolean> {
    const o = { body, tag, icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" } }
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration())
      if (reg && reg.showNotification) { await reg.showNotification(title, o); return true }
    } catch {}
    try { new Notification(title, o); return true } catch { return false }
  }
  return {
    reliable: false,
    horizonMs: 24 * 3600000,
    max: 50,
    current: cur,
    status: async () => cur(),
    async request() { try { await Notification.requestPermission() } catch {} return cur() },
    async sync(list) {
      timers.forEach(clearTimeout)
      timers = []
      if (cur() !== "granted") return
      const now = Date.now()
      for (const r of list) {
        const ms = r.at - now
        if (ms > 0 && ms < 2147483647) timers.push(setTimeout(() => void show(r.title, r.body, "wird-" + r.id), ms))
      }
    },
    test: (title, body) => show(title, body, "wird-test"),
  }
}
