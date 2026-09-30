# Wird

A small, at-a-glance tracker for your daily Qur'an wird: khatmah, hifz revision cycles, or any set of pages.
It remembers the page you are on in the Madani 604-page mushaf and the ayah you stopped at, and keeps
you consistent with streaks, a five-week map, sittings and prayer-time reminders.

## Features

- **Wirds**: khatmah, hifz cycle (pick memorised surahs or juz) or custom page ranges, forwards or from An-Nas backwards.
- **One-tap logging**: - / + and +2, +5, +10, +20 with undo, arrow keys on a keyboard, ayah bookmark, jump to any ayah.
- **Progress at a glance**: a ring around the page number (today's target, or overall progress), pages to go,
  finish-date estimate with ahead/behind, a 7-day chart, a 5-week consistency map and a tappable juz map.
- **Sittings**: split each day's target into 2 to 4 smaller sittings that fill as you read.
- **Weak pages**: flag a page, open it on quran.com and revise without losing your place.
- **Finish lines**: pick "finish in 10/20/30/60/90 days" and the daily target is worked out for you.
- **Prayer reminders**: read N pages X minutes before or after the jamat of the prayers you choose.
  Jamat times come from a calendar link (athan = event start, iqamah = event end) or are typed in.
  Reminders can be shown as notifications while the app runs, or added to your phone calendar as events with alerts.
- **Themes**: eight palettes (Sage, Ocean, Rose, Sand, Plum, Dusk, Ember, Mono), each with light and dark and its own
  background motif. All pass WCAG contrast.
- **Sync**: sign in with Google to keep every device in step. It works offline and merges when you reconnect.
- **Backup code**: copy/paste backup and restore, no account needed.

## Layout

| Path | What it is |
| --- | --- |
| `src/wird/core.ts` | Pure logic: page/juz maths, date keys, cleaning of untrusted data, the two-device merge |
| `src/wird/prayer.ts` | Pure logic: iCal parsing, jamat times, reminder planning, `.ics` export |
| `src/wird/themes.ts` | Palettes, motifs, contrast helpers |
| `src/wird/app.ts` | The UI (plain DOM, no framework) |
| `src/routes/index.tsx` | Mounts the app and connects sync and the calendar action to Convex |
| `convex/` | Backend: per-user sync (`wird.ts`), Google sign-in, calendar link reader (`prayer.ts`, `lib/calendar.ts`) |
| `__tests__/` | Unit and UI tests (vitest + jsdom) |
| `scripts/a11y-audit.mjs` | axe-core audit of every screen and theme in a real browser |

## Develop

```bash
npm install --legacy-peer-deps
npm run dev            # needs VITE_CONVEX_URL for sync and sign-in; the app itself works without it
npm test               # unit + UI tests
npm run build
npm run audit:a11y     # with the built app running on :4173
```

## Notes on data and privacy

- Everything is stored on the device first. Synced data is one JSON record per signed-in user.
- All data from the server or from a backup code is cleaned (types, bounds, ids, lengths) before use.
- The calendar link is a secret address. It is kept on the device only, never synced or stored on the server.
  The Convex action `prayer.fetchCalendar` reads it for signed-in users, accepts only https links to Google,
  Apple or Outlook calendar hosts, and returns just the next three weeks of events.
- Sync merge: the newest copy of a wird owns its position and day log, so an undo on one device reaches the others.
  Known limit: if one device deletes a wird and another edits it afterwards while offline, a few old day counts on that wird can be lost.

## Hosting

The app was built on Macaly Cloud (TanStack Start + Convex). Google sign-in uses Macaly's auth broker
(`convex/macaly.ts`, `convex/MacalyGoogle.ts`), which needs `MACALY_API_TOKEN`, `MACALY_BASE_URL` and `MACALY_CHAT_ID`
set on the Convex deployment. Moving hosting elsewhere means replacing that sign-in provider.
