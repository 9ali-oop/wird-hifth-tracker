import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { getAuthUserId } from "@convex-dev/auth/server"

const MAX_BYTES = 400_000

type GetMineResult =
  | {
      ok: true
      data: string | null
      updatedAt: number
      name: string | null
      email: string | null
      image: string | null
    }
  | { ok: false; code: "UNAUTHENTICATED"; message: string }

// The signed-in user's synced wird state. Ownership comes only from the session.
export const getMine = query({
  args: {},
  handler: async (ctx): Promise<GetMineResult> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false, code: "UNAUTHENTICATED", message: "Sign in to sync" }
    const row = await ctx.db
      .query("wirdStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    const user = await ctx.db.get(userId)
    return {
      ok: true,
      data: row?.data ?? null,
      updatedAt: row?.updatedAt ?? 0,
      name: user?.name ?? null,
      email: user?.email ?? null,
      image: user?.image ?? null,
    }
  },
})

type SaveMineResult =
  | { ok: true }
  | { ok: false; code: "STALE"; message: string; data: string; updatedAt: number }
  | { ok: false; code: "UNAUTHENTICATED" | "TOO_LARGE" | "INVALID"; message: string }

// Saves the whole state. A newer copy on the server is returned instead of being overwritten,
// so the client can merge and try again.
export const saveMine = mutation({
  args: { data: v.string(), updatedAt: v.number() },
  handler: async (ctx, args): Promise<SaveMineResult> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false, code: "UNAUTHENTICATED", message: "Sign in to sync" }
    if (args.data.length > MAX_BYTES) return { ok: false, code: "TOO_LARGE", message: "Too much data to sync" }
    try {
      const parsed = JSON.parse(args.data)
      if (!parsed || !Array.isArray(parsed.wirds)) throw new Error("bad")
    } catch {
      return { ok: false, code: "INVALID", message: "Not a wird state" }
    }
    const row = await ctx.db
      .query("wirdStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (row && row.updatedAt > args.updatedAt) {
      return { ok: false, code: "STALE", message: "A newer copy exists", data: row.data, updatedAt: row.updatedAt }
    }
    if (row) await ctx.db.patch(row._id, { data: args.data, updatedAt: args.updatedAt })
    else await ctx.db.insert("wirdStates", { userId, data: args.data, updatedAt: args.updatedAt })
    return { ok: true }
  },
})
