import { describe, expect, it } from "vitest"
import { PAL, VARS, contrast, themeCss, motifTile } from "../src/wird/themes"

const combos = Object.entries(PAL).flatMap(([k, p]) => [
  [k, "light", p.light],
  [k, "dark", p.dark],
] as [string, string, string[]][])

describe("themes", () => {
  it("every palette has all nine colours as 6-digit hex, in both modes", () => {
    for (const [, , c] of combos) {
      expect(c).toHaveLength(VARS.length)
      c.forEach((x) => expect(x).toMatch(/^#[0-9A-Fa-f]{6}$/))
    }
  })
  it.each(combos)("%s %s: text is readable (WCAG)", (_k, _m, c) => {
    const [bg, surface, ink, muted, , accent, done, doneInk, warn] = c
    expect(contrast(ink, bg)).toBeGreaterThanOrEqual(7)
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(7)
    expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(doneInk, done)).toBeGreaterThanOrEqual(4.5) // selected chips and pressed steppers
    expect(contrast(accent, surface)).toBeGreaterThanOrEqual(4.5) // pills and Arabic wordmark use the accent as text
    expect(contrast(accent, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(warn, bg)).toBeGreaterThanOrEqual(4.5) // error text
    expect(contrast(warn, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(bg, ink)).toBeGreaterThanOrEqual(7) // primary buttons: bg text on ink fill
    expect(contrast(done, surface)).toBeGreaterThanOrEqual(3) // progress bars are graphics
  })
  it("builds css for light, dark and auto", () => {
    expect(themeCss({ pal: "sage", mode: "light" }, true).dark).toBe(false)
    expect(themeCss({ pal: "sage", mode: "dark" }, false).dark).toBe(true)
    expect(themeCss({ pal: "sage", mode: "auto" }, true).dark).toBe(true)
    expect(themeCss({ pal: "sage", mode: "auto" }, false).dark).toBe(false)
  })
  it("falls back to sage for unknown palettes and missing theme", () => {
    expect(themeCss({ pal: "nope" }, false).bg).toBe(PAL.sage.light[0])
    expect(themeCss(undefined, false).bg).toBe(PAL.sage.light[0])
  })
  it("produces a motif for every theme", () => {
    for (const p of Object.values(PAL)) {
      const t = motifTile(p.motif, p.light[5])
      expect(t.image.startsWith("url(")).toBe(true)
      expect(t.size).toBeGreaterThan(0)
    }
  })
})
