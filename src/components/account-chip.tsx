import { useState } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import { GoogleAuthButton } from "@/components/google-auth-button"

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "offline"

type Profile = { name: string | null; email: string | null; image: string | null } | null

// Small account control that lives in the top-right of the home screen.
export function AccountChip({ status, profile }: { status: SyncStatus; profile: Profile }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signOut } = useAuthActions()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  if (isLoading) {
    return (
      <div className="wird-acct">
        <span className="acct-btn signin" aria-busy="true">
          …
        </span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="wird-acct">
        <button type="button" className="acct-btn signin" aria-expanded={open} onClick={() => setOpen(!open)}>
          Sign in to sync
        </button>
        {open ? (
          <div className="menu" role="dialog" aria-label="Sign in">
            <p>
              <strong>Sync across your devices</strong>
            </p>
            <p className="muted">
              Sign in with Google to keep your wirds on your phone and laptop in step. What you have on this
              device is kept and uploaded.
            </p>
            <GoogleAuthButton />
          </div>
        ) : null}
      </div>
    )
  }

  const label =
    status === "saving" ? "Syncing" : status === "error" ? "Sync issue" : status === "offline" ? "Offline" : "Synced"
  const dot = status === "saving" ? "busy" : status === "error" || status === "offline" ? "off" : ""
  const initial = (profile?.name || profile?.email || "?").trim().charAt(0).toUpperCase()

  return (
    <div className="wird-acct">
      <button type="button" className="acct-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar">
          {profile?.image ? <img src={profile.image} alt="" referrerPolicy="no-referrer" /> : initial}
        </span>
        <span className={"dot " + dot} aria-hidden="true" />
        {label}
      </button>
      {open ? (
        <div className="menu" role="dialog" aria-label="Account">
          {profile?.name ? (
            <p>
              <strong>{profile.name}</strong>
            </p>
          ) : null}
          {profile?.email ? <p className="muted">{profile.email}</p> : null}
          <p className="muted">
            {status === "error"
              ? "The last change didn't reach the server. It's saved on this device and will retry."
              : status === "offline"
                ? "You're offline. Changes are saved here and will sync when you reconnect."
                : "Your wirds are synced to your account."}
          </p>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void signOut().finally(() => {
                setSigningOut(false)
                setOpen(false)
              })
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <p className="muted" style={{ marginTop: 8 }}>
            Signing out keeps your wirds on this device.
          </p>
        </div>
      ) : null}
    </div>
  )
}
