import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "app.wird.tracker",
  appName: "Wird",
  webDir: "dist",
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_wird", iconColor: "#2F5C4F" },
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
}

export default config
