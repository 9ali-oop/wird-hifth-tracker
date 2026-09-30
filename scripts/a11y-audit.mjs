// Accessibility and layout audit: renders every screen in every theme (light and dark) in a real Chromium,
// runs axe-core, and checks nothing overflows sideways on a small (320px) and a normal (390px) phone.
// Start the built app first (npm run build && npx vite preview --port 4173), then: npm run audit:a11y
// Env: BASE=http://127.0.0.1:4173  CHROMIUM=/path/to/chromium
import { chromium } from "playwright-core"
import fs from "fs"
const BASE = (process.env.BASE || "http://127.0.0.1:4173").replace(/\/$/, "") + "/"
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const axeSrc = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8")
const dk = (n) => { const d = new Date(Date.now() - 3 * 3600000); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() }
const now = Date.now()
const seed = (theme) => ({ v: 5, deleted: {}, updatedAt: now, theme,
  prayer: { mode: "manual", manual: { dhuhr: "13:45", asr: "16:15" }, prayers: ["dhuhr", "asr"], offset: 30, dir: -1, pages: 3, updatedAt: now, days: {}, syncedAt: 0 },
  wirds: [
    { id: "hifz1", name: "Hifz revision", type: "hifz", ranges: "22-121, 222-301", sel: { juz: [2, 3, 4, 5, 6, 12, 13, 14, 15], surah: [], pages: "" }, target: 40, parts: 4, page: 43, ayah: [2, 260], cycle: 7, log: { [dk(0)]: 27, [dk(1)]: 40 }, weak: [43], createdAt: 1, updatedAt: now },
    { id: "grp1", name: "Group khatmah", type: "group", ranges: "1-604", target: 10, page: 142, cycle: 11, groupAt: 182, groupCycle: 11, log: {}, createdAt: 2, updatedAt: now },
  ] })
const screens = [
  ["today", "", ".hero"], ["read", "#w/hifz1", "#next"], ["progress", "#progress", ".stats"], ["settings", "#settings", ".swatches"],
  ["edit-juz", "#w/hifz1/edit", "#jgrid"], ["new-group", "#new/group", "#fk"], ["group", "#w/grp1", "#next"],
]
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
let total = 0
for (const pal of ["sage", "ocean", "rose", "sand", "plum", "dusk", "ember", "mono"]) for (const mode of ["light", "dark"]) for (const width of [320, 390]) {
  if (width === 320 && pal !== "sage") continue
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: mode, hasTouch: true })
  const page = await ctx.newPage()
  await page.addInitScript((s) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("wird-bookmarks-v3", JSON.stringify(s)); localStorage.setItem("wird-focus", "hifz1"); sessionStorage.setItem("seeded", "1") } }, seed({ pal, mode }))
  for (const [name, hash, ready] of [...screens, ["today-group", "", ".hero"]]) {
    if (name === "today-group") await page.evaluate(() => localStorage.setItem("wird-focus", "grp1"))
    await page.goto(BASE + (hash || "#")); await page.reload(); await page.waitForSelector(ready)
    await page.evaluate(() => document.querySelectorAll(".wird-app details").forEach((d) => (d.open = true)))
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (over > 0) { total++; console.log(`[${pal}-${mode}@${width}/${name}] sideways overflow ${over}px`) }
    await page.evaluate(axeSrc)
    const res = await page.evaluate(async () => await axe.run(document.querySelector(".wird-app"), { rules: { region: { enabled: false } } }))
    for (const v of res.violations) { total++; console.log(`[${pal}-${mode}@${width}/${name}] ${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`) }
  }
  await ctx.close()
}
console.log("problems total:", total)
await browser.close()
process.exit(total ? 1 : 0)
