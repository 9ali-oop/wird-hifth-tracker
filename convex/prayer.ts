import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { action } from "./_generated/server"
import { filterIcsWindow, normalizeCalendarUrl } from "../src/wird/prayer"

const MAX_BYTES = 5_000_000
const HOST_OK = /^(calendar\.google\.com|outlook\.(office365|live)\.com|outlook\.office\.com|([a-z0-9-]+\.)*icloud\.com)$/i

type FetchResult =
  | { ok: true; ics: string }
  | { ok: false; code: "UNAUTHENTICATED" | "BAD_URL" | "FETCH_FAILED" | "NOT_A_CALENDAR" | "TOO_LARGE"; message: string }

// Reads a calendar link on the server (browsers cannot, because these hosts send no CORS headers) and returns only
// the next three weeks of events. The link itself is never stored here: the app keeps it on the device.
export const fetchCalendar = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<FetchResult> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false, code: "UNAUTHENTICATED", message: "Sign in to read a calendar link" }
    const url = normalizeCalendarUrl(args.url)
    if (!url) return { ok: false, code: "BAD_URL", message: "That does not look like a calendar link from Google, Apple or Outlook." }
    let text: string
    try {
      const res = await fetch(url, { headers: { Accept: "text/calendar, text/plain, */*" } })
      if (!res.ok) return { ok: false, code: "FETCH_FAILED", message: "The calendar link did not work (" + res.status + "). Check the address." }
      if (res.url && !HOST_OK.test(new URL(res.url).hostname)) return { ok: false, code: "BAD_URL", message: "The link redirected somewhere that is not a calendar host." }
      const len = Number(res.headers.get("content-length") || 0)
      if (len > MAX_BYTES) return { ok: false, code: "TOO_LARGE", message: "That calendar is too large to read." }
      text = await res.text()
    } catch {
      return { ok: false, code: "FETCH_FAILED", message: "Could not reach the calendar. Try again in a moment." }
    }
    if (text.length > MAX_BYTES) return { ok: false, code: "TOO_LARGE", message: "That calendar is too large to read." }
    if (!/^\s*BEGIN:VCALENDAR/i.test(text)) return { ok: false, code: "NOT_A_CALENDAR", message: "That address did not return a calendar. Use the secret address in iCal format." }
    const now = Date.now()
    return { ok: true, ics: filterIcsWindow(text, now - 2 * 86400000, now + 21 * 86400000) }
  },
})
