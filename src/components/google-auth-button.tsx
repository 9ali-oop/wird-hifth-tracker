import { useAuthActions } from "@convex-dev/auth/react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useRef, useState } from "react"
import {
  createGoogleAuthChallenge,
  createGoogleAuthHandoff,
  createGoogleAuthVerifier,
  describeGoogleAuthError,
  takeGoogleAuthHandoff,
  type GoogleAuthHandoffMode,
} from "@/lib/google-auth-handoff"

const POPUP_POLL_INTERVAL_MS = 2_000
const POPUP_TIMEOUT_MS = 10 * 60 * 1000
const POPUP_READY_TIMEOUT_MS = 10_000
const POPUP_READY_MESSAGE = "macaly-google-popup-ready"
const POPUP_START_MESSAGE = "macaly-google-popup-start"

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function openGoogleAuthPopup(): Window | null {
  const width = 520
  const height = 720
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  return window.open(
    "/auth/google/popup",
    "_blank",
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  )
}

function waitForGoogleAuthPopup(authWindow: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage)
      reject(new Error("Google sign-in popup timed out"))
    }, POPUP_READY_TIMEOUT_MS)
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== authWindow ||
        event.data?.type !== POPUP_READY_MESSAGE
      ) {
        return
      }
      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)
      resolve()
    }
    window.addEventListener("message", handleMessage)
  })
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
)

export function GoogleAuthButton({ mode = "sign-in" }: { mode?: GoogleAuthHandoffMode }) {
  const { signIn } = useAuthActions()
  const createAuthorizationUrl = useAction(api.googleAuth.createAuthorizationUrl)
  const getAuthorizationStatus = useAction(api.googleAuth.getAuthorizationStatus)
  const attempt = useRef(0)
  const popup = useRef<Window | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const start = async () => {
    const attemptId = ++attempt.current
    setError(null)
    setLoading(true)
    let authWindow: Window | null = null
    try {
      const flowMode = window.top === window ? "redirect" : "popup"
      // Store the verifier in the initiating context before the first await.
      const handoffChallengePromise = createGoogleAuthHandoff(mode)
      const popupVerifier = flowMode === "popup" ? createGoogleAuthVerifier() : null
      const popupChallengePromise = popupVerifier
        ? createGoogleAuthChallenge(popupVerifier)
        : Promise.resolve(null)
      let popupReady: Promise<void> | null = null
      if (flowMode === "popup") {
        authWindow = openGoogleAuthPopup()
        if (!authWindow) throw new Error("Google sign-in popup was blocked")
        popup.current = authWindow
        popupReady = waitForGoogleAuthPopup(authWindow)
      }
      const [handoffChallenge, popupChallenge] = await Promise.all([
        handoffChallengePromise,
        popupChallengePromise,
      ])
      const authorizationPromise = createAuthorizationUrl({
        appOrigin: window.location.origin,
        handoffChallenge,
        flowMode,
        ...(popupChallenge ? { popupChallenge } : {}),
      })
      const authorization = authWindow
        ? (
            await Promise.all([
              authorizationPromise,
              popupReady ?? Promise.reject(new Error("Google popup failed")),
            ])
          )[0]
        : await authorizationPromise
      if (authWindow && popupVerifier) {
        authWindow.postMessage(
          {
            type: POPUP_START_MESSAGE,
            flowId: authorization.flowId,
            authorizationUrl: authorization.authorizationUrl,
            popupVerifier,
          },
          window.location.origin,
        )
      } else {
        window.location.href = authorization.authorizationUrl
      }
      if (!authWindow) return

      const deadline = Date.now() + POPUP_TIMEOUT_MS
      while (attempt.current === attemptId && Date.now() < deadline) {
        const status = await getAuthorizationStatus({ flowId: authorization.flowId })
        if (status.status === "pending") {
          await wait(POPUP_POLL_INTERVAL_MS)
          continue
        }
        const handoff = takeGoogleAuthHandoff()
        if (status.status === "error") {
          throw new Error(
            status.error === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in failed.",
          )
        }
        if (!handoff) throw new Error("Google sign-in handoff expired.")
        await signIn("macaly-google", {
          grant: status.grant,
          handoffVerifier: handoff.verifier,
          linkToCurrentUser: handoff.mode === "link",
        })
        authWindow.close()
        popup.current = null
        setLoading(false)
        return
      }
      if (attempt.current === attemptId) {
        throw new Error("Google sign-in timed out. Please try again.")
      }
    } catch (caught) {
      if (attempt.current !== attemptId) return
      authWindow?.close()
      popup.current = null
      takeGoogleAuthHandoff()
      setError(describeGoogleAuthError(caught, mode))
      setLoading(false)
    }
  }

  const cancel = () => {
    attempt.current += 1
    popup.current?.close()
    popup.current = null
    takeGoogleAuthHandoff()
    setLoading(false)
    setError(null)
  }

  return (
    <div>
      <button type="button" className="gbtn" onClick={() => void start()} disabled={loading}>
        <GoogleMark />
        {loading ? "Opening Google…" : mode === "link" ? "Link Google account" : "Continue with Google"}
      </button>
      {loading ? (
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="err">
          {error}
        </p>
      ) : null}
    </div>
  )
}
