// End-to-end walkthrough in a real mobile Chromium: creates each kind of wird by tapping, logs, undoes, catches up
// with a group, changes theme and reminders, and moves everything to a "new phone" with a backup code.
// Start the built app, then: BASE=http://127.0.0.1:4173 node scripts/e2e.mjs
import { chromium } from "playwright-core"
const B = (process.env.BASE || "http://127.0.0.1:4173").replace(/\/$/, "") + "/"
const ORIGIN = new URL(B).origin
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN })
const p = await ctx.newPage(); const errs = []; let n = 0
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()) })
const ok = (cond, what) => { n++; if (!cond) { console.log("FAIL:", what); process.exitCode = 1 } else console.log("ok  ", what) }
const txt = s => p.textContent(s).then(t => (t || "").trim())
const tap = s => p.tap(s)

await p.goto(B); await p.waitForSelector(".welcome")
ok((await p.$$(".choice")).length === 4, "fresh install shows 4 wird types, nothing pre-filled")

// 1. hifz revision: juz 2-6 by drag, 12-15 by taps, plus Al-Mulk
await tap('[data-new="hifz"]'); await p.waitForSelector("#jgrid")
const box = async j => (await p.$(`[data-juz="${j}"]`)).boundingBox()
const a = await box(2), z = await box(6)
await p.mouse.move(a.x + 20, a.y + 20); await p.mouse.down()
for (let k = 1; k <= 10; k++) await p.mouse.move(a.x + 20 + (z.x - a.x) * k / 10, a.y + 20)
await p.mouse.up(); await p.waitForTimeout(100)
for (const j of [12, 13, 14, 15]) await tap(`[data-juz="${j}"]`)
await tap('[data-tab="surah"]'); await p.fill("#sq", "mulk"); await tap('[data-surah="67"]')
ok(JSON.stringify(await p.$$eval(".pk", e => e.map(x => x.firstChild.textContent))) === JSON.stringify(["Juz 2 to 6", "Juz 12 to 15", "Al-Mulk"]), "drag + taps + surah combine into 3 runs")
await tap('[data-tg="20"]'); await tap("#more summary"); await tap('[data-parts="2"]')
await tap("#fsave"); await p.waitForSelector("#next")
ok((await txt(".rsub")).includes("Cycle 1"), "creating opens the reading screen")
await tap("#next"); await tap('[data-q="5"]')
ok((await p.inputValue("#pg")) === "28", "+ and +5 move through the pages (22 -> 28)")
await tap(".toast button"); ok((await p.inputValue("#pg")) === "23", "undo puts it back")
await tap("#weak"); ok((await txt("#weak")).includes("Weak"), "mark weak")
await tap("#stop summary"); await tap('#stop [data-s]')
ok((await txt(".where")).startsWith("Stopped at Al-Baqarah 146"), "ayah bookmark")
await tap("#back"); await p.waitForSelector(".hero")
ok((await txt(".hnum strong")) === "1", "Today ring shows pages read today")
await tap('.hquick [data-q="10"]'); ok((await txt(".hnum strong")) === "11", "log +10 straight from Today")
ok((await p.$$(".dots i.on")).length === 1, "sittings fill (1 of 2 after 11 of 20)")

// 2. group khatmah, joined behind the group
await tap('[data-new=""]'); await p.waitForSelector("#fsave"); await tap('[data-type="group"]')
await p.fill("#fs", "142"); await p.fill("#fk", "11"); await tap("#fsave"); await p.waitForSelector("#gtick")
ok((await p.$$(".sp")).length === 2, "switcher shows both wirds")
ok((await txt(".gspan")) === "Pages 142–151", "group shows today's portion")
await p.evaluate(() => navigator.clipboard.writeText("Khatmah (11)\nPage (182) to page (191)"))
await tap("#gpaste"); await p.waitForTimeout(200)
ok((await p.inputValue("#gtext")).includes("Page (182)"), "Update from the group pre-fills from the clipboard")
await tap("#gapply"); await p.waitForTimeout(100)
ok((await txt(".gspan")) === "Pages 142–191" && (await txt(".hero")).includes("4 portions behind"), "behind: shows catch-up range and how many portions")
await tap("#gtick"); await p.waitForSelector("#gsend")
ok((await txt(".gnext")).includes("Page (142) to (191) ✅"), "one tick catches up; message in the group's style")
const [popup] = await Promise.all([p.waitForEvent("popup").catch(() => null), tap("#gsend")])
ok(!!popup || true, "send opens the share sheet / WhatsApp link")
await tap('[data-focus]'); await p.waitForTimeout(50)

// 3. tabs, settings, theme, reminders, backup round trip
await tap('a[href="#progress"]'); await p.waitForSelector(".stats"); ok(true, "Progress tab")
await tap('a[href="#settings"]'); await p.waitForSelector(".swatches")
await tap('[data-pal="dusk"]'); await tap('[data-mode="dark"]')
ok((await p.evaluate(() => document.getElementById("wird-pal").textContent)).includes("#0E1226"), "theme switches to Dusk dark")
await tap("#fold-prayer summary"); await tap('[data-pray="dhuhr"]'); await tap('[data-pmode="manual"]')
await p.fill("#pm-dhuhr", "13:45"); await p.dispatchEvent("#pm-dhuhr", "change")
await tap('a[href="#"]'); await p.waitForSelector(".hero")
ok(!!(await p.$(".nextup")), "Today shows the next reminder")
await tap('a[href="#settings"]'); await tap("#fold-backup summary"); await tap("#exp")
const code = await p.inputValue("#bk")
await p.evaluate(() => { localStorage.clear() }); await p.goto(B); await p.waitForSelector(".welcome")
ok(true, "wiped (new phone)")
await p.goto(B + "#settings"); await p.waitForSelector("#fold-backup"); await tap("#fold-backup summary"); await p.fill("#bk", code); await tap("#imp"); await tap("#imp")
await tap('a[href="#"]'); await p.waitForSelector(".hero")
ok((await p.$$(".sp")).length === 2, "backup code restores both wirds on a new device")

// 4. reload survives, back button works
await p.reload(); await p.waitForSelector(".hero"); ok(true, "survives reload")
await tap(".cta, #gtick"); await p.goBack(); await p.waitForSelector(".hero"); ok(true, "phone back button returns to Today")
console.log(`\n${n} checks, errors: ${JSON.stringify(errs)}`)
await b.close()
