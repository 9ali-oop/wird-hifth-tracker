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
  let native: typeof import("./native") | null = null
  if (Capacitor.isNativePlatform()) {
    native = await import("./native")
    opts = { native: true, notifier: native.nativeNotifier(), fetchCalendar: native.fetchCalendar, share: native.share, onTheme: native.setBars }
  } else if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {})
  }
  const app = createWirdApp(root, opts)
  if (native) native.onSharedText((text) => app.receiveShared(text))
}

void start()
