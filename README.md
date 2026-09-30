# Wird

A small, at-a-glance tracker for your daily Qur'an wird: khatmah, hifz revision cycles, or any set of pages.
It remembers the page you are on in the Madani 604-page mushaf and the ayah you stopped at, and keeps
you consistent with streaks, a five-week map, sittings and prayer-time reminders.

It runs as an Android app and as a web app from the same code. Everything is stored on the device.

## Features

- **Wirds**: khatmah, hifz cycle (pick memorised surahs or juz) or custom page ranges, forwards or from An-Nas backwards.
- **One-tap logging**: - / + and +2, +5, +10, +20 with undo, arrow keys on a keyboard, ayah bookmark, jump to any ayah.
- **Progress at a glance**: a ring around the page number, pages to go, finish date with ahead/behind,
  a 7-day chart, a 5-week consistency map and a tappable juz map.
- **Sittings**: split each day's target into 2 to 4 smaller sittings that fill as you read.
- **Weak pages**: flag a page, open it on quran.com and revise without losing your place.
- **Finish lines**: pick "finish in 10/20/30/60/90 days" and the daily target is worked out for you.
- **Prayer reminders**: read N pages X minutes before or after the jamat of the prayers you choose.
  Jamat times come from a calendar link (the app reads it on the phone) or are typed in.
  In the Android app reminders are scheduled on the phone two weeks ahead and arrive with the app closed.
  In a browser they need the page open, so there is also an "add to my calendar" file.
- **Themes**: eight palettes, each with light and dark and its own background pattern, all passing WCAG contrast.
- **Backup code**: copy and paste to back up, restore, or move to another device.

## Sharing with friends (before the Play Store)

- **Android**: send them the `.apk` (from a GitHub release, or the file directly). They open it and allow
  installing from that source when asked. Play Protect may say the developer is unknown; "Install anyway".
  Later builds signed with the same key install as updates and keep their data.
- **iPhone, or anyone else**: the web version on GitHub Pages. In Safari, Share > Add to Home Screen.
  Reminders there need the page open, so the calendar file is the reliable option.

### Moving your wirds from the old Macaly version

Open the old app, Backup code > Show code > Copy. Open the new one, paste it into Backup code, and tap
Restore twice. Reminder settings do the same trip.

## One-time GitHub setup

1. **Web version**: Settings > Pages > Source: **GitHub Actions**. The next push publishes it at
   `https://9ali-oop.github.io/wird-hifth-tracker/`.
2. **Signed Android builds from GitHub** (optional; you can also build locally): add these repository secrets
   under Settings > Secrets and variables > Actions: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Then Actions > CI > Run workflow with "Publish" ticked
   creates a release with the APK. Keep the keystore safe: it is the only way to ship updates that install
   over existing copies.

## Layout

| Path | What it is |
| --- | --- |
| `src/wird/core.ts` | Pure logic: page/juz maths, date keys, cleaning of untrusted data, the two-device merge |
| `src/wird/prayer.ts` | Pure logic: iCal parsing, jamat times, reminder planning, `.ics` export |
| `src/wird/calendar.ts` | Calendar link safety (Google, Apple and Outlook hosts only) and fetching |
| `src/wird/themes.ts` | Palettes, background motifs, contrast helpers |
| `src/wird/notify-web.ts` | The notifier interface and the browser implementation |
| `src/wird/app.ts` | The UI (plain DOM, no framework) |
| `src/native.ts` | Phone-only: scheduled notifications, native HTTP, share sheet, status bar |
| `src/main.ts` | Entry point: picks the web or native platform and mounts the app |
| `android/` | Capacitor Android project (icons, splash, signing config) |
| `__tests__/` | Unit and UI tests (vitest + jsdom) |
| `scripts/a11y-audit.mjs` | axe-core audit of every screen and theme in a real browser |

## Develop

```bash
npm install
npm run dev          # web version on http://localhost:5173
npm test             # unit and UI tests
npm run typecheck
npm run build        # web build in dist/
npm run android:apk  # needs JDK 21 and the Android SDK; signs if android/keystore.properties exists
```

`android/keystore.properties` (never committed) looks like:

```
storeFile=/absolute/path/to/wird-release.jks
storePassword=...
keyAlias=wird
keyPassword=...
```

## Privacy

- No accounts and no analytics. The app makes no third-party requests (fonts are bundled).
- The calendar link is a secret address. It stays on the device and is only used to fetch that calendar.

## Not yet

- **Sync between devices**: the Macaly-hosted sync was removed with the move. The merge logic in `core.ts`
  is kept and tested, ready for a backend we own (the likely choice is Firebase, for native Google and Apple sign-in).
- **iOS app**: the code is ready for Capacitor iOS, but building needs a Mac and an Apple developer account.
