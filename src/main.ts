import "@fontsource/figtree/latin-400.css"
import "@fontsource/figtree/latin-800.css"
import "@fontsource/figtree/latin-500.css"
import "@fontsource/figtree/latin-600.css"
import "@fontsource/figtree/latin-700.css"
import "@fontsource/amiri/arabic-400.css"
import "./wird/wird.css"
import { Capacitor } from "@capacitor/core"
import { createWirdApp } from "./wird/app"

async function start() {
  const root = document.getElementById("app")!
  let opts: Record<string, unknown> = {}
  if (Capacitor.isNativePlatform()) {
    const n = await import("./native")
    opts = { native: true, notifier: n.nativeNotifier(), fetchCalendar: n.fetchCalendar, share: n.share, onTheme: n.setBars }
  } else if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {})
  }
  createWirdApp(root, opts)
}

void start()
