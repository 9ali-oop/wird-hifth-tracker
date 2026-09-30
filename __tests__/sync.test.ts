import { describe, expect, it } from "vitest"
import { cleanState, mergeStates, parseRanges, stableKey } from "../src/wird/core"

// Small seeded PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

const base = () =>
  cleanState({
    wirds: [
      { id: "a1", name: "A", type: "custom", ranges: "1-100", page: 5, target: 10, log: { "2026-9-28": 5 }, updatedAt: 100, createdAt: 1 },
      { id: "b2", name: "B", type: "khatmah", ranges: "1-604", page: 50, log: {}, updatedAt: 100, createdAt: 1 },
    ],
    updatedAt: 100,
  })

// One random user action on a device, stamped with that device's clock.
function act(state: any, r: () => number, clock: { t: number }, allowDelete = true) {
  clock.t += 1 + Math.floor(r() * 50)
  const s = JSON.parse(JSON.stringify(state))
  let pick = Math.floor(r() * 5)
  if (pick === 2 && !allowDelete) pick = 1
  const w = s.wirds.length ? s.wirds[Math.floor(r() * s.wirds.length)] : null
  if (pick === 0 && w) { const pages = parseRanges(w.ranges)!; w.page = pages[Math.floor(r() * pages.length)]; w.updatedAt = clock.t }
  else if (pick === 1 && w) { const k = "2026-9-" + (26 + Math.floor(r() * 5)); w.log[k] = Math.floor(r() * 30); if (!w.log[k]) delete w.log[k]; w.logAt[k] = clock.t; w.updatedAt = clock.t }
  else if (pick === 2 && w) { s.wirds = s.wirds.filter((x: any) => x !== w); s.gone = [w, ...(s.gone || []).filter((x: any) => x.id !== w.id)]; s.deleted[w.id] = clock.t }
  else if (pick === 3) { const id = "n" + Math.floor(r() * 6); if (!s.wirds.find((x: any) => x.id === id)) s.wirds.push({ id, name: id, type: "custom", round: "Round", ranges: "1-10", dir: 1, target: 0, parts: 0, page: 1, ayah: null, cycle: 1, log: {}, logAt: {}, weak: [], sel: null, createdAt: clock.t, updatedAt: clock.t }) }
  else if (w) { w.weak = [...new Set([...(w.weak || []), parseRanges(w.ranges)![0]])].sort((a: number, b: number) => a - b); w.updatedAt = clock.t }
  s.updatedAt = clock.t
  return s
}

describe("sync convergence (randomised)", () => {
  it("merge is commutative and idempotent", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      const cA = { t: 100 }, cB = { t: 100 }
      let A = base(), B = base()
      for (let i = 0; i < 6; i++) { A = act(A, r, cA); B = act(B, r, cB) }
      const ab = mergeStates(A, B), ba = mergeStates(B, A)
      expect(stableKey(ab), `seed ${seed} commutative`).toBe(stableKey(ba))
      expect(stableKey(mergeStates(ab, ab)), `seed ${seed} idempotent`).toBe(stableKey(ab))
      expect(stableKey(mergeStates(ab, A)), `seed ${seed} absorbs A`).toBe(stableKey(ab))
      expect(stableKey(mergeStates(ab, B)), `seed ${seed} absorbs B`).toBe(stableKey(ab))
    }
  })

  it("merge is associative across three devices, deletions included", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed * 7)
      const cs = [{ t: 100 }, { t: 100 }, { t: 100 }]
      let d = [base(), base(), base()]
      for (let i = 0; i < 6; i++) d = d.map((x, k) => act(x, r, cs[k]))
      const l = mergeStates(mergeStates(d[0], d[1]), d[2])
      const rr = mergeStates(d[0], mergeStates(d[1], d[2]))
      const m = mergeStates(mergeStates(d[2], d[0]), d[1])
      expect(stableKey(l), `seed ${seed}`).toBe(stableKey(rr))
      expect(stableKey(m), `seed ${seed} other order`).toBe(stableKey(l))
    }
  })

  it("an edit made after a deletion on another device brings the wird back with every day intact", () => {
    const A = base(), B = JSON.parse(JSON.stringify(A)), C = JSON.parse(JSON.stringify(A))
    A.wirds[0].log["2026-9-27"] = 9; A.wirds[0].logAt["2026-9-27"] = 150; A.wirds[0].updatedAt = 150
    B.gone = [B.wirds[0]]; B.wirds = B.wirds.slice(1); B.deleted.a1 = 200
    C.wirds[0].log["2026-9-29"] = 4; C.wirds[0].logAt["2026-9-29"] = 300; C.wirds[0].updatedAt = 300
    const viaDeletionFirst = mergeStates(mergeStates(A, B), C)
    const w = viaDeletionFirst.wirds.find((x: any) => x.id === "a1")
    expect(w).toBeTruthy()
    expect(w.log).toMatchObject({ "2026-9-27": 9, "2026-9-28": 5, "2026-9-29": 4 })
    expect(stableKey(viaDeletionFirst)).toBe(stableKey(mergeStates(A, mergeStates(B, C))))
  })

  it("three devices syncing through a server in random order all converge", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 31)
      const N = 3
      const cs = Array.from({ length: N }, () => ({ t: 100 }))
      let dev = Array.from({ length: N }, () => base())
      let server: any = null
      const sync = (k: number) => {
        if (server) dev[k] = mergeStates(dev[k], cleanState(server))
        if (!server || stableKey(dev[k]) !== stableKey(server)) server = JSON.parse(JSON.stringify(dev[k]))
      }
      // Interleave offline work with syncs in a random order.
      for (let step = 0; step < 24; step++) {
        const k = Math.floor(r() * N)
        if (r() < 0.6) dev[k] = act(dev[k], r, cs[k], false)
        else sync(k)
      }
      // Finally everyone comes online (twice around so late writers are picked up by everyone).
      for (let round = 0; round < 2; round++) for (let k = 0; k < N; k++) sync(k)
      const keys = dev.map(stableKey)
      expect(keys[1], `seed ${seed}`).toBe(keys[0])
      expect(keys[2], `seed ${seed}`).toBe(keys[0])
      expect(keys[0]).toBe(stableKey(server))
    }
  })

  it("the push/pull loop settles: every device ends up with the same data and stops re-pushing", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed * 13)
      const cs = [{ t: 100 }, { t: 100 }]
      let dev = [base(), base()]
      let server: any = null
      // Each device works offline for a while.
      for (let i = 0; i < 8; i++) { const k = Math.floor(r() * 2); dev[k] = act(dev[k], r, cs[k]) }
      // Then both come online. Mirrors the route: pull -> merge -> push if the merge differs from the server copy.
      let pushes = 0
      for (let round = 0; round < 10; round++) {
        let changed = false
        for (let k = 0; k < 2; k++) {
          if (server) {
            dev[k] = mergeStates(dev[k], cleanState(server))
          }
          if (!server || stableKey(dev[k]) !== stableKey(server)) { server = JSON.parse(JSON.stringify(dev[k])); pushes++; changed = true }
        }
        if (!changed) break
      }
      expect(stableKey(dev[0]), `seed ${seed}`).toBe(stableKey(dev[1]))
      expect(stableKey(dev[0])).toBe(stableKey(server))
      expect(pushes, `seed ${seed} converged in a few pushes`).toBeLessThanOrEqual(6)
    }
  })

  it("an undo on one device reaches the other", () => {
    const A = base(), B = JSON.parse(JSON.stringify(base()))
    A.wirds[0].log["2026-9-30"] = 10; A.wirds[0].logAt["2026-9-30"] = 200; A.wirds[0].updatedAt = 200; A.updatedAt = 200
    const synced = mergeStates(B, A)
    const undone = JSON.parse(JSON.stringify(synced))
    undone.wirds[0].log["2026-9-30"] = 4; undone.wirds[0].logAt["2026-9-30"] = 300; undone.wirds[0].updatedAt = 300; undone.updatedAt = 300
    expect(mergeStates(A, undone).wirds[0].log["2026-9-30"]).toBe(4)
    expect(mergeStates(undone, A).wirds[0].log["2026-9-30"]).toBe(4)
  })

  it("a wird deleted on one device does not come back from a stale copy, but a recreated one does", () => {
    const stale = base()
    const gone = JSON.parse(JSON.stringify(stale))
    gone.wirds = gone.wirds.filter((w: any) => w.id !== "a1"); gone.deleted.a1 = 500; gone.updatedAt = 500
    expect(mergeStates(stale, gone).wirds.map((w: any) => w.id)).toEqual(["b2"])
    const recreated = JSON.parse(JSON.stringify(gone))
    recreated.wirds.push({ ...stale.wirds[0], updatedAt: 900 }); recreated.updatedAt = 900
    expect(mergeStates(stale, recreated).wirds.map((w: any) => w.id).sort()).toEqual(["a1", "b2"])
  })
})
