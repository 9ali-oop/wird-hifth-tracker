// Accessibility audit: renders home, wird and edit screens in every theme (light and dark) in a real Chromium
// and runs axe-core on each. Start the built app first (npm run build && PORT=4173 node .output/server/index.mjs).
// Usage: node scripts/a11y-audit.mjs   (env: BASE=http://127.0.0.1:4173  CHROMIUM=/path/to/chromium)
import { chromium } from "playwright-core"
import fs from "fs"
const BASE = process.env.BASE || "http://127.0.0.1:4173"
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const axeSrc = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8")
const dk = (n) => { const d = new Date(Date.now() - 3 * 3600000); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() }
const now = Date.now()
const mk = (theme) => ({ v: 5, deleted: {}, updatedAt: now, theme, prayer: { mode: "manual", manual: { dhuhr: "13:45", asr: "16:15" }, prayers: ["dhuhr", "asr"], offset: 30, dir: -1, pages: 3, wird: "hifz1", updatedAt: now, days: {}, syncedAt: 0 }, wirds: [
  { id: "hifz1", name: "Hifz cycle", type: "hifz", round: "Cycle", ranges: "1-248, 562-604", sel: { by: "surah", items: [1, 2, 3, 4, 5, 6, 7, 8, 67] }, dir: 1, target: 40, parts: 4, page: 143, ayah: [6, 119], cycle: 7, log: { [dk(0)]: 27, [dk(1)]: 40 }, weak: [12, 143], createdAt: now, updatedAt: now },
  { id: "kh1", name: "Khatmah", type: "khatmah", round: "Khatmah", ranges: "1-604", dir: 1, target: 20, parts: 0, page: 320, ayah: null, cycle: 2, log: { [dk(0)]: 20 }, weak: [], createdAt: now, updatedAt: now } ] })
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
let total = 0
for (const pal of ["sage", "ocean", "rose", "sand", "plum", "dusk", "ember", "mono"]) for (const mode of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: mode })
  const page = await ctx.newPage()
  await page.addInitScript((s) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("wird-bookmarks-v3", JSON.stringify(s)); sessionStorage.setItem("seeded", "1") } }, mk({ pal, mode }))
  await page.goto(BASE + "/"); await page.waitForSelector(".wcard")
  const screens = [["home", null], ["detail", '[data-open="hifz1"]'], ["form", "#edit"]]
  for (const [name, sel] of screens) {
    if (name === "detail") { await page.click(sel); await page.waitForSelector("#next") }
    if (name === "form") { await page.click(sel); await page.waitForSelector("#fsave") }
    await page.evaluate(() => document.querySelectorAll(".wird-app details").forEach(d => (d.open = true)))
    await page.evaluate(axeSrc)
    const res = await page.evaluate(async () => await axe.run(document.querySelector(".wird-app"), { rules: { "region": { enabled: false } } }))
    for (const v of res.violations) { total++; console.log(`[${pal}-${mode}/${name}] ${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" | ")}`) }
    if (pal === "sage" && mode === "light") {
      const small = await page.evaluate(() => [...document.querySelectorAll(".wird-app button, .wird-app a, .wird-app input:not([type=hidden]), .wird-app select, .wird-app summary")].map(e => { const r = e.getBoundingClientRect(); return { t: (e.id || e.className || e.tagName) + ":" + (e.textContent || "").trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) } }).filter(x => (x.w < 32 || x.h < 32) && x.w > 0))
      if (small.length) console.log(`small tap targets on ${name}:`, JSON.stringify(small.slice(0, 12)))
    }
    if (name === "form") { await page.goto(BASE + "/#"); await page.waitForSelector(".wcard") }
  }
  await ctx.close()
}
console.log("violations total:", total)
await browser.close()
process.exit(total ? 1 : 0)
