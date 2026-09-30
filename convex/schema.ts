import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    googleSubject: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("google_subject", ["googleSubject"]),
  // One synced record per user: the whole wird state as JSON, merged on the client.
  wirdStates: defineTable({
    userId: v.id("users"),
    data: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
})
